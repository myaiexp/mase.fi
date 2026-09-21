#!/usr/bin/env python3
# Estimate the token count + cost of (re)backfilling mase.fi daily summaries.
#
# The daily-summary pipeline summarizes each multi-commit project-day with one
# `claude -p --model sonnet` call. `claude -p` is the full Claude Code CLI, so
# even trimmed (see generate_summary in mase-fi-daily-summary) each call carries
# some ambient context of its own beyond the summary prompt, plus cache
# write/read behaviour that depends on run spacing. So this tool measures both:
#
#   1. content-only (free): count_tokens on the actual summary prompts — the
#      raw-API lower bound, i.e. what the payload WE control costs.
#   2. claude -p actual (spends a little): run a stratified sample of real days
#      through `claude -p --output-format json` with the pipeline's own flags,
#      read the reported usage + total_cost_usd, then extrapolate across every
#      multi-commit day.
#
# Days come from the `log` entries (hot updates.json + the archive), grouped by
# date and project the way the pipeline groups them. The prompt is read from
# daily-summary-prompt.txt, the file mase-fi-daily-summary uses.
#
# Usage: estimate-backfill-tokens.py [--sample N] [--calib N] [--no-empirical]

import json
import os
import subprocess
import sys
import tempfile
import urllib.request

UPDATES = os.environ.get("UPDATES_FILE", "/var/lib/mase-fi/updates.json")  # UPDATES_FILE_DEFAULT in updates-write.sh
CLAUDE_BIN = os.environ.get("CLAUDE_BIN", "/home/mase/.local/bin/claude")
CREDS = os.path.expanduser("~/.claude/.credentials.json")
MODEL = "claude-sonnet-5"           # what `--model sonnet` resolves to (for count_tokens)
MAX_LINES = 3
# Sonnet 5 per-1M-token prices (USD): standard, and intro through 2026-08-31.
PRICE = {"in": 3.00, "out": 15.00, "cache_read": 0.30, "cache_write_1h": 6.00}
PRICE_INTRO = {"in": 2.00, "out": 10.00, "cache_read": 0.20, "cache_write_1h": 4.00}

SCRIPT_DIR = os.path.dirname(os.path.realpath(__file__))
ARCHIVE = os.environ.get(
    "ARCHIVE_FILE", os.path.join(os.path.dirname(UPDATES), "updates-archive.json")
)
# Same trimming flags as generate_summary in mase-fi-daily-summary — keep in step.
CLAUDE_FLAGS = ["--model", "sonnet", "--tools", "", "--setting-sources", "",
                "--strict-mcp-config", "--effort", "low"]


def system_prompt():
    with open(os.path.join(SCRIPT_DIR, "daily-summary-prompt.txt")) as f:
        return f.read().rstrip("\n").replace("@MAX_LINES@", str(MAX_LINES))


def build_prompt(commits):
    return "<commits>\n" + "\n".join(commits) + "\n</commits>"


def load_logs(path):
    try:
        with open(path) as f:
            return [e for e in json.load(f).get("entries", []) if e.get("category") == "log"]
    except FileNotFoundError:
        return []


def load_days():
    groups = {}
    for e in load_logs(UPDATES) + load_logs(ARCHIVE):
        groups.setdefault((e["date"], e.get("project", "?")), []).append(e["text"])
    return sorted((d, p, c) for (d, p), c in groups.items() if len(c) > 1)


def oauth_token():
    with open(CREDS) as f:
        return json.load(f)["claudeAiOauth"]["accessToken"]


def count_tokens(text, token, system=None):
    req_body = {"model": MODEL, "messages": [{"role": "user", "content": text}]}
    if system:
        req_body["system"] = system
    body = json.dumps(req_body).encode()
    req = urllib.request.Request(
        "https://api.anthropic.com/v1/messages/count_tokens",
        data=body,
        headers={
            "authorization": f"Bearer {token}",
            "anthropic-version": "2023-06-01",
            "anthropic-beta": "oauth-2025-04-20",
            "content-type": "application/json",
        },
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)["input_tokens"]


BUCKETS = [(2, 4), (5, 9), (10, 19), (20, 39), (40, 10**9)]


def bucket_of(n):
    for i, (lo, hi) in enumerate(BUCKETS):
        if lo <= n <= hi:
            return i
    return len(BUCKETS) - 1


