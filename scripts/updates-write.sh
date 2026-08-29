#!/usr/bin/env bash
# Shared writer for the site-served /var/www/html/updates.json.
#
# Sourced by the three mase.fi writers — mase-fi-update, mase-fi-daily-summary,
# mase-fi-projects. Each acquires the shared flock around its own read-modify-write
# and calls write_updates_json for the final validate + install step.
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
# cannot set O_NOFOLLOW, so a tiny python helper does the open; the caller's
# `) 9>>"$UPDATES_JSON_LOCK"` then flocks the regular file. Fails loud if the
# path is a symlink, not owned by us, or otherwise unusable.
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
  if ! jq empty "$candidate" 2>/dev/null; then
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
