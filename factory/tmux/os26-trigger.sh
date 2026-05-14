#!/bin/bash
# os26-trigger.sh
# Send a task to a warm OS26 Claude REPL via file-based trigger.
# Polls tmux pane for UUID-scoped completion sentinel.
# Adapted from /Users/nca/propickz/deploy/tmux/propickz-trigger.sh
#
# Usage: os26-trigger.sh <session-name> <prompt> [max-seconds] [output-file]
#
# If output-file is provided, the agent's final assistant output (between the
# anchor and the sentinel) is written there. Otherwise it goes to stdout.
#
# Exit codes:
#   0 — task completed successfully
#   1 — timeout
#   2 — modal detected (session wedged, needs recycle)

set -e

SESSION="${1:?Usage: os26-trigger.sh <session-name> <prompt> [max-seconds] [output-file]}"
PROMPT="${2:?Usage: os26-trigger.sh <session-name> <prompt> [max-seconds] [output-file]}"
MAX_SECONDS="${3:-600}"
OUTPUT_FILE="${4:-}"

POLL_INTERVAL=3
UUID=$(uuidgen | tr '[:upper:]' '[:lower:]')
PROMPT_FILE="/tmp/os26-task-${UUID}.txt"
DONE_SENTINEL="OS26_TASK_DONE_${UUID}"

# No spinner-pattern second-guessing. The UUID-scoped DONE_SENTINEL is the
# authoritative signal that Claude has finished the task — when it appears in
# the pane, treat the task as complete. Period.
MODAL_PATTERNS='Do you want to proceed|to confirm|amend'

if ! tmux has-session -t "$SESSION" 2>/dev/null; then
  echo "$(date '+%Y-%m-%d %H:%M:%S') ERROR: session $SESSION does not exist"
  exit 1
fi

# Write prompt to file with sentinel instructions
cat > "$PROMPT_FILE" << PROMPT_EOF
${PROMPT}

When you are completely finished with this task, print the following exact line on its own:
${DONE_SENTINEL}
PROMPT_EOF

echo "$(date '+%Y-%m-%d %H:%M:%S') task=${UUID} session=${SESSION}"

TRIGGER="Read the file ${PROMPT_FILE} and execute the instructions inside it."
tmux send-keys -t "$SESSION" -l "$TRIGGER"
tmux send-keys -t "$SESSION" Enter

MAX_POLLS=$((MAX_SECONDS / POLL_INTERVAL))
POLL=0
COMPLETED=0
POST_ANCHOR=""

while [ $POLL -lt $MAX_POLLS ]; do
  sleep $POLL_INTERVAL
  POLL=$((POLL + 1))

  PANE=$(tmux capture-pane -p -t "$SESSION" -S -5000 2>/dev/null || true)
  [ -z "$PANE" ] && continue

  ANCHOR="os26-task-${UUID}.txt"
  POST_ANCHOR=$(echo "$PANE" | awk -v anchor="$ANCHOR" '
    BEGIN { buf = ""; found = 0 }
    { buf = buf "\n" $0 }
    index($0, anchor) { found = NR; start = length(buf) - length($0) }
    END {
      if (found > 0) print substr(buf, start + 1)
      else print ""
    }
  ')

  [ -z "$POST_ANCHOR" ] && continue

  if echo "$POST_ANCHOR" | grep -qE "$MODAL_PATTERNS"; then
    echo "$(date '+%Y-%m-%d %H:%M:%S') MODAL detected — session $SESSION is wedged"
    rm -f "$PROMPT_FILE"
    exit 2
  fi

  if echo "$POST_ANCHOR" | grep -qF "$DONE_SENTINEL"; then
    COMPLETED=1
    break
  fi

  if [ $((POLL % 10)) -eq 0 ]; then
    ELAPSED=$((POLL * POLL_INTERVAL))
    echo "$(date '+%Y-%m-%d %H:%M:%S') polling... ${ELAPSED}s / ${MAX_SECONDS}s"
  fi
done

rm -f "$PROMPT_FILE"

if [ $COMPLETED -eq 1 ]; then
  echo "$(date '+%Y-%m-%d %H:%M:%S') task=${UUID} COMPLETED"
  # Extract everything from anchor up to (and including) the sentinel line.
  EXTRACT=$(echo "$POST_ANCHOR" | sed -n "1,/${DONE_SENTINEL}/p")
  if [ -n "$OUTPUT_FILE" ]; then
    echo "$EXTRACT" > "$OUTPUT_FILE"
    echo "$(date '+%Y-%m-%d %H:%M:%S') wrote output → $OUTPUT_FILE ($(wc -l < "$OUTPUT_FILE") lines)"
  else
    echo "$EXTRACT"
  fi
  exit 0
else
  ELAPSED=$((POLL * POLL_INTERVAL))
  echo "$(date '+%Y-%m-%d %H:%M:%S') task=${UUID} TIMEOUT after ${ELAPSED}s"
  echo "--- last 15 lines of pane ---"
  echo "$PANE" | tail -15
  exit 1
fi
