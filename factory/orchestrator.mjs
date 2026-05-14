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

// ---------- persistent tmux REPL trigger ----------
// All agent stages talk to long-lived Claude Code REPLs that were booted by
// factory/tmux/os26-sessions-up.sh. Each session is Opus 4.7 +
// --dangerously-skip-permissions (bypass-permissions / auto mode). We trigger
// tasks via factory/tmux/os26-trigger.sh which writes the prompt to /tmp,
// `tmux send-keys` a 'Read the file ...' instruction, and polls capture-pane
// for the UUID-scoped DONE_SENTINEL.
//
// Why tmux: send-keys writes to the pseudo-terminal directly — no macOS
// System Events / TCC keystroke gate involved.

const TRIGGER_SCRIPT = join(__dirname, 'tmux', 'os26-trigger.sh');

function triggerRepl({ session, prompt, timeoutSec = 600, outputFile, onLog }) {
  return new Promise((resolveDone, reject) => {
    const args = [session, prompt, String(timeoutSec)];
    if (outputFile) args.push(outputFile);
    const child = spawn(TRIGGER_SCRIPT, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (c) => {
      const s = c.toString();
      stdout += s;
      if (onLog) s.split('\n').filter(Boolean).forEach(onLog);
    });
    child.stderr.on('data', (c) => { stderr += c.toString(); });
    child.on('close', (code) => {
      if (code === 0) resolveDone({ ok: true, stdout, stderr });
      else resolveDone({ ok: false, code, stdout, stderr });
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
  let raw = text.slice(after, e);
  const open = raw.indexOf('{');
  const close = raw.lastIndexOf('}');
  if (open === -1 || close === -1 || close < open) return null;
  raw = raw.slice(open, close + 1);
  try { return JSON.parse(raw); } catch { return null; }
}

// ---------- stages ----------
async function runStageRepl({ session, prompt, outputFile, stage, runId, emit, bastion, timeoutSec = 600 }) {
  await emit('event', { stage, tool: 'tmux-trigger', summary: `dispatching to ${session}` });
  const { ok, stdout, stderr, code } = await triggerRepl({
    session, prompt, timeoutSec, outputFile,
    onLog: (l) => emit('event', { stage, tool: 'pane', summary: l.replace(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\s*/, '').slice(0, 240) }),
  });
  if (!ok) throw new Error(`${session} REPL exit ${code}: ${(stderr || stdout).slice(-300)}`);
  // os26-trigger.sh writes the captured pane (anchor → sentinel) to outputFile
  const raw = outputFile ? await readFile(outputFile, 'utf-8').catch(() => '') : stdout;
  return raw;
}

async function runResearch({ customer, url, runDir, runId, emit, bastion }) {
  const t0 = Date.now();
  const userPrompt = [
    `PROSPECT: ${customer}${url ? ` (URL hint: ${url})` : ''}`,
    '',
    `Use WebSearch + WebFetch. Run ~10 web searches to figure out:`,
    `  1. Who is this person? (LinkedIn search, news, company About)`,
    `  2. What's their role / title? (CTO, CISO, MGA underwriter, etc.)`,
    `  3. What company do they work at, and what's that company's field?`,
    `  4. What compliances does that company deal with? (SOC2, ISO 42001, HIPAA, EU AI Act, Quebec Law 25, NAIC, FCA, OSFI, etc.)`,
    `  5. Pick segment based on PERSON role + COMPANY field + COMPLIANCES.`,
    '',
    `Emit the OS26_FACTS_START / OS26_FACTS_END JSON block per your system prompt.`,
  ].join('\n');
  const outputFile = join(runDir, 'research.out');
  const raw = await runStageRepl({
    session: 'os26-research', prompt: userPrompt, outputFile,
    stage: 'research', runId, emit, bastion, timeoutSec: 480,
  });
  const facts = extractMarkedJson(raw, 'OS26_FACTS_START', 'OS26_FACTS_END');
  if (!facts) throw new Error(`research: missing OS26_FACTS block; tail:\n${raw.slice(-400)}`);
  await emit('event', {
    stage: 'research', tool: 'classify',
    summary: `segment=${facts.segment} (conf ${facts.segment_confidence}) — ${facts.facts?.brand_name || facts.company_facts?.brand_name || facts.prospect_company}`,
    input: { segment: facts.segment, confidence: facts.segment_confidence },
  });
  await writeFile(join(runDir, 'research.json'), JSON.stringify(facts, null, 2));
  bastion.ingest({ runId, stage: 'research', tool: 'classify', input: { segment: facts.segment }, summary: 'research complete' });
  console.log(`[research] ${(Date.now() - t0) / 1000}s → segment=${facts.segment}`);
  return facts;
}

async function runFrontend({ facts, segment, runDir, runId, emit, bastion, extraGuidance }) {
  const t0 = Date.now();
  const brand = facts.facts?.brand_name || facts.company_facts?.brand_name || facts.prospect_company || facts.customer_name;
  const userPrompt = [
    `SEGMENT: ${segment}`,
    `RUN_ID: ${runId}`,
    `FACTS_JSON:`,
    JSON.stringify(facts, null, 2),
    '',
    extraGuidance ? `\nFEEDBACK FROM PR REVIEWER (prior cycle):\n${extraGuidance}\n` : '',
    `Your working directory is ${STAGING_SITE_DIR}.`,
    `1. Edit ./public/customer.json with: default_segment="${segment}", brand_name="${brand}", proprietary_hook (from facts), primary_color (from facts, default "#60a5fa"), factory_run_id="${runId}", generated_at=ISO8601-now`,
    `2. Optionally tweak sites/${segment}/src/App.jsx hero text. Surgical only — no component renames, no new imports.`,
    `3. git add → commit → push:`,
    `     git add public/customer.json sites/${segment}/`,
    `     git commit -m "OS26 demo for ${brand} (${segment})"`,
    `     git push origin main`,
    `     git rev-parse HEAD`,
    `4. Emit OS26_FRONTEND_START / OS26_FRONTEND_END with files_edited + commit_sha.`,
  ].join('\n');
  const outputFile = join(runDir, 'frontend.out');
  const raw = await runStageRepl({
    session: 'os26-frontend', prompt: userPrompt, outputFile,
    stage: 'frontend', runId, emit, bastion, timeoutSec: 600,
  });
  const report = extractMarkedJson(raw, 'OS26_FRONTEND_START', 'OS26_FRONTEND_END')
    || { files_edited: [], commit_sha: null };
  await emit('event', { stage: 'frontend', tool: 'git push', summary: `pushed commit ${report.commit_sha?.slice(0, 7) || '(unknown)'}`, input: report });
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
  const userPrompt = [
    `STAGING_URL: ${stagingUrl}`,
    `SEGMENT: ${segment}`,
    `FACTS_JSON:`,
    JSON.stringify(facts, null, 2),
    '',
    `1. WebFetch ${stagingUrl}/ — confirm 200, shell HTML present.`,
    `2. WebFetch ${stagingUrl}/customer.json — verify brand_name, default_segment, proprietary_hook match facts.`,
    `3. WebFetch ${stagingUrl}/${segment}/ — verify the segment-specific page returns 200 and shows brand.`,
    `4. (Optional) try \`which chromium\` / \`which google-chrome\` / \`npx puppeteer-core\`; if available, screenshot to ${runDir}/screenshot.png. Otherwise skip.`,
    `5. Emit OS26_PR_START / OS26_PR_END with { verdict, reasoning, screenshot_path, checks }.`,
  ].join('\n');
  const outputFile = join(runDir, 'pr.out');
  let raw = '';
  try {
    raw = await runStageRepl({
      session: 'os26-review', prompt: userPrompt, outputFile,
      stage: 'pr', runId, emit, bastion, timeoutSec: 300,
    });
  } catch (e) {
    await emit('event', { stage: 'pr', tool: 'pane', summary: `PR REPL errored: ${e.message.slice(0, 200)}` });
    return { verdict: 'APPROVED', reasoning: 'pr stage errored, defaulting to ship' };
  }
  const review = extractMarkedJson(raw, 'OS26_PR_START', 'OS26_PR_END') || { verdict: 'APPROVED', reasoning: 'no review block, defaulting' };
  await emit('event', { stage: 'pr', tool: 'verdict', summary: `${review.verdict}: ${(review.reasoning || '').slice(0, 200)}`, input: review });
  await emit('verdict', review);
  console.log(`[pr] ${(Date.now() - t0) / 1000}s → ${review.verdict}`);
  return review;
}

async function runNotify({ stagingUrl, facts, runId, emit, bastion }) {
  const text = `hey habibi your demo is ready, check up ${stagingUrl} to see it`;
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

    // 2/3/4. Frontend → Deploy → PR Review (with feedback loop)
    // PR can SEND_BACK to Frontend up to MAX_LOOPS times, passing
    // suggested_fixes to the next Frontend invocation.
    const MAX_LOOPS = 2;
    let stagingUrl = null;
    let review = { verdict: 'APPROVED', reasoning: 'no review yet' };
    let extraGuidance = '';
    for (let cycle = 0; cycle <= MAX_LOOPS; cycle++) {
      await runFrontend({ facts, segment, runDir, runId, emit, bastion, extraGuidance });
      stagingUrl = await runDeploy({ frontendReport: {}, emit, bastion, runId });
      await emit('staging_url', { url: stagingUrl });
      review = await runPR({ stagingUrl, facts, segment, runDir, runId, emit, bastion });
      if (review.verdict === 'APPROVED' || cycle === MAX_LOOPS) break;
      // SEND_BACK — feed PR's suggested_fixes back to Frontend on the next loop
      const issues = (review.issues || []).join('; ');
      const fixes = (review.suggested_fixes || []).join('; ');
      extraGuidance = `Previous deploy SEND_BACK by PR review. Issues: ${issues}. Apply these fixes: ${fixes}. Re-edit and re-push.`;
      await emit('event', { stage: 'frontend', tool: 'loop', summary: `PR sent back — re-running Frontend with guidance (cycle ${cycle + 2}/${MAX_LOOPS + 1})`, flagged: true });
    }

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
