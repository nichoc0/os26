#!/bin/bash
# os26-sessions-up.sh
# Bootstrap persistent tmux Claude REPL sessions for OS26 Demo Factory agents.
# Adapted from /Users/nca/propickz/deploy/tmux/propickz-sessions-up.sh
#
# Creates 3 warm Claude sessions, each pre-loaded with its system prompt:
#   os26-research  — classifies segment + extracts customer facts
#   os26-adapt     — edits template files to match the customer
#   os26-review    — screenshots the staged deploy and approves/sends-back
#
# Idempotent: skips healthy sessions, recycles wedged modals.

set -e

CWD="/Users/nca/os26"
CLAUDE="/Users/nca/.local/bin/claude"

export HOME=/Users/nca
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"

# Load .env so the warm REPLs inherit BASTION_API_KEY etc. (research and review
# never use those directly, but Bash tool calls inside the REPL might).
if [ -f "$CWD/.env" ]; then
  set -a
  . "$CWD/.env"
  set +a
fi

if ! command -v tmux >/dev/null 2>&1; then
  echo "ERROR: tmux not found"; exit 1
fi
if [ ! -x "$CLAUDE" ]; then
  CLAUDE=$(command -v claude 2>/dev/null || true)
  [ -z "$CLAUDE" ] && { echo "ERROR: claude not found"; exit 1; }
fi
if [ ! -d "$CWD" ]; then
  echo "ERROR: $CWD does not exist"; exit 1
fi

# Three sessions, each with its system prompt pre-loaded.
# (macOS ships bash 3.2 — no associative arrays. Use a function lookup instead.)
SESSIONS="os26-research os26-adapt os26-review"

prompt_path_for() {
  case "$1" in
    os26-research) echo "$CWD/factory/agents/research.md" ;;
    os26-adapt)    echo "$CWD/factory/agents/adapt.md" ;;
    os26-review)   echo "$CWD/factory/agents/review.md" ;;
    *) echo "" ;;
  esac
}

start_session() {
  local SESSION="$1"
  local SYSTEM_PROMPT
  SYSTEM_PROMPT=$(prompt_path_for "$SESSION")

  if tmux has-session -t "=$SESSION" 2>/dev/null; then
    local pane
    pane=$(tmux capture-pane -p -t "$SESSION" -S -50 2>/dev/null || true)
    if echo "$pane" | grep -qE 'Do you want to proceed|amend an existing'; then
      echo "WARN: $SESSION has stuck modal — recycling"
      tmux kill-session -t "$SESSION" 2>/dev/null || true
      sleep 1
    else
      echo "OK: $SESSION already running"
      return 0
    fi
  fi

  echo "starting $SESSION (system_prompt=$(basename "$SYSTEM_PROMPT"))"
  local CLAUDE_ARGS="--dangerously-skip-permissions --model claude-sonnet-4-6 --effort xhigh"
  if [ -f "$SYSTEM_PROMPT" ]; then
    CLAUDE_ARGS="$CLAUDE_ARGS --append-system-prompt $SYSTEM_PROMPT"
  else
    echo "  WARN: $SYSTEM_PROMPT not found — session will run without role prompt"
  fi
  # Width 1500 prevents JSON wrapping in captured pane output.
  tmux new-session -d -s "$SESSION" -x 1500 -y 60 -c "$CWD" \
    "$CLAUDE $CLAUDE_ARGS"

  # Auto-dismiss the "trust this folder" modal that fires on first run.
  # We send Enter twice (once for trust, once as belt-and-suspenders on any
  # follow-on confirm). Idempotent if the modal isn't there — extra Enters
  # in a fresh REPL are harmless.
  local TRUST_DEADLINE=$((SECONDS + 20))
  while [ $SECONDS -lt $TRUST_DEADLINE ]; do
    sleep 2
    local INIT_PANE
    INIT_PANE=$(tmux capture-pane -p -t "$SESSION" -S -100 2>/dev/null || true)
    if echo "$INIT_PANE" | grep -qE 'Yes, I trust this folder|trust this folder'; then
      echo "  dismissing trust-folder modal on $SESSION"
      tmux send-keys -t "$SESSION" Enter
      sleep 1
      break
    fi
  done

  # Poll for ready state.
  local DEADLINE=$((SECONDS + 60))
  local READY=0
  while [ $SECONDS -lt $DEADLINE ]; do
    sleep 2
    local PANE
    PANE=$(tmux capture-pane -p -t "$SESSION" -S -100 2>/dev/null || true)
    # Only treat as wedged if a DIFFERENT modal appears post-trust.
    if echo "$PANE" | tail -20 | grep -qE 'Do you want to proceed|amend an existing'; then
      echo "WARN: $SESSION has post-trust modal — needs manual dismissal: tmux attach -t $SESSION"
      return 1
    fi
    if echo "$PANE" | grep -qE '❯' && echo "$PANE" | grep -qE '(bypass permissions on|\? for shortcuts|effort|tips)'; then
      READY=1
      break
    fi
  done

  if [ $READY -ne 1 ]; then
    echo "ERROR: $SESSION did not reach ready state within 60s"
    tmux capture-pane -p -t "$SESSION" -S -30 | tail -10
    return 1
  fi

  echo "OK: $SESSION ready"
}

FAILED=0
for S in $SESSIONS; do
  start_session "$S" || FAILED=$((FAILED + 1))
done

if [ $FAILED -gt 0 ]; then
  echo "WARNING: $FAILED sessions failed to start"
  exit 1
fi

echo "all sessions ready"
echo "  attach research: tmux attach -t os26-research"
echo "  attach adapt:    tmux attach -t os26-adapt"
echo "  attach review:   tmux attach -t os26-review"
echo "  trigger:         factory/tmux/os26-trigger.sh os26-research 'your task here'"
echo "  stop:            factory/tmux/os26-sessions-down.sh"
