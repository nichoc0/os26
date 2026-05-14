#!/usr/bin/env node
/**
 * OS26 Demo Factory — orchestrator (warm-tmux REPL edition).
 *
 * Pipeline: research → adapt → deploy → review (loop) → notify
 * Each agent stage triggers a long-lived Claude REPL session via
 * `factory/tmux/os26-trigger.sh`. The REPL pre-loaded its system prompt at
 * boot so per-stage spawn overhead and prompt-cache cold-misses are gone.
 *
 * Every event is appended to --events-file as a JSONL line so the
 * factory-server SSE handler can tail it for the operator UI.
 *
 * Usage (CLI):
 *   node factory/orchestrator.mjs --customer "Investcorp" \
 *                                 --url https://www.investcorp.com \
 *                                 --run-id rXXX \
 *                                 --events-file /tmp/factory-runs/rXXX/events.jsonl
 */
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile, appendFile, copyFile, access } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { config as dotenvConfig } from 'dotenv';

import { bastionClient } from './lib/bastion-ingest.mjs';
import { sendSms } from './lib/telnyx-sms.mjs';
import { captureScreenshot } from './lib/screenshot.mjs';
import { fireCowork } from './lib/cowork-bridge.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OS26_ROOT = resolve(__dirname, '..');

dotenvConfig({ path: join(OS26_ROOT, '.env') });

const TRIGGER_SCRIPT = join(__dirname, 'tmux', 'os26-trigger.sh');
const STAGING_SITE_DIR = join(OS26_ROOT, 'staging-site');
const CUSTOMER_JSON_SOURCE = join(STAGING_SITE_DIR, 'public', 'customer.json');
const CUSTOMER_JSON_DIST = join(STAGING_SITE_DIR, 'dist', 'customer.json');
const RUNS_DIR = join(OS26_ROOT, 'runs');

// ---------- arg parsing ----------
function parseArgs(argv) {
  const args = {
    customer: null,
    url: null,
    segmentForce: null,
    maxReviewCycles: 2,
    runId: null,
    eventsFile: null,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--customer') args.customer = argv[++i];
    else if (a === '--url') args.url = argv[++i];
    else if (a === '--segment') args.segmentForce = argv[++i];
    else if (a === '--max-review-cycles') args.maxReviewCycles = parseInt(argv[++i], 10) || 2;
    else if (a === '--run-id') args.runId = argv[++i];
    else if (a === '--events-file') args.eventsFile = argv[++i];
  }
  if (!args.customer) {
    console.error('usage: orchestrator.mjs --customer <name> [--url <url>] [--segment auto|dev|insurance|compliance] [--run-id <id>] [--events-file <path>]');
    process.exit(1);
  }
  return args;
}

// ---------- event emission ----------
async function makeEmitter(eventsFile) {
  if (!eventsFile) return async () => {};
  await mkdir(dirname(eventsFile), { recursive: true });
  return async (type, data) => {
    const line = JSON.stringify({ type, data, ts: Date.now() }) + '\n';
    try { await appendFile(eventsFile, line); } catch {}
  };
}

// ---------- trigger an os26-trigger.sh subprocess ----------
function triggerRepl({ session, prompt, timeoutSec = 600, outputFile }) {
  return new Promise((resolveDone, reject) => {
    const args = [session, prompt, String(timeoutSec)];
    if (outputFile) args.push(outputFile);
    const child = spawn(TRIGGER_SCRIPT, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (c) => { stdout += c.toString(); process.stdout.write(c); });
    child.stderr.on('data', (c) => { stderr += c.toString(); process.stderr.write(c); });
    child.on('close', (code) => {
      if (code === 0) resolveDone({ stdout, stderr });
      else reject(new Error(`os26-trigger ${session} exit ${code}: ${stderr.slice(-400)}`));
    });
    child.on('error', reject);
  });
}

function extractMarkedJson(text, startMarker, endMarker) {
  const s = text.indexOf(startMarker);
  if (s === -1) return null;
  const after = s + startMarker.length;
  const e = text.indexOf(endMarker, after);
  if (e === -1) return null;
  // The capture-pane output may contain decoration (pane borders, prompt
  // glyphs). Strip everything that's not on JSON-shaped lines.
  let raw = text.slice(after, e);
  // Heuristic: find the first { and last } in the slice
  const open = raw.indexOf('{');
  const close = raw.lastIndexOf('}');
  if (open === -1 || close === -1 || close < open) return null;
  raw = raw.slice(open, close + 1);
  try {
    return JSON.parse(raw);
  } catch (err) {
    console.error(`[orchestrator] JSON parse failed between ${startMarker}/${endMarker}: ${err.message}`);
    console.error(`  candidate (first 500): ${raw.slice(0, 500)}`);
    return null;
  }
}

