#!/usr/bin/env bash
# Shared writer for the site-served /var/www/html/updates.json.
#
# Sourced by the three mase.fi writers — mase-fi-update, mase-fi-daily-summary,
# mase-fi-projects. with_updates_lock owns the locked read-modify-write; each
# writer supplies only its transform. write_updates_json is the final validate
# + install step (also used if a caller already holds the lock).
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
# cannot set O_NOFOLLOW, so a tiny python helper does the open; with_updates_lock
# then flocks the regular file via `) 9>>`. Fails loud if the path is a symlink,
# not owned by us, or otherwise unusable.
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

# with_updates_lock <target> <error-label> <transform-fn>
#
#   Locked read-modify-write of <target>. <transform-fn> is a bash function
#   invoked as `<transform-fn> <src> <dest>` and must write a JSON candidate
#   to <dest>. Return codes from the transform:
#     0  install dest via write_updates_json
#     2  skip (no write; success) — daily-summary's in-lock idempotency re-check
#     *  fail (no write)
#
#   Owns ensure_updates_lock, flock -w 30 on fd 9, the jq-empty validity gate,
#   mktemp/rm of the candidate, and write_updates_json. Callers supply only
#   the transform so the 9>> vs 9> choice, the 30s timeout, and the in-lock
#   gate cannot drift across writers. 9>> is O_APPEND, never O_TRUNC.
with_updates_lock() {
  local target="$1" label="$2" transform="$3"
  if ! declare -F "$transform" >/dev/null 2>&1; then
    echo "with_updates_lock: '$transform' is not a function" >&2
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
    if ! jq empty "$target" 2>/dev/null; then
      echo "$target is malformed JSON — $label" >&2
      exit 1
    fi
    tmp="$(mktemp)" || exit 1
    trap 'rm -f "$tmp"' EXIT
    rc=0
    "$transform" "$target" "$tmp" || rc=$?
    if [[ $rc -eq 2 ]]; then
      exit 0
    fi
    if [[ $rc -ne 0 ]]; then
      echo "failed to write $target — $label" >&2
      exit 1
    fi
    write_updates_json "$tmp" "$target" || {
      echo "failed to write $target — $label" >&2
      exit 1
    }
  ) 9>>"$UPDATES_JSON_LOCK"
}

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

