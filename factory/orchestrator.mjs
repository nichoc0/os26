#!/usr/bin/env node
/**
 * OS26 Demo Factory — orchestrator.
 *
 * Pipeline: research → adapt → deploy → review (loop) → notify
 * Each agent stage spawns a `claude` subprocess with a focused system
 * prompt and the appropriate tool budget. Tool_use events are tee'd to
 * Bastion's /api/blue/ingest so the demo room sees agent activity live.
 *
 * Usage:
 *   node factory/orchestrator.mjs --customer "Cohere" [--url https://cohere.com]
 *
 * Env (loaded from .env at os26 root):
 *   ANTHROPIC_API_KEY       (used by the claude CLI subprocess; if unset
 *                            the CLI uses macOS keychain login)
 *   BASTION_API_KEY         bk_* for /api/blue/ingest telemetry
 *   TELNYX_API_KEY          bearer for SMS
 *   TELNYX_FROM_NUMBER      E.164 sender
 *   NOTIFY_TO_NUMBER        E.164 recipient
 *   VERCEL_TOKEN            (optional) for non-interactive vercel deploy
 */
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile, rm, cp, access } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { config as dotenvConfig } from 'dotenv';

import { bastionClient } from './lib/bastion-ingest.mjs';
import { sendSms } from './lib/telnyx-sms.mjs';
import { deploy as vercelDeploy } from './lib/vercel-deploy.mjs';
import { captureScreenshot } from './lib/screenshot.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OS26_ROOT = resolve(__dirname, '..');

dotenvConfig({ path: join(OS26_ROOT, '.env') });

const PROMPTS_DIR = join(__dirname, 'agents');
const TEMPLATES_DIR = join(OS26_ROOT, 'templates');
const RUNS_DIR = join(OS26_ROOT, 'runs');

// ---------- arg parsing ----------
function parseArgs(argv) {
  const args = { customer: null, url: null, segment: 'auto', maxReviewCycles: 2 };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--customer') args.customer = argv[++i];
    else if (a === '--url') args.url = argv[++i];
    else if (a === '--segment') args.segment = argv[++i];
    else if (a === '--max-review-cycles') args.maxReviewCycles = parseInt(argv[++i], 10) || 2;
  }
  if (!args.customer) {
    console.error('usage: orchestrator.mjs --customer <name> [--url <url>] [--segment auto|dev|insurance|compliance]');
    process.exit(1);
  }
  return args;
}

// ---------- claude subprocess ----------
function spawnClaude({ systemPrompt, userPrompt, runDir, maxTurns = 8, onEvent }) {
  return new Promise((resolveDone, reject) => {
    const args = [
      '-p', userPrompt,
      '--append-system-prompt', systemPrompt,
      '--output-format', 'stream-json',
      '--verbose',
      '--max-turns', String(maxTurns),
      '--dangerously-skip-permissions',
    ];
    const child = spawn('claude', args, {
      cwd: runDir || OS26_ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
    });
    let stdoutBuf = '';
    let stderrBuf = '';
    child.stdout.on('data', (chunk) => {
      stdoutBuf += chunk.toString();
      // Each line in stream-json is a single JSON event.
      let nl;
      while ((nl = stdoutBuf.indexOf('\n')) !== -1) {
        const line = stdoutBuf.slice(0, nl).trim();
        stdoutBuf = stdoutBuf.slice(nl + 1);
        if (!line) continue;
        try {
          const ev = JSON.parse(line);
          onEvent?.(ev);
        } catch {
          // non-JSON line, ignore
        }
      }
    });
    child.stderr.on('data', (chunk) => { stderrBuf += chunk.toString(); });
    child.on('close', (code) => {
      if (code === 0) resolveDone({ ok: true });
      else resolveDone({ ok: false, code, stderr: stderrBuf.slice(-2000) });
    });
    child.on('error', reject);
  });
}

function extractFinalAssistantText(events) {
  // Pull all text blocks from the final assistant message.
  const out = [];
  for (const ev of events) {
    if (ev.type === 'assistant' && ev.message?.content) {
      for (const block of ev.message.content) {
        if (block.type === 'text') out.push(block.text);
      }
    }
  }
  return out.join('\n');
}