def stratified(days, per_bucket):
    # Deterministic even spread within each commit-count bucket (no RNG).
    picks = []
    for i in range(len(BUCKETS)):
        members = [d for d in days if bucket_of(len(d[2])) == i]
        if not members:
            continue
        k = min(per_bucket, len(members))
        step = max(1, len(members) // k)
        picks += members[::step][:k]
    return picks


def run_claude(commits):
    prompt = build_prompt(commits)
    with tempfile.TemporaryDirectory() as neutral:
        p = subprocess.run(
            [CLAUDE_BIN, "-p", prompt, "--system-prompt", system_prompt(),
             *CLAUDE_FLAGS, "--output-format", "json"],
            cwd=neutral,
            stdin=subprocess.DEVNULL,
            capture_output=True,
            text=True,
            timeout=180,
        )
    if p.returncode != 0:
        return None
    try:
        arr = json.loads(p.stdout)
    except json.JSONDecodeError:
        return None
    result = next((x for x in arr if isinstance(x, dict) and x.get("type") == "result"), None)
    if not result:
        return None
    u = result.get("usage", {})
    return {
        "in": u.get("input_tokens", 0),
        "cache_read": u.get("cache_read_input_tokens", 0),
        "cache_write": u.get("cache_creation_input_tokens", 0),
        "out": u.get("output_tokens", 0),
        "cost": result.get("total_cost_usd", 0.0),
    }


def main():
    args = sys.argv[1:]
    sample_per = int(_flag(args, "--sample", 3))     # empirical claude -p calls per bucket
    calib_per = int(_flag(args, "--calib", 3))       # free count_tokens calls per bucket
    do_empirical = "--no-empirical" not in args

    days = load_days()
    n = len(days)
    total_commits = sum(len(c) for _, _, c in days)
    print(f"Backfill population: {n} multi-commit project-days, {total_commits} commits total")
    print(f"(single-commit days are verbatim — no model call — and excluded)\n")

    # ---- content-only estimate via count_tokens (free) ----
    try:
        token = oauth_token()
        system = system_prompt()
        preamble_tok = count_tokens("<commits>\n</commits>", token, system)
        calib = stratified(days, calib_per)
        ratios = []
        for _, _, commits in calib:
            prompt = build_prompt(commits)
            toks = count_tokens(prompt, token, system) - preamble_tok
            ratios.append(toks / len(prompt))
        r = sum(ratios) / len(ratios)
        content_in = preamble_tok * n + sum(int(len(build_prompt(c)) * r) for _, _, c in days)
        print("── Content-only (raw-API lower bound, the payload we control) ──")
        print(f"  fixed preamble: {preamble_tok} tokens/call  ({preamble_tok * n:,} total)")
        print(f"  calibrated ratio: {r:.3f} tok/char over {len(calib)} sampled prompts")
        print(f"  total input tokens (prompt content): {content_in:,}")
        print(f"  → raw-API input cost @ ${PRICE['in']}/1M: ${content_in / 1e6 * PRICE['in']:.2f} "
              f"(intro ${content_in / 1e6 * PRICE_INTRO['in']:.2f})\n")
    except Exception as e:
        print(f"  content estimate skipped ({type(e).__name__}: {e})\n")

    if not do_empirical:
        return

    # ---- empirical claude -p sample → extrapolate the true per-call cost ----
    print(f"── Empirical: sampling real `claude -p` calls ({sample_per}/bucket) ──")
    print("  (each carries Claude Code's own ambient context; cache warms as we go)")
    per_bucket = {i: [] for i in range(len(BUCKETS))}
    sample = stratified(days, sample_per)
    for date, proj, commits in sample:
        m = run_claude(commits)
        b = bucket_of(len(commits))
        if m:
            per_bucket[b].append(m)
            print(f"  {date} {proj:<18} {len(commits):>3}c  "
                  f"in={m['in']:>5} cw={m['cache_write']:>6} cr={m['cache_read']:>6} "
                  f"out={m['out']:>4}  ${m['cost']:.4f}")
        else:
            print(f"  {date} {proj:<18} {len(commits):>3}c  (call failed — skipped)")

    # population per bucket
    pop = {i: sum(1 for _, _, c in days if bucket_of(len(c)) == i) for i in range(len(BUCKETS))}
    agg = {k: 0.0 for k in ["in", "cache_read", "cache_write", "out", "cost"]}
    covered = 0
    for i in range(len(BUCKETS)):
        s = per_bucket[i]
        if not s or pop[i] == 0:
            continue
        covered += pop[i]
        for k in agg:
            avg = sum(x[k] for x in s) / len(s)
            agg[k] += avg * pop[i]

    if covered == 0:
        print("\n  No successful samples — cannot extrapolate.")
        return

    print(f"\n── Estimated TOTAL for backfilling {n} days (extrapolated from samples) ──")
    print(f"  variable input (our prompts):   {int(agg['in']):>12,} tok")
    print(f"  cache reads (ambient context):  {int(agg['cache_read']):>12,} tok")
    print(f"  cache writes (ambient context): {int(agg['cache_write']):>12,} tok")
    print(f"  output (summaries + thinking):  {int(agg['out']):>12,} tok")
    grand = agg["in"] + agg["cache_read"] + agg["cache_write"] + agg["out"]
    print(f"  grand total tokens:             {int(grand):>12,} tok")
    print(f"  estimated cost (API-equivalent): ${agg['cost']:.2f}")
    if covered < n:
        print(f"  note: {covered}/{n} days had a sampled bucket; rest assumed 0 "
              f"(widen --sample for full coverage)")
    print("\n  Caveats: total_cost_usd is API-equivalent (a Max/subscription plan isn't")
    print("  billed per-token). Cache write/read split depends on run spacing — a tight")
    print("  sequential re-backfill warms the cache and costs less per call than cold/")
    print("  concurrent calls. Thinking output varies per call.")


def _flag(args, name, default):
    if name in args:
        i = args.index(name)
        if i + 1 < len(args):
            return args[i + 1]
    return default


if __name__ == "__main__":
    main()
