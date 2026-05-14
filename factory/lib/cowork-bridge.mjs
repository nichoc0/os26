/**
 * Cowork bridge — invokes Claude Cowork (inside Claude.app on macOS) via the
 * `claude://cowork/new?q=…` URL scheme + an AppleScript keystroke to fire send,
 * then polls a known file path for Cowork's output.
 *
 * Why a file: Cowork lives inside Claude.app, has no outbound HTTP endpoint we
 * can call from os26. The simplest cross-process channel that doesn't require
 * Cowork to know anything about OS26 is "write to /tmp/<runId>.json".
 *
 * Prereqs (one-time):
 *   - Claude.app installed and running
 *   - Privacy → Accessibility: Claude allowed
 *   - Privacy → Screen Recording: Claude allowed
 *   - Privacy → Automation: Terminal allowed to control Claude.app
 *   - In Claude.app → Cowork settings, "Allow all browser actions" enabled
 *     (so Cowork drives Chrome without per-action confirmations)
 */
import { spawn } from 'node:child_process';
import { access, readFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function exec(cmd, args, { input } = {}) {
  return new Promise((resolveDone, reject) => {
    const child = spawn(cmd, args, { stdio: input ? ['pipe', 'pipe', 'pipe'] : ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (c) => { stdout += c.toString(); });
    child.stderr.on('data', (c) => { stderr += c.toString(); });
    child.on('close', (code) => code === 0 ? resolveDone({ stdout, stderr }) : reject(new Error(`${cmd} exit ${code}: ${stderr}`)));
    child.on('error', reject);
    if (input) { child.stdin.write(input); child.stdin.end(); }
  });
}

/**
 * Fire a Cowork session with the given prompt. The prompt should instruct
 * Cowork to write its final JSON output to `outputFile`.
 *
 * @param {string} prompt           Research instructions for Cowork
 * @param {string} outputFile       Absolute path Cowork will write to
 * @param {object} opts
 * @param {number} [opts.timeoutMs] Poll timeout (default 6min)
 * @param {number} [opts.pollMs]    Poll interval (default 2s)
 * @param {(line:string)=>void} [opts.onLog]
 */
export async function fireCowork(prompt, outputFile, opts = {}) {
  const timeoutMs = opts.timeoutMs || 6 * 60_000;
  const pollMs = opts.pollMs || 2000;
  const onLog = opts.onLog || (() => {});

  // Make sure the output dir exists so we can poll.
  await mkdir(dirname(outputFile), { recursive: true });

  // Embed the write-to-file instruction at the END of the prompt so Cowork
  // knows where to drop its answer.
  const fullPrompt = `${prompt}\n\nWhen complete, write your final JSON output to this file path on the host system using your Bash tool: ${outputFile}\n\nAfter writing the file, reply with a one-line confirmation that includes the file path. Do not output the JSON inline — write it to the file only.`;

  // 1. Put the full prompt on the clipboard. Paste it into the ALREADY-OPEN
  // Cowork session (whatever's active in Claude.app right now) — that's the
  // session with /Users/nca/os26/runs mounted.
  onLog(`[cowork] pbcopy prompt (${fullPrompt.length} chars)`);
  await exec('pbcopy', [], { input: fullPrompt });

  // 2. Activate Claude, paste (Cmd+V), then plain Enter to send.
  // Cowork (like Claude.ai web + ChatGPT + most modern chat UIs) treats
  // plain Enter as "send" and Shift+Enter as "newline". Cmd+Return was
  // the wrong guess.
  const applescript = `
    tell application "Claude" to activate
    delay 0.6
    tell application "System Events"
      tell process "Claude"
        set frontmost to true
        delay 0.3
        keystroke "v" using {command down}
        delay 0.5
        keystroke return
      end tell
    end tell
  `;
  try {
    await exec('osascript', ['-e', applescript]);
    onLog('[cowork] Cmd+V + Enter sent to active Cowork session');
  } catch (e) {
    onLog(`[cowork] AppleScript send failed: ${e.message.slice(0, 200)}`);
  }

  // 4. poll the output file
  const deadline = Date.now() + timeoutMs;
  let lastSize = -1;
  while (Date.now() < deadline) {
    try {
      await access(outputFile);
      const txt = await readFile(outputFile, 'utf-8');
      if (txt.length > 0 && txt.length === lastSize) {
        // file is stable — assume Cowork finished writing
        onLog(`[cowork] output ready (${txt.length} chars) at ${outputFile}`);
        return txt;
      }
      lastSize = txt.length;
    } catch {
      // file doesn't exist yet — keep polling
    }
    const elapsed = ((Date.now() - (deadline - timeoutMs)) / 1000).toFixed(0);
    if (Number(elapsed) % 30 === 0) onLog(`[cowork] polling… ${elapsed}s / ${timeoutMs / 1000}s`);
    await sleep(pollMs);
  }
  throw new Error(`Cowork output not received within ${timeoutMs / 1000}s. Check Claude.app for stuck per-action confirmations.`);
}