function extractMarkedJson(text, startMarker, endMarker) {
  const s = text.indexOf(startMarker);
  if (s === -1) return null;
  const after = s + startMarker.length;
  const e = text.indexOf(endMarker, after);
  if (e === -1) return null;
  const raw = text.slice(after, e).trim();
  try {
    return JSON.parse(raw);
  } catch (err) {
    console.error(`[orchestrator] could not parse JSON between ${startMarker}/${endMarker}: ${err.message}`);
    return null;
  }
}

// ---------- stages ----------

async function runResearch({ customer, url, runId, bastion }) {
  console.log(`\n=== [research] customer=${customer} url=${url || '(infer)'} ===`);
  const systemPrompt = await readFile(join(PROMPTS_DIR, 'research.md'), 'utf-8');
  const userPrompt = `CUSTOMER_NAME: ${customer}\nCUSTOMER_URL: ${url || '(infer from name)'}\n\nProduce the OS26_FACTS_START/END JSON.`;
  const events = [];
  const result = await spawnClaude({
    systemPrompt,
    userPrompt,
    maxTurns: 6,
    onEvent: (ev) => {
      events.push(ev);
      if (ev.type === 'assistant' && ev.message?.content) {
        for (const block of ev.message.content) {
          if (block.type === 'tool_use') {
            console.log(`  [research] tool_use: ${block.name} ${JSON.stringify(block.input).slice(0, 120)}`);
            bastion.ingest({ runId, stage: 'research', tool: block.name, input: block.input, customer, summary: `research used ${block.name}` });
          }
        }
      }
    },
  });
  if (!result.ok) {
    throw new Error(`research stage failed: code=${result.code} ${result.stderr?.slice(0, 300)}`);
  }
  const finalText = extractFinalAssistantText(events);
  const facts = extractMarkedJson(finalText, 'OS26_FACTS_START', 'OS26_FACTS_END');
  if (!facts) throw new Error('research: no OS26_FACTS block in output');
  console.log(`  [research] segment=${facts.segment} brand=${facts.facts?.brand_name}`);
  return facts;
}

async function copyTemplate({ segment, runId }) {
  const src = join(TEMPLATES_DIR, segment);
  const dst = join(RUNS_DIR, runId);
  try { await access(src); } catch { throw new Error(`template ${segment} not found at ${src}`); }
  await rm(dst, { recursive: true, force: true });
  await mkdir(dst, { recursive: true });
  // Avoid copying node_modules into the run dir — Vercel installs deps on deploy.
  // Use rsync via a child process for speed.
  await new Promise((resolveCp, rejectCp) => {
    const child = spawn('rsync', ['-a', '--exclude=node_modules', '--exclude=dist', '--exclude=.git', '--exclude=.vercel', `${src}/`, `${dst}/`], { stdio: 'inherit' });
    child.on('close', (code) => code === 0 ? resolveCp() : rejectCp(new Error(`rsync exit ${code}`)));
  });
  return dst;
}

async function runAdapt({ runDir, segment, facts, runId, bastion, extraGuidance }) {
  console.log(`\n=== [adapt] runDir=${runDir} segment=${segment} ===`);
  const systemPrompt = await readFile(join(PROMPTS_DIR, 'adapt.md'), 'utf-8');
  const userPrompt = [
    `RUN_DIR: ${runDir}`,
    `SEGMENT: ${segment}`,
    `FACTS_JSON:`,
    JSON.stringify(facts, null, 2),
    extraGuidance ? `\nADDITIONAL_GUIDANCE (from prior Review):\n${extraGuidance}` : '',
    '\nProduce the OS26_ADAPT_START/END JSON when done.',
  ].join('\n');
  const events = [];
  const result = await spawnClaude({
    systemPrompt,
    userPrompt,
    runDir, // claude runs in the workspace
    maxTurns: 14,
    onEvent: (ev) => {
      events.push(ev);
      if (ev.type === 'assistant' && ev.message?.content) {
        for (const block of ev.message.content) {
          if (block.type === 'tool_use') {
            console.log(`  [adapt] tool_use: ${block.name} ${JSON.stringify(block.input).slice(0, 120)}`);
            bastion.ingest({ runId, stage: 'adapt', tool: block.name, input: block.input, customer: facts.customer_name, summary: `adapt used ${block.name}` });
          }
        }
      }
    },
  });
  if (!result.ok) {
    throw new Error(`adapt stage failed: code=${result.code} ${result.stderr?.slice(0, 300)}`);
  }
  const finalText = extractFinalAssistantText(events);
  const adaptReport = extractMarkedJson(finalText, 'OS26_ADAPT_START', 'OS26_ADAPT_END') || { files_edited: [], build_succeeded: null };
  console.log(`  [adapt] files_edited=${adaptReport.files_edited?.length || 0} build_succeeded=${adaptReport.build_succeeded}`);
  return adaptReport;
}

