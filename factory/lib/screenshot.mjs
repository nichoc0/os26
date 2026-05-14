/**
 * Screenshot — uses headless Chrome (via Puppeteer) to grab a viewport
 * shot of the deployed staging URL for the Review agent to evaluate.
 *
 * Falls back to `curl`-based HTML capture if Puppeteer isn't available;
 * the Review agent reads either the PNG or the HTML.
 */
import { spawn } from 'node:child_process';
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

async function tryPuppeteer(url, outPath) {
  // Use puppeteer via npx so we don't add a hard dep to package.json.
  // If puppeteer isn't installed, this throws and the caller falls back.
  const code = `
    const puppeteer = require('puppeteer');
    (async () => {
      const browser = await puppeteer.launch({ headless: 'new' });
      const page = await browser.newPage();
      await page.setViewport({ width: 1440, height: 900 });
      await page.goto(${JSON.stringify(url)}, { waitUntil: 'networkidle2', timeout: 30000 });
      await page.screenshot({ path: ${JSON.stringify(outPath)}, fullPage: false });
      await browser.close();
    })();
  `;
  return new Promise((resolve, reject) => {
    const child = spawn('npx', ['--yes', 'puppeteer-core', '-e', code], { stdio: 'pipe' });
    let err = '';
    child.stderr.on('data', (c) => { err += c.toString(); });
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`puppeteer failed (code=${code}): ${err.slice(-400)}`));
    });
    child.on('error', reject);
  });
}

async function fallbackHtml(url, outPath) {
  return new Promise((resolve, reject) => {
    const child = spawn('curl', ['-sL', '--max-time', '20', url], { stdio: ['ignore', 'pipe', 'pipe'] });
    let body = '';
    child.stdout.on('data', (c) => { body += c.toString(); });
    child.on('close', async (code) => {
      if (code !== 0) return reject(new Error(`curl exited ${code}`));
      await writeFile(outPath, body);
      resolve();
    });
    child.on('error', reject);
  });
}

export async function captureScreenshot(url, outPath) {
  await mkdir(dirname(outPath), { recursive: true });
  try {
    await tryPuppeteer(url, outPath);
    return { kind: 'png', path: outPath };
  } catch (e) {
    // Puppeteer unavailable or failed — capture HTML so Review still has something to look at.
    const htmlPath = outPath.replace(/\.png$/, '.html');
    await fallbackHtml(url, htmlPath);
    return { kind: 'html', path: htmlPath, note: `puppeteer fallback: ${e.message.slice(0, 200)}` };
  }
}
