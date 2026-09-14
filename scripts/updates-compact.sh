#!/usr/bin/env bash
# Compaction transform for updates.json: strip commits[], archive old logs.
#
# Sourced by mase-fi-compact-updates after updates-write.sh (compact_and_install
# installs with its write_updates_json). Compaction writes two files — the hot
# updates.json and updates-archive.json — so it runs compact_and_install under
# run_under_updates_lock rather than with_updates_lock's single-candidate
# read-modify-write.

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

# compact_and_install <hot> <archive> <cutoff> — caller holds the updates.json flock.
#
# Returns:
#   0  compacted: aged logs moved to the archive, hot file rewritten
#   3  degraded: <archive> is missing and cannot be created, so commits were
#      stripped and stats written but every log stays in the hot file
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
  local hot="${1:?compact_and_install: hot file is required}"
  local arch="${2:?compact_and_install: archive file is required}"
  local cutoff="${3:?compact_and_install: cutoff is required}"
  local hot_tmp arch_tmp
  hot_tmp="$(mktemp)" || return 1
  arch_tmp="$(mktemp)" || { rm -f "$hot_tmp"; return 1; }

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
