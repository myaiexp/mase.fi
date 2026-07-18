#!/usr/bin/env bash
# Shared writer for the site-served /var/www/html/updates.json.
#
# Sourced by the three mase.fi writers — mase-fi-update, mase-fi-daily-summary,
# mase-fi-projects. Each acquires the shared flock (9>/tmp/mase-updates-json.lock,
# the same path helm's deploy commit-logger uses) around its own read-modify-write
# and calls write_updates_json for the final validate + install step.

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