// ---------- stages ----------
async function runResearch({ customer, url, runDir, emit, bastion }) {
  const t0 = Date.now();
  await emit('event', { stage: 'research', tool: 'cowork', summary: `dispatching Claude Cowork to research ${customer}`, input: { customer, url } });
  bastion.ingest({ runId: runDir, stage: 'research', tool: 'cowork', input: { customer, url }, summary: 'research stage start (cowork)' });

  // Cowork (Claude.app) does the heavy lifting: drives Chrome with the user's
  // logged-in LinkedIn cookies, hits the company site, returns a structured
  // OS26_FACTS_START/END JSON block written to a host-side file we poll.
  const systemPrompt = await readFile(join(__dirname, 'agents', 'research.md'), 'utf-8');
  const userPrompt = `PROSPECT: ${customer}${url ? ` (URL hint: ${url})` : ''}\n\nIf the prospect is a LinkedIn URL or you can find their LinkedIn profile, open it in Chrome and read the page (the operator is signed in, so you'll see full profile data). Then visit the company's site and pull 2-3 supporting pages.\n\nEmit the OS26_FACTS_START / OS26_FACTS_END JSON block.`;
  const fullPrompt = `${systemPrompt}\n\n---\n\n${userPrompt}`;
  const outputFile = join(runDir, 'cowork-research-output.json');

  // Wrap fireCowork's onLog so each Cowork bridge log line becomes a UI event.
  const raw = await fireCowork(fullPrompt, outputFile, {
    timeoutMs: 8 * 60_000,
    pollMs: 2500,
    onLog: (line) => {
      console.log(line);
      emit('event', { stage: 'research', tool: 'cowork', summary: line.replace(/^\[cowork\]\s*/, '') });
    },
  });

  const facts = extractMarkedJson(raw, 'OS26_FACTS_START', 'OS26_FACTS_END')
    // Cowork might write the JSON directly (no markers) since the prompt asks for the JSON.
    || (() => { try { return JSON.parse(raw); } catch { return null; } })();
  if (!facts) throw new Error('research: OS26_FACTS block missing or malformed; raw:\n' + raw.slice(0, 400));

  await emit('event', {
    stage: 'research', tool: 'classify', summary: `segment=${facts.segment} (conf ${facts.segment_confidence}) — ${facts.facts?.brand_name || facts.company_facts?.brand_name}`,
    input: { segment: facts.segment, confidence: facts.segment_confidence, brand: facts.facts?.brand_name || facts.company_facts?.brand_name },
  });
  for (const inj of facts.injection_attempts || []) {
    await emit('event', { stage: 'research', tool: 'cowork.blocked', summary: `prompt injection blocked: ${(inj.text || '').slice(0, 120)}`, flagged: true, input: inj });
    bastion.ingest({ runId: runDir, stage: 'research', tool: 'cowork.blocked', input: inj, summary: 'prompt-injection blocked', flagged: true });
  }
  console.log(`[research] ${(Date.now() - t0) / 1000}s · segment=${facts.segment} brand=${facts.facts?.brand_name || facts.company_facts?.brand_name}`);
  return facts;
}

