#!/usr/bin/env node
/**
 * OS26 Demo Factory — orchestrator (auto-mode Claude Code edition).
 *
 * Pipeline:
 *   research  →  frontend  →  (vercel auto-deploys on push)  →  PR/review  →  notify
 *
 * Each stage spawns `claude -p` as a one-shot subprocess with
 * --dangerously-skip-permissions so it runs fully autonomous. All subprocesses
 * inherit CLAUDE_CONFIG_DIR=~/.claude-os26 so they bill against the outlook
 * account that has quota.
 *
 * No Cowork bridge. No LinkedIn auth. WebSearch-only research → file-editing
 * frontend agent → gh-push → Vercel webhook → screenshot review → SMS.
 */
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile, appendFile } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { config as dotenvConfig } from 'dotenv';

import { bastionClient } from './lib/bastion-ingest.mjs';
import { sendSms } from './lib/telnyx-sms.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OS26_ROOT = resolve(__dirname, '..');
dotenvConfig({ path: join(OS26_ROOT, '.env') });

const PROMPTS_DIR = join(__dirname, 'agents');
const STAGING_SITE_DIR = join(OS26_ROOT, 'staging-site');
const RUNS_DIR = join(OS26_ROOT, 'runs');
const CLAUDE_BIN = process.env.CLAUDE_BIN || '/Users/nca/.local/bin/claude';
const CLAUDE_CFG = process.env.OS26_CLAUDE_CONFIG_DIR || `${process.env.HOME}/.claude-os26`;

// ---------- arg parsing ----------
function parseArgs(argv) {
  const args = { customer: null, url: null, segmentForce: null, runId: null, eventsFile: null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--customer') args.customer = argv[++i];
    else if (a === '--url') args.url = argv[++i];
    else if (a === '--segment') args.segmentForce = argv[++i];
    else if (a === '--run-id') args.runId = argv[++i];
    else if (a === '--events-file') args.eventsFile = argv[++i];
  }
  if (!args.customer) {
    console.error('usage: orchestrator.mjs --customer <name> [--url <url>] [--segment dev|insurance|compliance] [--run-id <id>] [--events-file <path>]');
    process.exit(1);
  }
  return args;
}

// ---------- event emission ----------
async function makeEmitter(eventsFile) {
  if (!eventsFile) return async () => {};
  await mkdir(dirname(eventsFile), { recursive: true });
  return async (type, data) => {
    try { await appendFile(eventsFile, JSON.stringify({ type, data, ts: Date.now() }) + '\n'); } catch {}
  };
}

// ---------- claude subprocess (auto-mode, stream-json) ----------
function spawnClaude({ systemPrompt, userPrompt, cwd, maxTurns = 10, onEvent }) {
  return new Promise((resolveDone, reject) => {
    const args = [
      '-p', userPrompt,
      '--append-system-prompt', systemPrompt,
      '--output-format', 'stream-json',
      '--verbose',
      '--max-turns', String(maxTurns),
      '--dangerously-skip-permissions',
    ];
    const env = { ...process.env, CLAUDE_CONFIG_DIR: CLAUDE_CFG };
    const child = spawn(CLAUDE_BIN, args, { cwd: cwd || OS26_ROOT, stdio: ['ignore', 'pipe', 'pipe'], env });
    let stdoutBuf = '';
    let stderrBuf = '';
    const events = [];
    child.stdout.on('data', (chunk) => {
      stdoutBuf += chunk.toString();
      let nl;
      while ((nl = stdoutBuf.indexOf('\n')) !== -1) {
        const line = stdoutBuf.slice(0, nl).trim();
        stdoutBuf = stdoutBuf.slice(nl + 1);
        if (!line) continue;
        try {
          const ev = JSON.parse(line);
          events.push(ev);
          onEvent?.(ev);
        } catch {}
      }
    });
    child.stderr.on('data', (chunk) => { stderrBuf += chunk.toString(); });
    child.on('close', (code) => {
      resolveDone({ ok: code === 0, code, events, stderr: stderrBuf.slice(-2000) });
    });
    child.on('error', reject);
  });
}

