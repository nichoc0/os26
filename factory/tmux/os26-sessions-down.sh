#!/bin/bash
# Kill all OS26 tmux Claude REPL sessions.
for S in os26-research os26-adapt os26-review; do
  if tmux has-session -t "=$S" 2>/dev/null; then
    tmux kill-session -t "$S"
    echo "killed: $S"
  fi
done
