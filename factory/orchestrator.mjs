#!/usr/bin/env node
/**
 * OS26 Demo Factory — orchestrator (2-agent edition).
 *
 * Pipeline:
 *   research  →  frontend (edits + builds + vercel --prod --yes + alias + self-QA)  →  notify
 *
 * The frontend agent owns deploy and self-verifies via WebFetch — no separate
 * PR/review stage. Each stage is a long-lived tmux Claude REPL triggered via
 * factory/tmux/os26-trigger.sh.
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

const STAGING_SITE_DIR = join(OS26_ROOT, 'staging-site');
const RUNS_DIR = join(OS26_ROOT, 'runs');

// ---------- arg parsing ----------
function parseArgs(argv) {
  const args = { customer: null, company: null, url: null, segmentForce: null, runId: null, eventsFile: null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--customer') args.customer = argv[++i];
    else if (a === '--company') args.company = argv[++i];
    else if (a === '--url') args.url = argv[++i];
    else if (a === '--segment') args.segmentForce = argv[++i];
    else if (a === '--run-id') args.runId = argv[++i];
    else if (a === '--events-file') args.eventsFile = argv[++i];
  }
  if (!args.customer) {
    console.error('usage: orchestrator.mjs --customer <name> [--company <co>] [--url <url>] [--segment dev|insurance|compliance] [--run-id <id>] [--events-file <path>]');
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
async function runStageRepl({ session, prompt, outputFile, stage, runId, emit, timeoutSec = 600 }) {
  await emit('event', { stage, tool: 'tmux-trigger', summary: `dispatching to ${session}` });
  const { ok, stdout, stderr, code } = await triggerRepl({
    session, prompt, timeoutSec, outputFile,
    onLog: (l) => emit('event', { stage, tool: 'pane', summary: l.replace(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\s*/, '').slice(0, 240) }),
  });
  if (!ok) throw new Error(`${session} REPL exit ${code}: ${(stderr || stdout).slice(-300)}`);
  const raw = outputFile ? await readFile(outputFile, 'utf-8').catch(() => '') : stdout;
  return raw;
}

async function runResearch({ customer, company, url, runDir, runId, emit, bastion }) {
  const t0 = Date.now();
  const userPrompt = [
    `PROSPECT NAME: ${customer}`,
    company ? `PROSPECT COMPANY: ${company}` : `PROSPECT COMPANY: (not given — infer from the person)`,
    url ? `URL HINT: ${url}` : '',
    '',
    `Use WebSearch + WebFetch. Run ~10 web searches to figure out:`,
    `  1. Confirm the person works at ${company || 'the inferred company'} — LinkedIn search, news, company About.`,
    `  2. Their role / title (CTO, CISO, MGA underwriter, etc.).`,
    `  3. Company field / vertical / product.`,
    `  4. Compliance regime (SOC2, ISO 42001, HIPAA, EU AI Act, Quebec Law 25, NAIC, FCA, OSFI, etc.).`,
    `  5. Pick segment based on PERSON role + COMPANY field + COMPLIANCES.`,
    `  6. Find a usable absolute https URL to ${company || 'the company'}'s logo (favicon, brand asset, or clearbit).`,
    '',
    `Emit the OS26_FACTS_START / OS26_FACTS_END JSON block per your system prompt. Include logo_url in the facts.`,
  ].filter(Boolean).join('\n');
  const outputFile = join(runDir, 'research.out');
  const raw = await runStageRepl({
    session: 'os26-research', prompt: userPrompt, outputFile,
    stage: 'research', runId, emit, timeoutSec: 480,
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

async function runFrontend({ facts, segment, runDir, runId, emit, bastion }) {
  const t0 = Date.now();
  const brand = facts.facts?.brand_name || facts.company_facts?.brand_name || facts.prospect_company || facts.customer_name;
  const logoUrl = facts.facts?.logo_url || facts.company_facts?.logo_url || facts.logo_url || '';
  const userPrompt = [
    `SEGMENT: ${segment}`,
    `RUN_ID: ${runId}`,
    `BRAND: ${brand}`,
    `LOGO_URL: ${logoUrl}`,
    `FACTS_JSON:`,
    JSON.stringify(facts, null, 2),
    '',
    `Your working directory is ${STAGING_SITE_DIR}.`,
    ``,
    `Do the three things from your system prompt (UI is LOCKED — only customer.json and static-api/*.json change):`,
    `  1. Write public/customer.json with default_segment=${segment}, brand_name=${brand}, logo_url=${logoUrl || '""'}, factory_run_id=${runId}.`,
    `  2. Adapt sites/${segment}/public/static-api/{overview,agents,sessions,events,timeline}.json so labels read native to ${brand}'s vertical (schemas unchanged). Do NOT edit any .jsx/.tsx/.css/.html files.`,
    `  3. Build + deploy:`,
    `       npm run build`,
    `       vercel --prod --yes        # capture the bastion-demos-staging-*.vercel.app URL`,
    `       vercel alias set <that URL> staging.demo.pistonsolutions.ai`,
    `  4. Self-QA: WebFetch https://staging.demo.pistonsolutions.ai/customer.json — confirm brand_name and default_segment match. WebFetch https://staging.demo.pistonsolutions.ai/${segment}/ — confirm 200 and the new brand appears in the response body.`,
    ``,
    `Emit OS26_FRONTEND_START / OS26_FRONTEND_END with { segment, brand_name, logo_url, files_edited, deploy_url, vercel_preview_url, qa_passed, error }.`,
    `Do NOT git commit or git push. Deploy is via vercel CLI only.`,
  ].join('\n');
  const outputFile = join(runDir, 'frontend.out');
  const raw = await runStageRepl({
    session: 'os26-frontend', prompt: userPrompt, outputFile,
    stage: 'frontend', runId, emit, timeoutSec: 900,
  });
  const report = extractMarkedJson(raw, 'OS26_FRONTEND_START', 'OS26_FRONTEND_END')
    || { files_edited: [], deploy_url: null, qa_passed: false };
  await emit('event', {
    stage: 'frontend', tool: 'vercel',
    summary: `deploy ${report.qa_passed ? 'PASSED self-QA' : 'completed'} → ${report.deploy_url || 'unknown'}`,
    input: report,
  });
  bastion.ingest({ runId, stage: 'frontend', tool: 'vercel', input: { url: report.deploy_url }, summary: 'deploy complete' });
  console.log(`[frontend] ${(Date.now() - t0) / 1000}s · ${report.deploy_url}`);
  return report;
}

async function runNotify({ stagingUrl, runId, emit, bastion }) {
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
    const facts = await runResearch({ customer: args.customer, company: args.company, url: args.url, runDir, runId, emit, bastion });
    const segment = args.segmentForce || facts.segment;
    if (!['dev', 'insurance', 'compliance'].includes(segment)) {
      throw new Error(`invalid segment: ${segment}`);
    }

    // 2. Frontend (edits + build + vercel deploy + self-QA)
    const frontendReport = await runFrontend({ facts, segment, runDir, runId, emit, bastion });
    const stagingUrl = frontendReport.deploy_url || 'https://staging.demo.pistonsolutions.ai';
    await emit('staging_url', { url: stagingUrl });

    // 3. Notify
    await runNotify({ stagingUrl, runId, emit, bastion });

    const elapsed = Date.now() - t0;
    await emit('event', { stage: 'end', tool: 'orchestrator', summary: `factory run complete in ${(elapsed / 1000).toFixed(1)}s`, input: { staging_url: stagingUrl, qa_passed: frontendReport.qa_passed } });
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