# compact_updates_json <hot_src> <archive_src> <hot_dst> <archive_dst> <cutoff>
#
# Pure transform (no lock, no install). Strips the unused `commits` array from
# every entry, moves `log` entries older than <cutoff> (YYYY-MM-DD) into the
# archive, and writes precomputed stats onto the hot object so the client can
# keep all-history totals after the retention cut (finding #8804).
# An empty <cutoff> archives nothing: no string sorts below "", so every log —
# undated ones included — stays in the hot file.
# <archive_src> that is "" or missing is treated as {entries:[]}. One that exists
# but is not {entries:[...]} fails the compact: production writes the archive by
# in-place cp, so an interrupted run can leave it torn, and treating that as
# empty would overwrite every archived log with only tonight's newly aged ones.
compact_updates_json() {
  local hot_src="$1" arch_src="$2" hot_dst="$3" arch_dst="$4" cutoff="$5"
  local arch_for_jq empty_arch="" combined=""
  if [[ -n "$arch_src" && -e "$arch_src" ]]; then
    if ! jq -e 'type == "object" and ((.entries | type) == "array")' "$arch_src" >/dev/null 2>&1; then
      echo "compact: $arch_src is not a valid {entries:[...]} archive — refusing to compact (it may hold archived history)" >&2
      return 1
    fi
    arch_for_jq="$arch_src"
  else
    empty_arch="$(mktemp)" || return 1
    printf '%s\n' '{"entries":[]}' > "$empty_arch"
    arch_for_jq="$empty_arch"
  fi
  combined="$(mktemp)" || { rm -f "$empty_arch"; return 1; }
  if ! jq --arg cutoff "$cutoff" --slurpfile arch "$arch_for_jq" '
    # "" | split("T") is [], so an undated entry must default back to "" — a
    # null day sorts below every cutoff and would age out even when cutoff is "".
    def entry_day: ((.date // "") | split("T")[0]) // "";
    def log_key: [(.date // ""), (.project // ""), (.text // .summary // ""), (.category // "")];

    . as $root
    | ($arch[0].entries // []) as $prev_arch
    | (($root.entries // []) | map(del(.commits))) as $stripped
    | ($stripped | map(select(.category != "log" or (entry_day >= $cutoff)))) as $hot_entries
    | ($stripped | map(select(.category == "log" and (entry_day < $cutoff)))) as $aged
    | ($prev_arch + $aged | unique_by(log_key)) as $arch_entries
    | (($hot_entries | map(select(.category == "log"))) + $arch_entries | unique_by(log_key)) as $all_logs
    | {
        hot: (
          $root
          | .entries = $hot_entries
          | .stats = {
              totalCommits: ($all_logs | length),
              totalEntries: (
                ($hot_entries | map(select(.category != "log")) | length)
                + ($all_logs | length)
              ),
              logFirst: (($all_logs | map(entry_day) | map(select(length > 0)) | min) // null),
              logLast:  (($all_logs | map(entry_day) | map(select(length > 0)) | max) // null),
              commitsByProject: (
                $all_logs
                | group_by(.project // "")
                | map({key: (.[0].project // ""), value: length})
                | from_entries
              ),
              archive: (($arch_entries | length) > 0),
              archivedLogs: ($arch_entries | length)
            }
        ),
        archive: { entries: $arch_entries }
      }
  ' "$hot_src" > "$combined"; then
    rm -f "$empty_arch" "$combined"
    return 1
  fi
  if ! jq '.hot' "$combined" > "$hot_dst" || ! jq '.archive' "$combined" > "$arch_dst"; then
    rm -f "$empty_arch" "$combined"
    return 1
  fi
  rm -f "$empty_arch" "$combined"
}

# compact_and_install — caller holds the updates.json flock.
# Uses UPDATES_FILE, ARCHIVE_FILE (optional), CUTOFF (YYYY-MM-DD).
#
# Returns:
#   0  compacted: aged logs moved to the archive, hot file rewritten
#   3  degraded: the archive file is missing and cannot be created, so commits
#      were stripped and stats written but every log stays in the hot file
#   *  failed: see stderr. Never loses a log (install order below).
#
# Install order is archive first, then hot. The archive write only adds rows
# and is idempotent (unique_by(log_key)), so if the hot install fails after it
# the aged logs just sit in both files until the next compact, and the client's
# loadArchive dedupes them. Hot first would strip them from updates.json before
# the archive held them, losing them for good if the archive install then failed.
# An existing archive that cannot be parsed or written is a failure, not the
# degraded path: it may hold history that a hot-only rewrite would stop counting.
compact_and_install() {
  local cutoff="${CUTOFF:?compact_and_install: CUTOFF is required}"
  local hot="${UPDATES_FILE:?compact_and_install: UPDATES_FILE is required}"
  local arch="${ARCHIVE_FILE:-}"
  local hot_tmp arch_tmp
  hot_tmp="$(mktemp)" || return 1
  arch_tmp="$(mktemp)" || { rm -f "$hot_tmp"; return 1; }

  if [[ -z "$arch" ]]; then
    arch="$(dirname "$hot")/updates-archive.json"
  fi

  local split=1
  if [[ ! -f "$arch" ]]; then
    if ! printf '%s\n' '{"entries":[]}' > "$arch" 2>/dev/null; then
      echo "compact: cannot create $arch — stripping commits, leaving logs in the hot file" >&2
      split=0
    fi
  fi

  if [[ "$split" -eq 0 ]]; then
    # No archive source and an empty cutoff: nothing ages out, so the archive
    # rows are empty and stats.archive comes out false — the client never
    # fetches the file we could not create.
    if ! compact_updates_json "$hot" "" "$hot_tmp" "$arch_tmp" ""; then
      rm -f "$hot_tmp" "$arch_tmp"
      return 1
    fi
    if ! write_updates_json "$hot_tmp" "$hot"; then
      rm -f "$hot_tmp" "$arch_tmp"
      return 1
    fi
    rm -f "$hot_tmp" "$arch_tmp"
    return 3
  fi

  if ! compact_updates_json "$hot" "$arch" "$hot_tmp" "$arch_tmp" "$cutoff"; then
    rm -f "$hot_tmp" "$arch_tmp"
    return 1
  fi
  if ! write_updates_json "$arch_tmp" "$arch"; then
    echo "compact: archive install failed ($arch) — $hot left untouched" >&2
    rm -f "$hot_tmp" "$arch_tmp"
    return 1
  fi
  if ! write_updates_json "$hot_tmp" "$hot"; then
    echo "compact: archive updated but hot install failed ($hot) — aged logs stay in both files until the next compact" >&2
    rm -f "$hot_tmp" "$arch_tmp"
    return 1
  fi
  rm -f "$hot_tmp" "$arch_tmp"
}
