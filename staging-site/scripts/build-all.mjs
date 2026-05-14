#!/usr/bin/env node
/**
 * build-all.mjs — builds the 3 sub-sites under sites/{dev,insurance,compliance}/
 * and merges their dist outputs into staging-site/dist/ alongside the shell
 * (which lives at the root and redirects to /<segment>/ based on customer.json).
 *
 * Final structure:
 *   staging-site/dist/
 *   ├── index.html        ← shell redirect
 *   ├── customer.json     ← per-deploy overlay (the only thing Adapt rewrites)
 *   ├── dev/              ← Vite build of sites/dev (base: /dev/)
 *   ├── insurance/        ← Vite build of sites/insurance (base: /insurance/)
 *   └── compliance/       ← Vite build of sites/compliance (base: /compliance/)
 *
 * Deploy: `cd staging-site && vercel deploy dist --prod --yes`.
 */
import { spawn } from 'node:child_process';
import { mkdir, rm, cp, copyFile, readdir } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const SITES = ['dev', 'insurance', 'compliance'];

function run(cmd, args, { cwd } = {}) {
  return new Promise((resolveDone, reject) => {
    const child = spawn(cmd, args, { cwd, stdio: 'inherit' });
    child.on('close', (code) => code === 0 ? resolveDone() : reject(new Error(`${cmd} ${args.join(' ')} exit ${code} (cwd=${cwd})`)));
    child.on('error', reject);
  });
}

async function buildSite(site) {
  const cwd = join(ROOT, 'sites', site);
  console.log(`\n=== building sites/${site} ===`);
  // Ensure deps are installed (idempotent — npm is fast on cache hit).
  await run('npm', ['install', '--silent', '--no-audit', '--no-fund'], { cwd });
  await run('npm', ['run', 'build'], { cwd });
}

async function copyDist(site) {
  const src = join(ROOT, 'sites', site, 'dist');
  const dst = join(ROOT, 'dist', site);
  await rm(dst, { recursive: true, force: true });
  await mkdir(dst, { recursive: true });
  // node cp recursive
  await cp(src, dst, { recursive: true });
  console.log(`  ✓ sites/${site}/dist → dist/${site}`);
}

async function main() {
  const buildOnly = process.argv.slice(2);
  const sitesToBuild = buildOnly.length ? buildOnly.filter((s) => SITES.includes(s)) : SITES;
  if (sitesToBuild.length === 0) {
    console.error(`usage: build-all.mjs [dev] [insurance] [compliance]`);
    process.exit(1);
  }

  // Build sequentially for clarity — could parallelise but Vite is already cpu-bound.
  for (const s of sitesToBuild) {
    await buildSite(s);
  }

  // Prepare staging-site/dist/
  const finalDist = join(ROOT, 'dist');
  await mkdir(finalDist, { recursive: true });

  // Drop the shell at the root
  await copyFile(join(ROOT, 'shell', 'index.html'), join(finalDist, 'index.html'));
  // Drop customer.json (default values — Adapt will overwrite this per-run)
  await copyFile(join(ROOT, 'public', 'customer.json'), join(finalDist, 'customer.json'));

  // Merge each site's dist into staging-site/dist/<site>/
  for (const s of sitesToBuild) {
    await copyDist(s);
  }

  console.log(`\n✓ combined output → ${finalDist}`);
  console.log(`  ${(await readdir(finalDist)).join(', ')}`);
}

main().catch((e) => {
  console.error(`build-all failed: ${e.message}`);
  process.exit(1);
});