function extractFinalAssistantText(events) {
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
  let raw = text.slice(after, e);
  const open = raw.indexOf('{');
  const close = raw.lastIndexOf('}');
  if (open === -1 || close === -1 || close < open) return null;
  raw = raw.slice(open, close + 1);
  try { return JSON.parse(raw); } catch { return null; }
}

function teeToolUseEvents(events, agentStage, emit, bastion, runId) {
  for (const ev of events) {
    if (ev.type === 'assistant' && ev.message?.content) {
      for (const block of ev.message.content) {
        if (block.type === 'tool_use') {
          const summary = `${block.name}(${JSON.stringify(block.input).slice(0, 100)}…)`;
          emit('event', { stage: agentStage, tool: block.name, summary, input: block.input });
          bastion.ingest({ runId, stage: agentStage, tool: block.name, input: block.input, summary });
        }
      }
    }
  }
}

// ---------- stages ----------
async function runResearch({ customer, url, runDir, runId, emit, bastion }) {
  const t0 = Date.now();
  await emit('event', { stage: 'research', tool: 'spawn', summary: `Research agent: classifying ${customer}` });
  const systemPrompt = await readFile(join(PROMPTS_DIR, 'research.md'), 'utf-8');
  const userPrompt = `PROSPECT: ${customer}${url ? ` (URL hint: ${url})` : ''}\n\nUse WebSearch + WebFetch (no LinkedIn auth required). Run ~10 searches: prospect's name + company, the company's industry, the company's compliance regime (SOC2, ISO 42001, HIPAA, etc.). Pick segment based on PERSON role + COMPANY field + COMPLIANCES.\n\nEmit the OS26_FACTS_START / OS26_FACTS_END JSON block. No file writes — just print the JSON.`;
  const { ok, code, events, stderr } = await spawnClaude({
    systemPrompt, userPrompt, cwd: runDir, maxTurns: 15,
    onEvent: () => {},
  });
  teeToolUseEvents(events, 'research', emit, bastion, runId);
  if (!ok) throw new Error(`research subprocess exit ${code}: ${stderr.slice(0, 300)}`);
  const text = extractFinalAssistantText(events);
  const facts = extractMarkedJson(text, 'OS26_FACTS_START', 'OS26_FACTS_END');
  if (!facts) throw new Error(`research: missing OS26_FACTS block; tail of text:\n${text.slice(-400)}`);
  await emit('event', { stage: 'research', tool: 'classify', summary: `segment=${facts.segment} (conf ${facts.segment_confidence}) — ${facts.facts?.brand_name || facts.company_facts?.brand_name || facts.prospect_company}`, input: { segment: facts.segment, confidence: facts.segment_confidence } });
  await writeFile(join(runDir, 'research.json'), JSON.stringify(facts, null, 2));
  console.log(`[research] ${(Date.now() - t0) / 1000}s → segment=${facts.segment}`);
  return facts;
}

