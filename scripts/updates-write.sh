#!/usr/bin/env bash
# Shared lock + install for the site-served /var/www/html/updates.json.
#
# Sourced by the four mase.fi writers — mase-fi-update, mase-fi-daily-summary,
# mase-fi-projects, mase-fi-compact-updates. run_under_updates_lock owns the
# lock steps (open, flock, in-lock is_updates_json gate) and is the only place
# they are written; with_updates_lock adds the single-file read-modify-write on top;
# write_updates_json is the final validate + install step. Compaction's
# transform lives in updates-compact.sh, sourced only by mase-fi-compact-updates.
#
# Lock path is shared with helm/scripts/deploy's commit-logger. It stays at the
# well-known /tmp name so sudo -u mase (no XDG_RUNTIME_DIR) and a session deploy
# still serialize against each other; moving it to HOME/XDG would split the lock
# across invocation contexts. Defense is how we OPEN it: ensure_updates_lock
# uses O_NOFOLLOW so a co-tenant symlink is refused, then the subshell uses
# 9>> (O_APPEND, no truncate) rather than 9> (O_TRUNC). UPDATES_LOCK overrides
# the path for tests.

UPDATES_JSON_LOCK="${UPDATES_LOCK:-/tmp/mase-updates-json.lock}"

# Create/open $UPDATES_JSON_LOCK with O_NOFOLLOW|O_APPEND|O_CREAT. Bash redirects
# cannot set O_NOFOLLOW, so a tiny python helper does the open;
# run_under_updates_lock then flocks the regular file via `) 9>>`. Fails loud if
# the path is a symlink, not owned by us, or otherwise unusable.
ensure_updates_lock() {
  python3 -c '
import os, stat, sys
path = sys.argv[1]
flags = os.O_RDWR | os.O_CREAT | os.O_APPEND | os.O_NOFOLLOW
try:
    fd = os.open(path, flags, 0o600)
except OSError as e:
    sys.stderr.write("updates.json lock open failed (%s): %s\n" % (path, e))
    sys.exit(1)
try:
    st = os.fstat(fd)
    if st.st_uid != os.geteuid():
        sys.stderr.write("updates.json lock not owned by this user (%s)\n" % path)
        sys.exit(1)
    if stat.S_IMODE(st.st_mode) & 0o077:
        os.fchmod(fd, 0o600)
except OSError as e:
    sys.stderr.write("updates.json lock open failed (%s): %s\n" % (path, e))
    sys.exit(1)
finally:
    os.close(fd)
' "$UPDATES_JSON_LOCK"
}

# is_updates_json <file>
#
#   True when <file> holds exactly one JSON document that is an object with an
#   `entries` array — the store's minimum shape. `jq empty` is not enough: it
#   exits 0 on a 0-byte file and on several concatenated documents, so a
#   transform that silently produced nothing would pass it and blank the store.
#   Slurping (-s) makes both cases fail the length check.
is_updates_json() {
  jq -se 'length == 1 and (.[0] | type == "object" and (.entries | type) == "array")' \
    "$1" >/dev/null 2>&1
}

# run_under_updates_lock <target> <error-label> <fn> [args...]
#
#   Runs `<fn> [args...]` while holding the updates.json flock, after checking
#   <target> is well-formed JSON. The one owner of ensure_updates_lock,
#   flock -w 30 on fd 9, the in-lock jq-empty gate, and the 9>> redirect
#   (O_APPEND, never O_TRUNC) — every writer goes through here so the timeout,
#   the open flags, and the gate cannot drift between them.
#
#   Returns 1 with "<reason> — <error-label>" on stderr if the lock is
#   unusable, busy >30s, or <target> is malformed (<fn> is not called);
#   otherwise returns <fn>'s status. <fn> runs in the locked subshell, so
#   variables it sets do not reach the caller.
run_under_updates_lock() {
  local target="$1" label="$2" fn="$3"
  shift 3
  if ! declare -F "$fn" >/dev/null 2>&1; then
    echo "run_under_updates_lock: '$fn' is not a function" >&2
    return 1
  fi
  ensure_updates_lock || {
    echo "updates.json lock unusable — $label" >&2
    return 1
  }
  (
    flock -w 30 9 || {
      echo "updates.json lock busy >30s — $label" >&2
      exit 1
    }
    if ! is_updates_json "$target"; then
      echo "$target is malformed JSON — $label" >&2
      exit 1
    fi
    "$fn" "$@"
  ) 9>>"$UPDATES_JSON_LOCK"
}

