# Content pipeline

The homepage's datastore is one JSON file plus an optional log archive. Four scripts in this repo, plus helm's `deploy`, read-modify-write it.

## Store

- Production file: `/var/www/html/updates.json` (default `UPDATES_FILE` in every writer)
- Log archive: `/var/www/html/updates-archive.json` (default `ARCHIVE_FILE`) — `log` entries older than `LOG_HOT_DAYS` (90). The `#activity` feed fetches it when the scroll-up sentinel exhausts the hot list.
- Served by nginx from the webroot; the client fetches `/updates.json` (`SOURCE_URL` in `src/data.js`) on every load
- Shape: `{"entries": [...], "projects": [...], "stats": {...}}` — one fetch provides the hot window. `stats` holds all-history `totalCommits`, `totalEntries`, `logFirst`/`logLast`, `commitsByProject`, `archivedLogs`, and `archive` (whether the archive file has rows). All are written at compact time. The client keeps the commit and entry totals live by adding its in-memory logs to `archivedLogs` until the archive is merged (`logStats` in `src/data.js`); `commitsByProject` stays a compact-time snapshot (idea #4713).
- Dates are ISO in JSON and the client renders them as ISO too: `YYYY-MM-DD` day separators and `HH:MM` row times (`dayOf` / `timeOf` in `src/dates.js`). Writers that default "today" use `Europe/Helsinki` (the VPS is UTC).
- `UPDATES_FILE` / `ARCHIVE_FILE` / `LOG_HOT_DAYS` are overridable so writers can be exercised against a throwaway file (`UPDATES_FILE=/tmp/x.json mase-fi-update feature wander "…"`)

`daily` entries store `{date, category, project, summary}` only — they do **not** embed a `commits` array (that field duplicated the `#activity` log and was ~39% of the payload). Compact (`scripts/mase-fi-compact-updates`, which `mase-fi-daily-summary` runs at the end of every run) strips any leftover `commits` keys, archives old logs, and rewrites `stats`.

Local `pnpm dev` reads `/updates.json` from Vite's `public/` dir. There is no `public/` in the checkout — drop a gitignored fixture at `public/updates.json` or the app degrades to `projects: [], entries: []`. See CLAUDE.md Deploy.

## Shared writer — `scripts/updates-write.sh`

All four mase.fi writers (`mase-fi-update`, `mase-fi-daily-summary`, `mase-fi-projects`, `mase-fi-compact-updates`) source this file. It owns the safety contract:

- **Lock:** `/tmp/mase-updates-json.lock` (`UPDATES_LOCK` override for tests). Well-known `/tmp` path so `sudo -u mase` (no `XDG_RUNTIME_DIR`) and a session `deploy` still serialize against each other.
- **`ensure_updates_lock`:** opens the path with `O_NOFOLLOW|O_APPEND|O_CREAT` (Python; bash redirects cannot set `O_NOFOLLOW`), refuses a symlink or a file owned by someone else. Finding #8125 / commit `c2a5c8d`.
- **`run_under_updates_lock <target> <error-label> <fn> [args...]`:** the only copy of the lock steps — `ensure_updates_lock`, `flock -w 30` on fd 9 with `9>>` (`O_APPEND`, never `O_TRUNC`), and the in-lock `jq empty` gate on `<target>` — then runs `fn args…` and returns its status. Lock unusable, busy >30s, or target malformed → returns 1 with `… — <error-label>` on stderr and `fn` is never called. Every writer's locked section goes through here, so the timeout, open flags, and gate cannot drift.
- **`with_updates_lock <target> <error-label> <transform-fn>`:** the single-file read-modify-write on top of `run_under_updates_lock`: mktemp/rm of the candidate plus `write_updates_json`. The transform is a bash function `fn src dest` that writes a JSON candidate to `dest` (return 2 = skip, no write). `mase-fi-update`, `mase-fi-daily-summary`, and `mase-fi-projects` use it.
- **`write_updates_json <candidate> <target>`:** `jq empty` the candidate, then install: sibling `mktemp` + `mv` when the target dir is writable (atomic rename); in-place `cp` when it isn't (`/var/www/html` is www-data-owned, so production currently takes the cp path). Invalid candidate → non-zero, target untouched.

### Compaction — `scripts/updates-compact.sh` + `scripts/mase-fi-compact-updates`

`updates-compact.sh` holds the transform: `compact_updates_json` (pure jq) and `compact_and_install <hot> <archive> <cutoff>` strip `commits`, move `log` entries older than the cutoff (today minus `LOG_HOT_DAYS`) into the archive, and write `stats`. Compaction writes two files, so `mase-fi-compact-updates` runs `compact_and_install` under `run_under_updates_lock` rather than `with_updates_lock`. It never loses a log:

- Install order is **archive first, then hot**. A failed hot install leaves the aged logs in both files, and the next compact and the client's `loadArchive` dedupe them. A failed archive install leaves the hot file untouched.
- An existing archive that is not `{entries:[...]}` (torn by an interrupted in-place `cp`, 0 bytes, hand-edited) fails the compact. Only a missing archive counts as empty.
- If the archive file is missing and cannot be created, compact degrades: strips `commits`, writes stats, keeps every log in the hot file, returns 3.

`mase-fi-compact-updates` exits 0 (compacted), 3 (degraded), or another non-zero status (failed — a busy lock or malformed `updates.json` included). `mase-fi-daily-summary` runs it at the end of every run, skip paths included, and never fails on it: a degraded or failed compact sends a `compact degraded` / `compact FAILED` ntfy instead.

helm's `deploy` (Step 3) does **not** source this file — it flocks the same path and writes with in-place `cp` — but it must keep using `/tmp/mase-updates-json.lock`. A new writer that skips the flock will interleave bytes with a concurrent deploy and tear the file.

## `.projects` — `scripts/mase-fi-projects`

Derived, not hand-edited. Regenerated from **helm showcase flags**:

```
helm project set-showcase <name> --url <url> --tagline "<blurb>" [--name "<Display>"]
```

That is how a project is added or removed from the homepage. `channel` = the helm project name (e.g. `"channel": "wander"`). Heat/recency are computed client-side from entries.

Runs at the top of `mase-fi-daily-summary` (nightly) and can be run by hand. Leaves `.projects` untouched if helm is unreachable or returns nothing.

Projects not in the helm registry, or whose channel must differ from their helm name (e.g. `porssi` ↔ `spot-price`), live in `scripts/showcase-extra.json`.

**Visibility:** only showcase projects with a public GitHub repo or live public deployment. Internal tools stay unflagged and appear only in update entries.

## `.entries`

Routed by `entry.category`:

| category | channel |
| --- | --- |
| `daily` | `#home` |
| `log` | `#activity` |
| `feature` / `project` | per-project channel |

`entry.project` (slug) is matched case-insensitively against `project.slug`, falling back to `project.channel`.

### Log entries — helm `deploy` Step 3 and the VPS-copy timer

Both go through helm's `scripts/log-commits-to-updates` (one jq pass under the shared flock), which prepends one `{date, project, text, category: "log"}` entry per non-merge commit subject and skips a subject the project already logged within ±1 day.

- **`deploy`** (`~/Projects/helm/scripts/deploy`) logs `OLD_HEAD..NEW_HEAD`, dated by deploy day. The CLAUDE.md Deploy section is the command that ships the site; the same invocation logs the commits.
- **Remote projects** (r-proxy, e.g. `modding` on the desktop) never run `deploy`: sessions ship with `r git push`. helm's 15-min `vps-copy-refresh` timer logs each VPS copy's `refs/helm/activity-logged..HEAD`, dated by commit day in Helsinki (helm `docs/substrates.md`, idea #5221).
- Desktop `git deployboth` (machine-configs) still appends the last commit of a push on its own; the ±1-day dedupe keeps it from doubling the timer's row.

### Feature / project entries — `scripts/mase-fi-update`

Manual `project`/`feature` entries. Sticky capacity enforced server-side via `jq` (2 `project` entries, 3 `feature` entries). Omitted date defaults to today in `Europe/Helsinki` (`TZ="Europe/Helsinki" date +%Y-%m-%d`), matching daily-summary. A supplied `[date]` must be a real `YYYY-MM-DD` calendar day — anything else is refused before the flock.

On the laptop/desktop, `mase-fi-update` is a **machine-configs wrapper** (`.local/bin/mase-fi-update`, synced by `config-sync`) that SSHes to the VPS and runs `scripts/mase-fi-update` via `sudo -n -u mase` — `Host vps` logs in as root there, and the writer must run as mase (root can't take the mase-owned flock under `fs.protected_regular`). The wrapper forwards `UPDATES_FILE`, so `UPDATES_FILE=/tmp/x.json mase-fi-update feature wander "…"` exercises the whole chain against a throwaway file; a "broken on the laptop" report starts with that wrapper, not this script.

### Daily summaries — `scripts/mase-fi-daily-summary`

Systemd user timer at 23:55 Finnish time (`mase-fi-daily-summary.timer`). Groups today's `log` entries by project:

- Single-commit projects: the raw commit subject, verbatim
- Multi-commit projects: headless Claude Code CLI (`claude -p --model sonnet`), stripped to the summarizer job: the instructions replace Claude Code's default prompt via `--system-prompt`, the user message is only the `<commits>` block of subject lines, and `--setting-sources "" --strict-mcp-config --effort low` drop user hooks/CLAUDE.md, claude.ai connector instructions and long thinking (~2–3k tokens a call, down from ~8.5k). Runs from a throwaway empty dir so no repo CLAUDE.md leaks in. `--bare` would strip more but refuses OAuth. Absolute path `/home/mase/.local/bin/claude` because the systemd *user* PATH omits `~/.local/bin`; uses `~/.claude` OAuth creds. The model judges how many distinct notable threads the day held and emits **1–3 legible lines** (`MAX_LINES` cap), each becoming its own `daily` entry. Internal churn (refactors/audits/tests) rides as a trailing mention or drops (the raw commits live in `#activity`).
- Fallback: a single `"project: N commits"` line on timeout/empty/non-zero exit (logged to the journal; a degraded run fires one ntfy alert)

Symlink: `~/.local/bin/mase-fi-daily-summary` → `scripts/mase-fi-daily-summary`. Idempotent: skips if today's `daily` entries already exist (re-checked inside the lock). Skip paths still compact (strip `commits`, archive old logs, rewrite `stats`).
