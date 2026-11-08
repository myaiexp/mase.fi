# Daily summary generation (claude -p) and reply cleaning, sourced by the writer
#
# Reads the caller's MAX_LINES, CLAUDE_BIN, CLAUDE_MODEL, CLAUDE_TIMEOUT, CLAUDE_CWD
# and SCRIPT_DIR (for daily-summary-prompt.txt).

# Keep the model's real summary lines and drop the noise. The prompt asks for one
# line per notable thread with nothing else, so per line: strip CR + a leading
# bullet/number marker + a wrapping pair of quotes/backticks, then drop blanks,
# obvious preamble/meta ("here are…", "N characters", trailing-colon lead-ins).
# Emit up to MAX_LINES survivors, in order. (Sonnet needs little scrubbing; this
# is a light net, not the heavy Hermes-era filter — no `<`/`>` rule, which used
# to wrongly nuke summaries containing an arrow like `a -> b`.)
clean_lines() {
    awk -v max="$MAX_LINES" '
    function trim(s) { sub(/^[[:space:]]+/, "", s); sub(/[[:space:]]+$/, "", s); return s }
    {
        line = $0
        gsub(/\r/, "", line); line = trim(line)
        sub(/^([0-9]+[.)]|[-*•—])[[:space:]]+/, "", line); line = trim(line)  # list marker
        if (line ~ /^".*"$/ || line ~ /^`.*`$/ || line ~ /^'\''.*'\''$/) line = trim(substr(line, 2, length(line) - 2))
        if (line == "") next
        low = tolower(line)
        if (low ~ /^(here (are|is)|these |output:|summary:|changes:|note:)/) next  # preamble
        if (line ~ /^[0-9]+ characters/) next          # self-check meta
        if (line ~ /:[[:space:]]*$/) next              # trailing-colon lead-in
        # drop narration about the commits, the day, or the model itself, which
        # Sonnet occasionally prepends (two-lines-one-per-project, commits-are-
        # all-from-one-day, let-me-write-the-changelog) — the real changelog
        # lines that follow it survive.
        # Word edges use gawk \< \> — NOT \b (gawk \b is the backspace char).
        if (low ~ /^(one|two|three|four|five|six|seven|eight|nine|ten|[0-9]+) lines?\>/) next
        if (low ~ /\<(all |the )?commits (are|were|show|span|look|appear)\>/) next
        if (low ~ /^today.?s (git )?(log|commits|work)/) next
        if (low ~ /^let me\>/) next
        if (low ~ /\<one per project\>/) next
        if (low ~ /\<from a single day\>/) next
        if (low ~ /\<appear to be\>/) next
        if (low ~ /\<distinct threads\>/) next
        # Asides that reached the public log: "Looking at the commits", "two
        # commits, no diffs shown — going by messages alone", "based on the two
        # most notable threads: …". Narrow on purpose: real lines mention diffs.
        if (low ~ /^looking at\>/) next
        if (low ~ /\<no diffs?\>/) next
        if (low ~ /\<going by (the )?(commit )?messages\>/) next
        if (low ~ /^based on (the )?([a-z0-9]+ )?(most notable|notable|commit|commits|messages|threads)\>/) next
        # drop conversational refusals / no-input replies: Claude Code sometimes
        # tries to read a repo instead of the provided commits and then bails.
        # The prompt makes these rare; this is the safety net.
        if (low ~ /\<no (commit|work|git|changes|actual)/) next
        if (low ~ /\<(in|from) your message\>/) next
        if (low ~ /^i (don.?t|do not|only|need|can.?t|cannot|see|notice|am )/) next
        if (low ~ /(could|can) you (paste|provide|share|clarify)/) next
        if (low ~ /^(please|paste|provide)\>/) next
        if (low ~ /^wait\>/) next
        if (low ~ /working director/) next
        if (low ~ /the user (only )?(supplied|provided|gave)/) next
        print line
        if (++n >= max) exit
    }
    '
}