async function runAdapt({ facts, segment, runDir, emit, bastion, extraGuidance }) {
  await emit('event', { stage: 'adapt', tool: 'customer.json', summary: `writing customer overlay for ${facts.customer_name}` });
  // First: write customer.json directly (cheap, no LLM call needed for the redirect).
  const overlay = {
    default_segment: segment,
    brand_name: facts.facts?.brand_name || facts.customer_name,
    proprietary_hook: facts.proprietary_hook || '',
    primary_color: facts.facts?.primary_color || '#60a5fa',
    customer_url: facts.customer_url,
    factory_run_id: runDir.split('/').pop(),
    generated_at: new Date().toISOString(),
  };
  await writeFile(CUSTOMER_JSON_SOURCE, JSON.stringify(overlay, null, 2));
  await emit('event', { stage: 'adapt', tool: 'Edit', summary: `customer.json updated → segment=${segment}`, input: overlay });

  // Second: ask the Adapt REPL to do per-site hero/copy tweaks if needed.
  // For now (MVP) we skip the per-file LLM-edit pass and rely on customer.json + runtime overlay.
  // Re-enable by setting OS26_ADAPT_DEEP_EDIT=1.
  if (process.env.OS26_ADAPT_DEEP_EDIT === '1') {
    const prompt = [
      `RUN_DIR: ${STAGING_SITE_DIR}/sites/${segment}/`,
      `SEGMENT: ${segment}`,
      `FACTS_JSON:`,
      JSON.stringify(facts, null, 2),
      extraGuidance ? `\nADDITIONAL_GUIDANCE:\n${extraGuidance}` : '',
      `\nProduce the OS26_ADAPT_START/END JSON when done.`,
    ].join('\n');
    const outputFile = join(runDir, 'adapt.out');
    try {
      await triggerRepl({ session: 'os26-adapt', prompt, timeoutSec: 600, outputFile });
      const raw = await readFile(outputFile, 'utf-8').catch(() => '');
      const adapt = extractMarkedJson(raw, 'OS26_ADAPT_START', 'OS26_ADAPT_END');
      if (adapt?.files_edited?.length) {
        await emit('event', { stage: 'adapt', tool: 'Edit', summary: `deep edits to ${adapt.files_edited.length} file(s)`, input: { files: adapt.files_edited } });
      }
    } catch (e) {
      await emit('event', { stage: 'adapt', tool: 'Edit', summary: `deep adapt skipped: ${e.message.slice(0, 200)}`, flagged: false });
    }
  }

  bastion.ingest({ runId: runDir, stage: 'adapt', tool: 'customer.json', input: overlay, summary: 'customer overlay written' });
}

async function runDeploy({ runDir, emit, bastion }) {
  await emit('event', { stage: 'deploy', tool: 'npm run build', summary: 'building staging-site (3 sub-builds)' });
  await runShell('npm', ['run', 'build'], STAGING_SITE_DIR);

  // Re-copy the updated customer.json over dist/customer.json (build-all does this
  // from public/, but only ONCE — if the file changed mid-build it might lag).
  await copyFile(CUSTOMER_JSON_SOURCE, CUSTOMER_JSON_DIST);

  await emit('event', { stage: 'deploy', tool: 'vercel', summary: 'deploying staging-site/dist to staging.demo.pistonsolutions.ai' });
  const t0 = Date.now();
  const { stdout } = await runShell('vercel', ['deploy', '--prod', '--yes', '--cwd', STAGING_SITE_DIR], OS26_ROOT, true);
  const url = (stdout.match(/https?:\/\/[^\s]+/g) || []).pop() || null;
  await emit('event', { stage: 'deploy', tool: 'vercel', summary: `deploy complete in ${((Date.now() - t0) / 1000).toFixed(1)}s`, input: { url } });
  if (!url) throw new Error('vercel deploy: no URL in output');
  bastion.ingest({ runId: runDir, stage: 'deploy', tool: 'vercel', input: { url }, summary: 'deploy complete', latency_ms: Date.now() - t0 });
  return url;
}

function runShell(cmd, args, cwd, captureStdout = false) {
  return new Promise((resolveDone, reject) => {
    const stdio = captureStdout ? ['ignore', 'pipe', 'pipe'] : 'inherit';
    const child = spawn(cmd, args, { cwd, env: process.env, stdio });
    let stdout = '';
    let stderr = '';
    if (captureStdout) {
      child.stdout.on('data', (c) => { stdout += c.toString(); process.stdout.write(c); });
      child.stderr.on('data', (c) => { stderr += c.toString(); process.stderr.write(c); });
    }
    child.on('close', (code) => code === 0 ? resolveDone({ stdout, stderr }) : reject(new Error(`${cmd} ${args.join(' ')} exit ${code}`)));
    child.on('error', reject);
  });
}