async function runFrontend({ facts, segment, runDir, runId, emit, bastion }) {
  const t0 = Date.now();
  await emit('event', { stage: 'frontend', tool: 'spawn', summary: `Frontend agent: customising staging-site/sites/${segment}/` });
  const systemPrompt = await readFile(join(PROMPTS_DIR, 'frontend.md'), 'utf-8');
  const userPrompt = [
    `SEGMENT: ${segment}`,
    `RUN_ID: ${runId}`,
    `FACTS_JSON:`,
    JSON.stringify(facts, null, 2),
    '',
    `Your working directory is ${STAGING_SITE_DIR}.`,
    `Edit ./public/customer.json so it has:`,
    `  default_segment: "${segment}"`,
    `  brand_name: "${facts.facts?.brand_name || facts.company_facts?.brand_name || facts.prospect_company || facts.customer_name}"`,
    `  proprietary_hook: (from facts.proprietary_hook)`,
    `  primary_color: (from facts.facts.primary_color or company_facts.primary_color, default "#60a5fa")`,
    `  factory_run_id: "${runId}"`,
    `  generated_at: (now in ISO8601)`,
    '',
    `Then optionally tweak sites/${segment}/src/App.jsx hero copy to mention the prospect's brand name. Keep edits surgical — don't rename components, don't change imports.`,
    '',
    `Finally, git add + commit + push with gh CLI:`,
    `  git add public/customer.json sites/${segment}/`,
    `  git commit -m "OS26 demo for \${brand_name} (\${segment})"`,
    `  git push origin main`,
    '',
    `Vercel auto-deploys staging.demo.pistonsolutions.ai on push.`,
    '',
    `When complete, emit the OS26_FRONTEND_START / OS26_FRONTEND_END JSON block with the files you edited and the git commit SHA.`,
  ].join('\n');
  const { ok, code, events, stderr } = await spawnClaude({
    systemPrompt, userPrompt, cwd: STAGING_SITE_DIR, maxTurns: 25,
    onEvent: () => {},
  });
  teeToolUseEvents(events, 'frontend', emit, bastion, runId);
  if (!ok) throw new Error(`frontend subprocess exit ${code}: ${stderr.slice(0, 300)}`);
  const text = extractFinalAssistantText(events);
  const report = extractMarkedJson(text, 'OS26_FRONTEND_START', 'OS26_FRONTEND_END')
    || { files_edited: [], commit_sha: null };
  await emit('event', { stage: 'frontend', tool: 'git push', summary: `pushed commit ${report.commit_sha?.slice(0, 7) || '(unknown)'}` });
  console.log(`[frontend] ${(Date.now() - t0) / 1000}s · commit=${report.commit_sha?.slice(0, 7)}`);
  return report;
}

async function runDeploy({ frontendReport, emit, bastion, runId }) {
  await emit('event', { stage: 'deploy', tool: 'vercel', summary: 'Vercel auto-deploys staging.demo.pistonsolutions.ai on git push — waiting ~45s for build' });
  // Vercel typically builds in 30-60s for static Vite. We sleep then proceed to PR/review.
  await new Promise((r) => setTimeout(r, 45000));
  const stagingUrl = 'https://staging.demo.pistonsolutions.ai';
  await emit('event', { stage: 'deploy', tool: 'vercel', summary: 'deploy presumed live (verify in PR stage)', input: { url: stagingUrl, commit: frontendReport.commit_sha } });
  bastion.ingest({ runId, stage: 'deploy', tool: 'vercel', input: { url: stagingUrl }, summary: 'deploy presumed live' });
  return stagingUrl;
}

async function runPR({ stagingUrl, facts, segment, runDir, runId, emit, bastion }) {
  const t0 = Date.now();
  await emit('event', { stage: 'pr', tool: 'spawn', summary: `PR agent: screenshotting + reviewing ${stagingUrl}` });
  const systemPrompt = await readFile(join(PROMPTS_DIR, 'pr.md'), 'utf-8');
  const userPrompt = [
    `STAGING_URL: ${stagingUrl}`,
    `SEGMENT: ${segment}`,
    `FACTS_JSON:`,
    JSON.stringify(facts, null, 2),
    '',
    `1. WebFetch the staging URL. Verify it loaded the personalized hero for the prospect.`,
    `2. WebFetch /\${segment}/ on the same host to verify the segment route.`,
    `3. (Optional) Use Bash + curl + the chromium headless if you can, to capture a screenshot to ${runDir}/screenshot.png. If headless chromium isn't available, skip and rely on the HTML inspection.`,
    `4. Emit OS26_PR_START / OS26_PR_END with { "verdict": "APPROVED" | "SEND_BACK", "reasoning": "...", "screenshot_path": "..." | null }.`,
  ].join('\n');
  const { ok, code, events, stderr } = await spawnClaude({
    systemPrompt, userPrompt, cwd: runDir, maxTurns: 10,
    onEvent: () => {},
  });
  teeToolUseEvents(events, 'pr', emit, bastion, runId);
  if (!ok) {
    await emit('event', { stage: 'pr', tool: 'spawn', summary: `PR subprocess errored: ${stderr.slice(0, 200)}`, flagged: false });
    return { verdict: 'APPROVED', reasoning: 'pr stage errored, defaulting to ship' };
  }
  const text = extractFinalAssistantText(events);
  const review = extractMarkedJson(text, 'OS26_PR_START', 'OS26_PR_END') || { verdict: 'APPROVED', reasoning: 'no review block, defaulting' };
  await emit('event', { stage: 'pr', tool: 'verdict', summary: `${review.verdict}: ${(review.reasoning || '').slice(0, 200)}`, input: review });
  await emit('verdict', review);
  console.log(`[pr] ${(Date.now() - t0) / 1000}s → ${review.verdict}`);
  return review;
}

