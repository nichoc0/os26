/**
 * Vercel CLI wrapper — deploys a directory to the linked Vercel project
 * and returns the production URL. Bypasses the GitHub auto-deploy so each
 * Factory run is independent, fast, and doesn't pollute commit history.
 *
 * Assumes:
 *   - `vercel` CLI is installed and authenticated (`vercel login`)
 *   - The os26 Vercel project exists; .vercel/project.json from os26 root
 *     will be copied into each run dir at deploy time so the CLI knows
 *     which project to push to.
 */
import { spawn } from 'node:child_process';
import { copyFile, mkdir, access } from 'node:fs/promises';
import { join, dirname } from 'node:path';

const OS26_ROOT_PROJECT_JSON = '/Users/nca/os26/.vercel/project.json';

async function ensureLinked(runDir) {
  const target = join(runDir, '.vercel', 'project.json');
  try {
    await access(target);
    return; // already linked
  } catch {
    // copy from os26 root link
  }
  await mkdir(dirname(target), { recursive: true });
  await copyFile(OS26_ROOT_PROJECT_JSON, target);
}

function run(cmd, args, { cwd, env, onLine } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, env: { ...process.env, ...(env || {}) }, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      const s = chunk.toString();
      stdout += s;
      if (onLine) s.split('\n').forEach((l) => l && onLine(l));
    });
    child.stderr.on('data', (chunk) => {
      const s = chunk.toString();
      stderr += s;
      if (onLine) s.split('\n').forEach((l) => l && onLine(l));
    });
    child.on('close', (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${cmd} ${args.join(' ')} exited ${code}\n${stderr.slice(-1000)}`));
    });
    child.on('error', reject);
  });
}

export async function deploy(runDir, { token, onLine } = {}) {
  await ensureLinked(runDir);
  const tokenArgs = token ? ['--token', token] : [];
  const { stdout } = await run('vercel', ['--prod', '--yes', ...tokenArgs], { cwd: runDir, onLine });
  // Vercel CLI emits the deployment URL on stdout (last URL-looking line is the prod URL).
  const lines = stdout.split('\n').filter(Boolean);
  const urlLine = [...lines].reverse().find((l) => /^https?:\/\//.test(l.trim()));
  const url = urlLine ? urlLine.trim() : null;
  if (!url) throw new Error(`could not parse Vercel prod URL from output:\n${stdout.slice(-500)}`);
  return { productionUrl: url };
}
