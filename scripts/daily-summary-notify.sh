# ntfy alert + non-fatal compact wrapper sourced by mase-fi-daily-summary
#
# Reads the caller's NTFY_URL, NTFY_TOKEN, HELM_ENV, UPDATES_FILE, TODAY, WORK_DIR
# and SCRIPT_DIR.

# Best-effort ntfy push, isolated in a subshell so `set +e` and any failing
# command here can't propagate into the script's `set -e`. Token from $NTFY_TOKEN
# or helm's .env — no systemd EnvironmentFile needed, so this observability lives
# entirely in the versioned script (mirrors helm's refuse-dirty-tree helper).
# Headers go to curl on stdin (`-H @-`; printf is a builtin), never argv — argv is
# world-readable in /proc/<pid>/cmdline, so it would leak the token (finding #10177).
ntfy_send() (
  set +e
  title="$1"; body="$2"
  token="${NTFY_TOKEN:-}"
  if [ -z "$token" ] && [ -f "$HELM_ENV" ]; then
    token=$(grep -E '^NTFY_TOKEN=' "$HELM_ENV" 2>/dev/null | head -1 | cut -d= -f2-)
  fi
  token="${token//[$'\r\n']/}"
  [ -n "$token" ] || exit 0
  printf 'Authorization: Bearer %s\nTitle: %s\n' "$token" "${title//[$'\r\n']/ }" \
    | curl -fsS -m 10 -H @- -d "$body" "$NTFY_URL" >/dev/null 2>&1 || true
)

# Compact after every run, including skips (finding #8804). Non-fatal: a
# degraded or failed compact alerts, because on_exit never sees it. TODAY is
# passed so a midnight-crossing run compacts against the day it summarized.
run_compact() {
  local rc=0 err="$WORK_DIR/compact.err" why
  UPDATES_FILE="$UPDATES_FILE" TODAY="$TODAY" "$SCRIPT_DIR/mase-fi-compact-updates" 2>"$err" || rc=$?
  cat "$err" >&2
  why="$(<"$err")"
  case "$rc" in
    0) ;;
    3) ntfy_send "mase.fi compact degraded" \
         "${TODAY}: ${why:-log archive cannot be created} — commits stripped but logs kept in updates.json, which will keep growing" ;;
    *) echo "compact failed (non-fatal)" >&2
       ntfy_send "mase.fi compact FAILED (exit $rc)" \
         "${TODAY}: updates.json not compacted — ${why:-no stderr}. check: journalctl --user -u mase-fi-daily-summary" ;;
  esac
}