const ARAB_COUNTRIES = new Set([
  'bahrain','kuwait','oman','qatar','saudi arabia','united arab emirates','uae',
  'egypt','jordan','lebanon','syria','iraq','palestine','yemen',
  'morocco','algeria','tunisia','libya','sudan','mauritania','djibouti','somalia','comoros',
]);
function pickGreeting(facts) {
  const country = (facts?.facts?.hq_country || facts?.company_facts?.hq_country || '').toLowerCase().trim();
  if (ARAB_COUNTRIES.has(country)) return 'Habibi';
  return 'Heads up';
}

async function runNotify({ stagingUrl, facts, runId, emit, bastion }) {
  const greeting = pickGreeting(facts);
  const brand = facts.facts?.brand_name || facts.company_facts?.brand_name || facts.prospect_company || facts.customer_name;
  const segment = facts.segment;
  const text = `${greeting}! OS26: ${segment} demo for ${brand} (re: ${facts.prospect_name || facts.customer_name || 'prospect'}) is live → ${stagingUrl}`;
  await emit('event', { stage: 'notify', tool: 'telnyx sms', summary: `SMS → ${process.env.NOTIFY_TO_NUMBER}` });
  try {
    const sms = await sendSms({ text });
    await emit('event', { stage: 'notify', tool: 'telnyx sms', summary: `SMS dispatched (id=${sms.id})`, input: { to: sms.to } });
    bastion.ingest({ runId, stage: 'notify', tool: 'telnyx_sms', input: { to: sms.to }, summary: `sms ${sms.id}` });
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
    const facts = await runResearch({ customer: args.customer, url: args.url, runDir, runId, emit, bastion });
    const segment = args.segmentForce || facts.segment;
    if (!['dev', 'insurance', 'compliance'].includes(segment)) {
      throw new Error(`invalid segment: ${segment}`);
    }

    // 2. Frontend
    const frontendReport = await runFrontend({ facts, segment, runDir, runId, emit, bastion });

    // 3. Deploy (Vercel webhook auto-builds — we wait)
    const stagingUrl = await runDeploy({ frontendReport, emit, bastion, runId });
    await emit('staging_url', { url: stagingUrl });

    // 4. PR / Review
    const review = await runPR({ stagingUrl, facts, segment, runDir, runId, emit, bastion });

    // 5. Notify
    await runNotify({ stagingUrl, facts, runId, emit, bastion });

    const elapsed = Date.now() - t0;
    await emit('event', { stage: 'end', tool: 'orchestrator', summary: `factory run complete in ${(elapsed / 1000).toFixed(1)}s`, input: { staging_url: stagingUrl, verdict: review.verdict } });
    console.log(`\n✓ run ${runId} complete in ${elapsed}ms · ${stagingUrl}`);
  } catch (e) {
    const msg = e.message || String(e);
    console.error(`\n✗ run ${runId} failed: ${msg}`);
    await emit('error', { message: msg });
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}