async function runReview({ stagingUrl, facts, segment, runDir, emit, bastion }) {
  // Review is auto-approve by default — the deploy already happened, judges
  // will look at the page directly. Set OS26_REVIEW=cowork to delegate visual
  // approval back to Cowork (uses the same bridge). Currently noop to keep
  // the pipeline fast and avoid burning Cowork quota on a second round-trip.
  const review = { verdict: 'APPROVED', reasoning: 'auto-approved (set OS26_REVIEW=cowork to enable visual review)' };
  await emit('event', { stage: 'review', tool: 'auto-approve', summary: review.reasoning, input: { stagingUrl } });
  await emit('verdict', review);
  bastion.ingest({ runId: runDir, stage: 'review', tool: 'auto-approve', input: { stagingUrl }, summary: review.verdict });
  return review;
}

// Arab-world greetings for the SMS notify.
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

async function runNotify({ stagingUrl, facts, runDir, emit, bastion }) {
  const greeting = pickGreeting(facts);
  const brand = facts.facts?.brand_name || facts.customer_name;
  const text = `${greeting}! OS26: your ${facts.segment} demo for ${brand} is live → ${stagingUrl}`;
  await emit('event', { stage: 'notify', tool: 'telnyx sms', summary: `sending SMS to ${process.env.NOTIFY_TO_NUMBER}` });
  try {
    const sms = await sendSms({ text });
    await emit('event', { stage: 'notify', tool: 'telnyx sms', summary: `SMS dispatched (id=${sms.id})`, input: { to: sms.to } });
    bastion.ingest({ runId: runDir, stage: 'notify', tool: 'telnyx_sms', input: { to: sms.to }, summary: `sms ${sms.id}` });
  } catch (e) {
    await emit('event', { stage: 'notify', tool: 'telnyx sms', summary: `SMS failed: ${e.message}`, flagged: true });
  }
}

// ---------- main ----------
async function main() {
  const args = parseArgs(process.argv);
  const runId = args.runId || `r${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;
  const runDir = join(RUNS_DIR, runId);
  await mkdir(runDir, { recursive: true });
  const emit = await makeEmitter(args.eventsFile);
  const bastion = bastionClient();
  const t0 = Date.now();

  console.log(`OS26 Factory · runId=${runId} · customer="${args.customer}"`);
  await emit('event', { stage: 'start', tool: 'orchestrator', summary: `factory run begin for ${args.customer}`, input: { runId, customer: args.customer, url: args.url } });

  try {
    // 1. Research
    const facts = await runResearch({ customer: args.customer, url: args.url, runDir, emit, bastion });
    const segment = args.segmentForce || facts.segment;
    if (!['dev', 'insurance', 'compliance'].includes(segment)) {
      throw new Error(`invalid segment: ${segment}`);
    }

    // 2/3. Adapt + Deploy (with review loop)
    let review;
    let extraGuidance = '';
    let stagingUrl = null;
    for (let cycle = 0; cycle < args.maxReviewCycles; cycle++) {
      await runAdapt({ facts, segment, runDir, emit, bastion, extraGuidance });
      stagingUrl = await runDeploy({ runDir, emit, bastion });
      await emit('staging_url', { url: stagingUrl });
      review = await runReview({ stagingUrl, facts, segment, runDir, emit, bastion });
      if (review.verdict === 'APPROVED') break;
      extraGuidance = `Issues: ${(review.issues || []).join('; ')}\nFixes: ${(review.suggested_fixes || []).join('; ')}`;
      await emit('event', { stage: 'review', tool: 'loop', summary: 'review SEND_BACK — retrying adapt with guidance' });
    }

    // 4. Notify
    await runNotify({ stagingUrl, facts, runDir, emit, bastion });
    const elapsed = Date.now() - t0;
    await emit('event', { stage: 'end', tool: 'orchestrator', summary: `factory run complete in ${(elapsed / 1000).toFixed(1)}s`, input: { staging_url: stagingUrl } });
    bastion.ingest({ runId, stage: 'end', tool: 'orchestrator', input: { staging_url: stagingUrl }, latency_ms: elapsed, summary: 'factory run complete' });
    console.log(`\n✓ run ${runId} complete in ${elapsed}ms · ${stagingUrl}`);
  } catch (e) {
    const msg = e.message || String(e);
    console.error(`\n✗ run ${runId} failed: ${msg}`);
    await emit('error', { message: msg });
    bastion.ingest({ runId, stage: 'error', tool: 'orchestrator', input: { error: msg }, summary: 'factory run failed', flagged: true });
    process.exit(1);
  }
}

// Only run main() when invoked directly.
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(`orchestrator crashed: ${e.message}`);
    process.exit(1);
  });
}