# with_updates_lock <target> <error-label> <transform-fn>
#
#   Locked read-modify-write of <target>. <transform-fn> is a bash function
#   invoked as `<transform-fn> <src> <dest>` and must write a JSON candidate
#   to <dest>. Return codes from the transform:
#     0  install dest via write_updates_json
#     2  skip (no write; success) — daily-summary's in-lock idempotency re-check
#     *  fail (no write)
#
#   Locking and the validity gate come from run_under_updates_lock; this adds
#   mktemp/rm of the candidate and write_updates_json, so callers supply only
#   the transform.
with_updates_lock() {
  local target="$1" label="$2" transform="$3"
  if ! declare -F "$transform" >/dev/null 2>&1; then
    echo "with_updates_lock: '$transform' is not a function" >&2
    return 1
  fi
  run_under_updates_lock "$target" "$label" _updates_rmw "$target" "$label" "$transform"
}

# The body with_updates_lock runs under the lock: transform into a temp
# candidate, install it, remove it. Both calls sit in `||` so a failure is
# reported with the label instead of tripping a caller's set -e mid-cleanup.
_updates_rmw() {
  local target="$1" label="$2" transform="$3" tmp rc=0
  tmp="$(mktemp)" || return 1
  "$transform" "$target" "$tmp" || rc=$?
  if [[ $rc -eq 0 ]]; then
    write_updates_json "$tmp" "$target" || rc=1
  fi
  rm -f "$tmp"
  if [[ $rc -eq 0 || $rc -eq 2 ]]; then
    return 0
  fi
  echo "failed to write $target — $label" >&2
  return 1
}

# write_updates_json <candidate_file> <target_file>
#
#   Validates <candidate_file> is well-formed JSON, then replaces <target_file>
#   with it as atomically as the target directory's permissions allow:
#
#     - dir writable  -> sibling mktemp + mv (rename(2)): tearless for readers,
#                        an nginx GET always sees the whole old or whole new file.
#     - dir read-only -> in-place cp (needs only file-write). nginx can briefly
#                        read a partial file during the copy — the residual we
#                        can't close today: updates.json is mase-owned but sits in
#                        a www-data-owned /var/www/html that mase cannot write, so
#                        rename INTO it is impossible without an infra perm change.
#                        Grant mase write on the webroot dir and the atomic branch
#                        above takes over automatically, no code change.
#
#   Returns non-zero WITHOUT touching the target if the candidate is invalid, so a
#   caller's `&&` chain / set -e aborts loudly instead of shipping garbage.
write_updates_json() {
  local candidate="$1" target="$2"
  if ! is_updates_json "$candidate"; then
    echo "write_updates_json: candidate is malformed JSON — refusing to write $target" >&2
    return 1
  fi
  local dir
  dir="$(dirname "$target")"
  if [[ -w "$dir" ]]; then
    local sib mode
    mode="$(stat -c '%a' "$target" 2>/dev/null || echo 644)"
    sib="$(mktemp "$dir/.updates.XXXXXX")" || return 1
    if cp "$candidate" "$sib" && chmod "$mode" "$sib" && mv -f "$sib" "$target"; then
      return 0
    fi
    rm -f "$sib"
    return 1
  fi
  # Fallback: directory not writable (current prod). In-place, needs only file-write.
  cp "$candidate" "$target"
}
