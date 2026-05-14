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

  // 1. open claude://cowork/new?q=<encoded prompt>
  const encoded = encodeURIComponent(fullPrompt);
  const url = `claude://cowork/new?q=${encoded}`;
  onLog(`[cowork] open ${url.slice(0, 80)}…`);
  await exec('open', [url]);

  // 2. give Claude.app a beat to focus + render
  await sleep(2200);

  // 3. activate Claude.app and fire send. Three strategies in sequence —
  // the first that succeeds wins. Cowork's send button is the hard target;
  // keystrokes are the soft fallback.
  const applescript = `
    tell application "Claude" to activate
    delay 0.5
    tell application "System Events"
      tell process "Claude"
        set frontmost to true
        delay 0.3
        -- Strategy A: walk the UI tree, find any AXButton whose description
        -- or title mentions "send" / "submit" and click it. Most reliable on
        -- chat UIs that bind Send to a button, not a keystroke.
        try
          set winFront to first window whose value of attribute "AXMain" is true
          set allBtns to entire contents of winFront
          repeat with el in allBtns
            try
              if class of el is button then
                set btnName to name of el as string
                set btnDesc to ""
                try
                  set btnDesc to description of el as string
                end try
                if btnName contains "Send" or btnName contains "Submit" or btnDesc contains "Send" or btnDesc contains "Submit" then
                  click el
                  return "clicked: " & btnName
                end if
              end if
            end try
          end repeat
        end try
        -- Strategy B: Cmd+Return (most chat UIs use this for send)
        key code 36 using {command down}
        delay 0.25
        -- Strategy C: plain Return as a last belt-and-suspenders
        -- (skip — could insert newline; we trust B unless A worked)
      end tell
    end tell
  `;
  try {
    const { stdout } = await exec('osascript', ['-e', applescript]);
    onLog(`[cowork] send attempt → ${stdout.trim().slice(0, 120) || 'keystroke fallback'}`);
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
