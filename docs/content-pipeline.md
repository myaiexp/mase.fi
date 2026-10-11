# Content pipeline

The homepage's datastore is one JSON file plus an optional log archive. Four scripts in this repo, plus helm's `deploy`, read-modify-write it.

## Store

- Production file: `/var/lib/mase-fi/updates.json` (`UPDATES_FILE_DEFAULT` in `updates-write.sh`, the default `UPDATES_FILE` of every writer; helm's `deploy` and `log-commits-to-updates` carry the same path)
- Log archive: `/var/lib/mase-fi/updates-archive.json` (default `ARCHIVE_FILE`, the store's sibling) — `log` entries older than `LOG_HOT_DAYS` (90). The `#activity` feed fetches it when the scroll-up sentinel exhausts the hot list (`loadArchive` in `src/data-archive.js`); archive rows go through the same `normalizeEntry` (`src/data-normalize.js`) as hot rows. `data.archiveLoaded` is set only after a successful merge, so a failed load keeps the totals on `stats.archivedLogs` / `stats.archivedByProject`, and the feed drops its sentinel and retries on the next `#activity` render.
- Served by two exact-match nginx `alias` locations in `sites-available/default` (no `add_header` of their own, so they inherit the server-level headers). The dir is mase-owned and outside the www-data webroot, which is what lets writers install by rename (idea #2487). The client fetches `/updates.json` (`SOURCE_URL` in `src/data.js`) on every load
- Shape: `{"entries": [...], "projects": [...], "stats": {...}}` — one fetch provides the hot window. `stats` holds all-history `totalCommits`, `totalEntries`, `logFirst`/`logLast`, `commitsByProject`, `archivedLogs`, `archivedByProject` (archived log count per raw `entry.project`), and `archive` (whether the archive file has rows). All are written at compact time. The client keeps the commit and entry totals live by adding its in-memory logs to `archivedLogs` until the archive is merged (`logStats` in `src/log-stats.js`); per-project counts do the same with `archivedByProject` (`commitsForProject`), falling back to the `commitsByProject` snapshot for a file compacted before that field existed.
- Dates are stored as `YYYY-MM-DD` (a Europe/Helsinki calendar day, no zone and no clock). Every writer stamps that shape: `mase-fi-update`, `mase-fi-daily-summary`'s `TODAY`, and helm's `log-commits-to-updates` (stdin lines are `YYYY-MM-DD<TAB>subject`). `normalizeDate` in `src/dates.js` pads a bare day to `YYYY-MM-DDT00:00`, so the feed's `HH:MM` column (`timeOf`) is midnight unless a row already carried a time. A `YYYY-MM-DDTHH:MM` stamp still normalizes, but the daily summary keeps today's rows with an exact `.date == $TODAY` compare, so a timed stamp would miss that filter. Day headers come from `dayLabel()` in `src/feed.js`: the ISO day (`dayOf`), prefixed `today · ` or `yesterday · ` when it matches the writers' day (`entryNow()` in `src/dates.js`, Europe/Helsinki). Writers that default "today" use `Europe/Helsinki` (the VPS is UTC).
- `UPDATES_FILE` / `ARCHIVE_FILE` / `LOG_HOT_DAYS` are overridable so writers can be exercised against a throwaway file (`UPDATES_FILE=/tmp/x.json mase-fi-update wander "…"`)

`daily` entries store `{date, category, project, summary}` only — they do **not** embed a `commits` array (that field duplicated the `#activity` log and was ~39% of the payload). Compact (`scripts/mase-fi-compact-updates`, which `mase-fi-daily-summary` runs at the end of every run) strips any leftover `commits` keys, archives old logs, and rewrites `stats`.

Local `pnpm dev` reads `/updates.json` from Vite's `public/` dir. There is no `public/` in the checkout — drop a gitignored fixture at `public/updates.json` or the app degrades to `projects: [], entries: []`. See CLAUDE.md Deploy.

## Shared writer — `scripts/updates-write.sh`

All four mase.fi writers (`mase-fi-update`, `mase-fi-daily-summary`, `mase-fi-projects`, `mase-fi-compact-updates`) source this file. It owns the safety contract:

- **Lock:** `/tmp/mase-updates-json.lock` (`UPDATES_LOCK` override for tests). Well-known `/tmp` path so `sudo -u mase` (no `XDG_RUNTIME_DIR`) and a session `deploy` still serialize against each other.
- **`ensure_updates_lock`:** opens the path with `O_NOFOLLOW|O_APPEND|O_CREAT` (Python; bash redirects cannot set `O_NOFOLLOW`), refuses a symlink or a file owned by someone else. Finding #8125 / commit `c2a5c8d`.
- **`run_under_updates_lock <target> <error-label> <fn> [args...]`:** the only copy of the lock steps — `ensure_updates_lock`, `flock -w 30` on fd 9 with `9>>` (`O_APPEND`, never `O_TRUNC`), and the in-lock `is_updates_json` gate on `<target>` (exactly one JSON object with an `entries` array — `jq empty` passed 0-byte files) — then runs `fn args…` and returns its status. Lock unusable, busy >30s, or target malformed → returns 1 with `… — <error-label>` on stderr and `fn` is never called. Every writer's locked section goes through here, so the timeout, open flags, and gate cannot drift.
- **`with_updates_lock <target> <error-label> <transform-fn>`:** the single-file read-modify-write on top of `run_under_updates_lock`: mktemp/rm of the candidate plus `write_updates_json`. The transform is a bash function `fn src dest` that writes a JSON candidate to `dest` (return 2 = skip, no write). `mase-fi-update`, `mase-fi-daily-summary`, and `mase-fi-projects` use it.
- **`write_updates_json <candidate> <target>`:** `is_updates_json` the candidate, then install: sibling `mktemp` + `mv` when the target dir is writable (atomic rename); in-place `cp` when it isn't (production's `/var/lib/mase-fi` is mase-writable, so it takes the rename path). Invalid candidate → non-zero, target untouched.

### Compaction — `scripts/updates-compact.sh` + `scripts/mase-fi-compact-updates`

`updates-compact.sh` holds the transform: `compact_updates_json` (pure jq) and `compact_and_install <hot> <archive> <cutoff>` strip `commits`, move `log` entries older than the cutoff (today minus `LOG_HOT_DAYS`) into the archive, and write `stats`. Compaction writes two files, so `mase-fi-compact-updates` runs `compact_and_install` under `run_under_updates_lock` rather than `with_updates_lock`. It never loses a log:

- Install order is **archive first, then hot**. A failed hot install leaves the aged logs in both files, and the next compact and the client's `loadArchive` dedupe them. A failed archive install leaves the hot file untouched.
- An existing archive that is not `{entries:[...]}` (torn by an interrupted in-place `cp`, 0 bytes, hand-edited) fails the compact. Only a missing archive counts as empty.
- If the archive file is missing and cannot be created, compact degrades: strips `commits`, writes stats, keeps every log in the hot file, returns 3.

`mase-fi-compact-updates` exits 0 (compacted), 3 (degraded), or another non-zero status (failed — a busy lock or malformed `updates.json` included). `mase-fi-daily-summary` runs it at the end of every run, skip paths included, and never fails on it: a degraded or failed compact sends a `compact degraded` / `compact FAILED` ntfy instead.

helm's commit logger (`scripts/log-commits-to-updates`, used by `deploy` Step 3 and the VPS-copy timer) does **not** source this file. It flocks the same `/tmp/mase-updates-json.lock` and installs like `write_updates_json`: a sibling temp file plus `mv` when the target directory is writable (production `/var/lib/mase-fi` is, so the live path is that atomic rename), and in-place `cp` only when the directory is not. A new writer that skips the flock will interleave bytes with a concurrent deploy and tear the file.

## `.projects` — `scripts/mase-fi-projects`

Derived, not hand-edited. Regenerated from helm's public channel list (`GET /api/projects/showcase`). A project is listed unless its visibility resolves private — its own setting, or the nearest registered ancestor's — or a feed embargo is in force. `helm project update <name> --visibility private` takes it off the list and purges rows already published; `--visibility inherit` drops the project's own setting so an ancestor decides. There is no showcase opt-in flag.

`channel` = the helm project name (e.g. `"channel": "wander"`), unless `scripts/showcase-extra.json` overrides it. Heat/recency are computed client-side from entries. A stored `url` of null is left null; the client renders no link.

Runs at the top of `mase-fi-daily-summary` (nightly), which then runs `mase-fi-purge-private`, and can be run by hand. Leaves `.projects` untouched if helm is unreachable or returns nothing.

Projects not in the helm registry, or whose channel must differ from their helm name (e.g. `porssi` ↔ `spot-price`), live in `scripts/showcase-extra.json`. Extras are applied first and win on slug, so that override replaces the API row.

## `.entries`

Where a row shows (`normalizeEntry` stores `channel`; `entriesFor` selects):

| category | where it shows |
| --- | --- |
| `daily` | `#home`, and the project channel when the slug resolves |
| `log` | `#activity` only |
| `feature` | the resolved project channel; dropped when the slug matches nothing |

`entry.project` is matched case-insensitively against one key per project: `project.slug` lowercased when that field is a non-empty string, otherwise `project.channel` lowercased (`projectSlug` / `buildSlugToChannel` in `src/data-normalize.js`). When both are set and they differ (`scripts/showcase-extra.json`: `porssi`/`spot-price`, `fortunemill`/`fortunemill-solver`, `iseps`/`iseps-solver`), the channel name is not a match key. An entry stamped with that channel name does not resolve: a `feature` is dropped by `normalizeEntry`, and a `daily` lands on `#home` via the category fallback rather than the project channel.

### Log entries — helm `deploy` Step 3 and the VPS-copy timer

Both go through helm's `scripts/log-commits-to-updates` (one jq pass under the shared flock), which prepends one `{date, project, text, category: "log"}` entry per non-merge commit subject and skips a subject the project already logged within ±1 day.

- **`deploy`** (`~/Projects/helm/scripts/deploy`) logs `OLD_HEAD..NEW_HEAD`, dated by deploy day. The CLAUDE.md Deploy section is the command that ships the site; the same invocation logs the commits.
- **Remote projects** (r-proxy, e.g. `modding` on the desktop) never run `deploy`: sessions ship with `r git push`. helm's 15-min `vps-copy-refresh` timer logs each VPS copy's `refs/helm/activity-logged..HEAD`, dated by commit day in Helsinki (helm `docs/substrates.md`, idea #5221).
- Desktop `git deployboth` (machine-configs) still appends the last commit of a push on its own; the ±1-day dedupe keeps it from doubling the timer's row.
- A project held back from the feed — private visibility, or a **feed embargo** (below) — is not logged by any of the three: the writer prints `Feed embargo — logged 0 of N commit(s)` and exits 0.

### Feed visibility and embargo — keeping a project out of the feed

A project is public unless its visibility resolves private. Visibility is a helm setting (`helm project update <name> --visibility public|private|inherit`): the project's own setting wins, else the nearest registered ancestor that has one, else public. Going private purges that project's rows from both feed files (`scripts/mase-fi-purge-private`, also run nightly by `mase-fi-daily-summary` right after the channel-list refresh). Going public again does not backfill. A purge failure alerts via ntfy and does not fail the nightly summary; the next night retries.

`.embargo` is a separate, time-limited withhold and does not purge by itself. The file sits at the repo root; its first non-blank line that does not start with `#` is a date, `YYYY-MM-DD`. While today in `Europe/Helsinki` is before that date, nothing new about the project is written to `updates.json` — no `log` rows, no `feature` entry, no `daily` summary, and the channel list omits it. From the date on, writing resumes for what happens after it; nothing withheld is added later. A `.embargo` with no valid date on that line embargoes the project indefinitely (fail closed), and so does a check that could not be made.

helm owns the decision, because it knows where each project's repo is and what its visibility resolves to: `helm project embargo <project>` exits **0** when the project is clear, **3** when it is embargoed or private (the line names which), anything else when it could not tell. The details are in helm's `docs/deployment.md` § Feed visibility and embargo. On this side:

- `feed_embargo_gate <project>` in `scripts/updates-write.sh` runs that command (`HELM_BIN`, default the absolute path of the VPS's helm CLI) and returns 0 only on a clear answer. **Any writer that takes a project name calls it before writing.**
- `mase-fi-update` calls it before touching the file: a held-back project exits **3** with helm's line on stderr, an undetermined check exits 1. helm's `deploy --update` reports the 3 as an info line and still succeeds.
- `mase-fi-daily-summary` calls it per project, before the commits go to the summarizer. This covers `log` rows written before a project's `.embargo` existed, which are still in the day's batch. A project skipped because the check could not be made is counted and alerted through ntfy.
- `mase-fi-projects` needs no gate of its own: helm's channel list already omits a private or embargoed project. `mase-fi-purge-private` is what removes rows already published; it reads `GET /api/projects/private` and writes nothing if that list is missing or malformed.

### Feature entries — `scripts/mase-fi-update`

`mase-fi-update <project> <text> [date]` prepends one `feature` entry (helm's `deploy --update "<text>"` calls it). It refuses a project helm's check holds back — private or embargoed (above). Features are the only manual category: `project` (a "new project" announcement) and the per-category `sticky` flag predate the IRC rework, and the current frontend reads neither, so both are gone and the old `project` rows were rewritten as `feature`. A leading `feature`/`project` word is still accepted and ignored, so older callers keep working. Omitted date defaults to today in `Europe/Helsinki` (`TZ="Europe/Helsinki" date +%Y-%m-%d`), matching daily-summary. A supplied `[date]` must be a real `YYYY-MM-DD` calendar day — anything else is refused before the flock.

On the laptop/desktop, `mase-fi-update` is a **machine-configs wrapper** (`.local/bin/mase-fi-update`, synced by `config-sync`) that SSHes to the VPS and runs `scripts/mase-fi-update` via `sudo -n -u mase` — `Host vps` logs in as root there, and the writer must run as mase (root can't take the mase-owned flock under `fs.protected_regular`). The wrapper forwards `UPDATES_FILE`, so `UPDATES_FILE=/tmp/x.json mase-fi-update wander "…"` exercises the whole chain against a throwaway file; a "broken on the laptop" report starts with that wrapper, not this script.

### Daily summaries — `scripts/mase-fi-daily-summary`

Systemd user timer at 23:55 Finnish time (`mase-fi-daily-summary.timer`). Groups today's `log` entries by project:

- Single-commit projects: the raw commit subject, verbatim
- Multi-commit projects: headless Claude Code CLI (`claude -p --model sonnet`), stripped to the summarizer job: the instructions replace Claude Code's default prompt via `--system-prompt`, the user message is only the `<commits>` block of subject lines, and `--setting-sources "" --strict-mcp-config --effort low` drop user hooks/CLAUDE.md, claude.ai connector instructions and long thinking (~2–3k tokens a call, down from ~8.5k). Runs from a throwaway empty dir so no repo CLAUDE.md leaks in. `--bare` would strip more but refuses OAuth. Absolute path `/home/mase/.local/bin/claude` because the systemd *user* PATH omits `~/.local/bin`; uses `~/.claude` OAuth creds. The model judges how many distinct notable threads the day held and emits **1–3 legible lines** (`MAX_LINES` cap), each becoming its own `daily` entry. Internal churn (refactors/audits/tests) rides as a trailing mention or drops (the raw commits live in `#activity`).
- Fallback: a single `"project: N commits"` line on timeout/empty/non-zero exit (logged to the journal; a degraded run fires one ntfy alert)

Symlink: `~/.local/bin/mase-fi-daily-summary` → `scripts/mase-fi-daily-summary`. Idempotent: skips if today's `daily` entries already exist (re-checked inside the lock). Skip paths still compact (strip `commits`, archive old logs, rewrite `stats`).
