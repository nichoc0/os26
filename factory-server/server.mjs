#!/usr/bin/env node
/**
 * OS26 Factory backend.
 *
 * - POST /run { customer, url? } → kicks off the orchestrator. Returns { runId }.
 * - GET  /run/:runId/events     → SSE stream of {type, data} events emitted by
 *                                   the orchestrator. Events: 'event' (agent
 *                                   tool_use), 'staging_url', 'verdict',
 *                                   'done', 'error'.
 * - GET  /healthz               → 200 OK
 *
 * Concurrency: one run at a time (warm tmux REPLs are sequential by nature —
 * one session per role can only process one task at a time). A second
 * POST /run while another is in flight gets queued.
 *
 * Events are written to /tmp/factory-runs/<runId>/events.jsonl and tailed
 * by the SSE handler so reconnections pick up where they left off.
 */
import express from 'express';
import cors from 'cors';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdir, appendFile, readFile, stat, watch } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, createReadStream } from 'node:fs';
import { config as dotenvConfig } from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OS26_ROOT = resolve(__dirname, '..');
dotenvConfig({ path: join(OS26_ROOT, '.env') });

const RUNS_DIR = process.env.FACTORY_RUNS_DIR || '/tmp/factory-runs';
const ORCHESTRATOR = join(OS26_ROOT, 'factory', 'orchestrator.mjs');
const PORT = parseInt(process.env.FACTORY_PORT || '7700', 10);

const app = express();
app.use(cors({ origin: true, credentials: false }));
app.use(express.json({ limit: '1mb' }));

const runs = new Map(); // runId → { status, child, eventsFile }
let runQueue = Promise.resolve();

app.get('/healthz', (req, res) => res.json({ ok: true, runs: runs.size }));

app.post('/run', async (req, res) => {
  const { customer, url } = req.body || {};
  if (!customer || typeof customer !== 'string' || customer.trim().length === 0) {
    return res.status(400).json({ error: 'customer is required' });
  }
  const runId = `r${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;
  const dir = join(RUNS_DIR, runId);
  await mkdir(dir, { recursive: true });
  const eventsFile = join(dir, 'events.jsonl');
  // Seed an opening event so the SSE has something to send immediately
  await appendFile(eventsFile, JSON.stringify({ type: 'event', data: { stage: 'start', tool: 'orchestrator', summary: `factory run begin for ${customer}` } }) + '\n');

  runs.set(runId, { status: 'queued', eventsFile, customer, url, startedAt: Date.now() });
  res.status(202).json({ runId });

  // Queue strictly; warm REPLs can only handle one task at a time per session.
  runQueue = runQueue.then(() => executeRun(runId, customer, url, eventsFile)).catch((e) => {
    console.error(`[run ${runId}] failed`, e);
  });
});

app.get('/run/:runId/events', async (req, res) => {
  const runId = req.params.runId;
  const dir = join(RUNS_DIR, runId);
  const eventsFile = join(dir, 'events.jsonl');
  if (!existsSync(eventsFile)) {
    return res.status(404).json({ error: 'run not found' });
  }

  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();

  // Tail the file
  let cursor = 0;
  let closed = false;

  const sendChunk = async () => {
    try {
      const st = await stat(eventsFile);
      if (st.size <= cursor) return;
      const stream = createReadStream(eventsFile, { start: cursor, end: st.size - 1, encoding: 'utf-8' });
      let buf = '';
      for await (const chunk of stream) buf += chunk;
      cursor = st.size;
      const lines = buf.split('\n').filter(Boolean);
      for (const line of lines) {
        if (closed) return;
        res.write(`data: ${line}\n\n`);
      }
    } catch (e) {
      // file may not exist yet — ignore
    }
  };

  await sendChunk();

  // Poll-tail every 400ms. Stop on `done` or `error` events, or when the
  // run's status flips to done/failed and we've drained.
  const interval = setInterval(async () => {
    if (closed) return;
    await sendChunk();
    const meta = runs.get(runId);
    if (meta && (meta.status === 'done' || meta.status === 'failed')) {
      // Drain one more time then close
      await sendChunk();
      res.write(`data: ${JSON.stringify({ type: 'done', data: { status: meta.status } })}\n\n`);
      closed = true;
      clearInterval(interval);
      res.end();
    }
  }, 400);

  req.on('close', () => { closed = true; clearInterval(interval); });
});

async function executeRun(runId, customer, url, eventsFile) {
  console.log(`[run ${runId}] starting (customer="${customer}")`);
  runs.get(runId).status = 'running';

  const args = ['--customer', customer];
  if (url) args.push('--url', url);
  args.push('--run-id', runId);
  args.push('--events-file', eventsFile);

  const child = spawn('node', [ORCHESTRATOR, ...args], {
    cwd: OS26_ROOT,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  runs.get(runId).child = child;

  child.stdout.on('data', (b) => {
    process.stdout.write(`[run ${runId}] ${b}`);
  });
  child.stderr.on('data', (b) => {
    process.stderr.write(`[run ${runId}] ${b}`);
  });

  await new Promise((resolveDone) => {
    child.on('close', async (code) => {
      const ok = code === 0;
      runs.get(runId).status = ok ? 'done' : 'failed';
      if (!ok) {
        await appendFile(eventsFile, JSON.stringify({ type: 'error', data: { message: `orchestrator exit ${code}` } }) + '\n');
      }
      console.log(`[run ${runId}] exit code=${code}`);
      resolveDone();
    });
    child.on('error', async (e) => {
      runs.get(runId).status = 'failed';
      await appendFile(eventsFile, JSON.stringify({ type: 'error', data: { message: e.message } }) + '\n');
      resolveDone();
    });
  });
}

app.listen(PORT, () => {
  console.log(`OS26 Factory backend listening on http://localhost:${PORT}`);
  console.log(`  POST /run          → kick off a factory run`);
  console.log(`  GET  /run/:id/events → SSE stream of agent events`);
  console.log(`  GET  /healthz`);
});