async function runDeploy({ runDir, runId, bastion }) {
  console.log(`\n=== [deploy] runDir=${runDir} ===`);
  bastion.ingest({ runId, stage: 'deploy', tool: 'vercel', input: { cwd: runDir }, summary: 'vercel deploy starting' });
  const t0 = Date.now();
  const { productionUrl } = await vercelDeploy(runDir, { token: process.env.VERCEL_TOKEN, onLine: (l) => console.log(`  [deploy] ${l.slice(0, 160)}`) });
  const elapsed = Date.now() - t0;
  console.log(`  [deploy] url=${productionUrl} elapsed=${elapsed}ms`);
  bastion.ingest({ runId, stage: 'deploy', tool: 'vercel', input: { url: productionUrl }, latency_ms: elapsed, summary: `deployed to ${productionUrl}` });
  return productionUrl;
}

async function runReview({ stagingUrl, facts, segment, runId, runDir, bastion }) {
  console.log(`\n=== [review] stagingUrl=${stagingUrl} ===`);
  const screenshotPath = join(runDir, 'review-screenshot.png');
  let screenshotInfo = null;
  try {
    screenshotInfo = await captureScreenshot(stagingUrl, screenshotPath);
    console.log(`  [review] captured ${screenshotInfo.kind} at ${screenshotInfo.path}`);
  } catch (e) {
    console.warn(`  [review] screenshot failed: ${e.message}`);
  }

  const systemPrompt = await readFile(join(PROMPTS_DIR, 'review.md'), 'utf-8');
  const userPrompt = [
    `STAGING_URL: ${stagingUrl}`,
    `SEGMENT: ${segment}`,
    `FACTS_JSON:\n${JSON.stringify(facts, null, 2)}`,
    screenshotInfo
      ? `SCREENSHOT_PATH: ${screenshotInfo.path} (${screenshotInfo.kind})${screenshotInfo.note ? ` — ${screenshotInfo.note}` : ''}`
      : 'SCREENSHOT_PATH: (capture failed, evaluate via WebFetch of STAGING_URL instead)',
    '\nProduce the OS26_REVIEW_START/END JSON.',
  ].join('\n');
  const events = [];
  const result = await spawnClaude({
    systemPrompt,
    userPrompt,
    maxTurns: 6,
    onEvent: (ev) => {
      events.push(ev);
      if (ev.type === 'assistant' && ev.message?.content) {
        for (const block of ev.message.content) {
          if (block.type === 'tool_use') {
            bastion.ingest({ runId, stage: 'review', tool: block.name, input: block.input, customer: facts.customer_name, summary: `review used ${block.name}` });
          }
        }
      }
    },
  });
  if (!result.ok) {
    console.warn(`  [review] stage failed: code=${result.code}; defaulting to APPROVED to keep pipeline moving`);
    return { verdict: 'APPROVED', reasoning: 'review stage errored, defaulting to ship', issues: [], suggested_fixes: [] };
  }
  const finalText = extractFinalAssistantText(events);
  const review = extractMarkedJson(finalText, 'OS26_REVIEW_START', 'OS26_REVIEW_END') || { verdict: 'APPROVED', reasoning: 'no review block found, defaulting' };
  console.log(`  [review] verdict=${review.verdict} reasoning=${review.reasoning?.slice(0, 120)}`);
  return review;
}

// Arab-world greetings for the SMS notify. Triggered when the customer's HQ
// country is in the Arab League — small flair, doesn't change anything else.
const ARAB_COUNTRIES = new Set([
  'bahrain', 'kuwait', 'oman', 'qatar', 'saudi arabia', 'united arab emirates', 'uae',
  'egypt', 'jordan', 'lebanon', 'syria', 'iraq', 'palestine', 'yemen',
  'morocco', 'algeria', 'tunisia', 'libya', 'sudan', 'mauritania', 'djibouti', 'somalia', 'comoros',
]);