# A highlight list is short by design; clamp a rambling reply to the last whole
# item under ~110 chars rather than dumping an over-long line on the homepage.
# If the clamp lands mid-parenthetical, drop the dangling "(fragment" too so the
# line doesn't end on an unclosed paren.
truncate_summary() {
    local s="$1" max=110
    if (( ${#s} > max )); then
        local head="${s:0:$max}"
        if [[ "$head" == *,* ]]; then s="${head%,*}"; else s="${head% *}…"; fi
    fi
    if [[ "$s" == *"("* && "$s" != *")"* ]]; then s="${s% (*}"; fi
    printf '%s' "$s"
}

# Summarize a project's day into 1..MAX_LINES legible lines via the Claude Code
# CLI (`claude -p`, Sonnet) in headless print mode. The model judges how many
# distinct notable threads the day held — most days are one line; a day that
# ships several separate things earns a line each. No tools are needed for pure
# text generation: `--tools ""` disables the default tool set (the `timeout`
# wrapper is only a duration backstop). Prints one cleaned+truncated summary
# per line. On any non-zero exit, timeout, or a reply that cleans to nothing it
# prints nothing and returns 1: a commit count is not a changelog line, so the
# main loop posts no daily for that project and counts it for the alert.
generate_summary() {
    local project="$1"
    local commits_text="$2"

    # "What did the developer do today" for a semi-technical reader — terse and
    # technical is fine, just legible. Output is one line per genuinely distinct
    # notable thread (default ONE line); internal churn rides as a trailing
    # mention or drops, since the raw commits live in the activity feed. The two
    # examples anchor the split: a maintenance day → one line; a two-feature day
    # → two lines. Char target is soft (Sonnet doesn't need Hermes-era clamping).
    # Instructions live in daily-summary-prompt.txt, shared with
    # estimate-backfill-tokens.py so the two can't drift.
    local system_prompt
    system_prompt="$(<"$SCRIPT_DIR/daily-summary-prompt.txt")"
    system_prompt="${system_prompt//@MAX_LINES@/$MAX_LINES}"
    local prompt="<commits>
${commits_text}
</commits>"

    # Strip Claude Code's ambient context down to the summarizer job:
    # --system-prompt replaces its default coding-agent prompt with ours,
    # --setting-sources "" skips user settings (SessionStart hooks) and
    # ~/.claude/CLAUDE.md, --strict-mcp-config drops claude.ai connector
    # instructions, --effort low stops multi-thousand-token thinking on a 3-line
    # job. (--bare would strip more but refuses OAuth, the only auth here.) Run
    # from the neutral CLAUDE_CWD so no repo CLAUDE.md leaks in either.
    # `</dev/null` skips claude's 3s "no stdin" wait; `|| true` keeps a single
    # failed/timed-out call from aborting the whole run under `set -e` — this
    # project gets no daily, the rest still get summarized.
    local response
    response=$(cd "$CLAUDE_CWD" && timeout "$CLAUDE_TIMEOUT" "$CLAUDE_BIN" -p "$prompt" \
        --system-prompt "$system_prompt" --model "$CLAUDE_MODEL" --tools "" \
        --setting-sources "" --strict-mcp-config --effort low </dev/null 2>/dev/null) || true

    local lines
    lines=$(printf '%s' "$response" | clean_lines)

    if [[ -n "$lines" ]]; then
        local l
        while IFS= read -r l; do
            l="${l#"$project": }"   # drop a redundant leading "project:" the model sometimes adds
            truncate_summary "$l"; echo
        done <<< "$lines"
    else
        # Log the failed/empty reply to the journal so a failed summary is diagnosable
        # (the delegate era discarded the reply, leaving every failure a black box).
        echo "generate_summary: empty/failed claude reply for '${project}' — no daily entry" >&2
        return 1
    fi
}