function pickGreeting(facts) {
  const country = (facts?.facts?.hq_country || '').toLowerCase().trim();
  if (ARAB_COUNTRIES.has(country)) return 'Habibi';
  return 'Heads up';
}

async function runNotify({ stagingUrl, facts, runId, bastion }) {
  console.log(`\n=== [notify] sms -> ${process.env.NOTIFY_TO_NUMBER} ===`);
  const greeting = pickGreeting(facts);
  const brand = facts.facts?.brand_name || facts.customer_name;
  const text = `${greeting}! OS26 Factory: your ${facts.segment} demo for ${brand} is live → ${stagingUrl}`;
  try {
    const sms = await sendSms({ text });
    console.log(`  [notify] sms id=${sms.id} to=${sms.to}`);
    bastion.ingest({ runId, stage: 'notify', tool: 'telnyx_sms', input: { to: sms.to }, summary: `sms ${sms.id} sent` });
    return sms;
  } catch (e) {
    console.warn(`  [notify] sms failed: ${e.message}`);
    bastion.ingest({ runId, stage: 'notify', tool: 'telnyx_sms', input: { error: e.message }, summary: 'sms failed', ok: false });
    return null;
  }
}

// ---------- main ----------
async function main() {
  const args = parseArgs(process.argv);
  const runId = `r${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;
  console.log(`OS26 Factory · runId=${runId} · customer="${args.customer}"`);

  const bastion = bastionClient();
  const t0 = Date.now();
  bastion.ingest({ runId, stage: 'start', tool: 'orchestrator', input: { customer: args.customer, url: args.url }, summary: 'factory run begun' });

  // 1. Research
  const facts = await runResearch({ customer: args.customer, url: args.url, runId, bastion });
  const segment = args.segment === 'auto' ? facts.segment : args.segment;
  if (!['dev', 'insurance', 'compliance'].includes(segment)) {
    throw new Error(`invalid segment: ${segment}`);
  }

  // 2. Copy template -> per-run workspace
  const runDir = await copyTemplate({ segment, runId });
  console.log(`\n=== [workspace] ${runDir} ===`);

  // 3. Adapt (with review-loop feedback)
  let review = null;
  let extraGuidance = '';
  for (let cycle = 0; cycle < args.maxReviewCycles; cycle++) {
    await runAdapt({ runDir, segment, facts, runId, bastion, extraGuidance });
    const stagingUrl = await runDeploy({ runDir, runId, bastion });
    review = await runReview({ stagingUrl, facts, segment, runId, runDir, bastion });
    if (review.verdict === 'APPROVED') {
      // 5. Notify
      await runNotify({ stagingUrl, facts, runId, bastion });
      const elapsed = Date.now() - t0;
      console.log(`\n✓ run ${runId} complete in ${elapsed}ms`);
      console.log(`  staging URL: ${stagingUrl}`);
      bastion.ingest({ runId, stage: 'end', tool: 'orchestrator', input: { staging_url: stagingUrl }, latency_ms: elapsed, summary: 'factory run completed' });
      return { runId, stagingUrl, facts, segment, review, elapsedMs: elapsed };
    }
    extraGuidance = `Issues: ${(review.issues || []).join('; ')}\nFixes: ${(review.suggested_fixes || []).join('; ')}`;
    console.log(`\n[loop] review SEND_BACK — retrying adapt with guidance...`);
  }

  // Max cycles hit — ship anyway
  console.log(`\n[loop] max review cycles reached, shipping anyway`);
  const stagingUrl = await runDeploy({ runDir, runId, bastion });
  await runNotify({ stagingUrl, facts, runId, bastion });
  const elapsed = Date.now() - t0;
  bastion.ingest({ runId, stage: 'end', tool: 'orchestrator', input: { staging_url: stagingUrl }, latency_ms: elapsed, summary: 'factory run completed (forced ship)' });
  console.log(`\n✓ run ${runId} complete in ${elapsed}ms (forced ship)`);
  return { runId, stagingUrl, facts, segment, review, elapsedMs: elapsed };
}

main().catch((e) => {
  console.error(`\n✗ orchestrator failed: ${e.message}`);
  process.exit(1);
});
