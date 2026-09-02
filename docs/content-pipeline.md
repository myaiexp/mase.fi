# Content pipeline

The homepage's datastore is one JSON file. Three scripts in this repo, plus helm's `deploy`, read-modify-write it.

## Store

- Production file: `/var/www/html/updates.json` (default `UPDATES_FILE` in every writer)
- Served by nginx from the webroot; the client fetches `/updates.json` (`SOURCE_URL` in `src/data.js`)
- Shape: `{"entries": [...], "projects": [...]}` — one fetch provides both arrays
- Dates are ISO in JSON; the client formats Finnish DD.MM. Writers that default "today" use `Europe/Helsinki` (the VPS is UTC).
- `UPDATES_FILE` is overridable so writers can be exercised against a throwaway file (`UPDATES_FILE=/tmp/x.json mase-fi-update feature wander "…"`)

Local `pnpm dev` reads `/updates.json` from Vite's `public/` dir. There is no `public/` in the checkout — drop a gitignored fixture at `public/updates.json` or the app degrades to `projects: [], entries: []`. See CLAUDE.md Deploy.

## Shared writer — `scripts/updates-write.sh`

All three mase.fi writers source this file. It owns the safety contract:

- **Lock:** `/tmp/mase-updates-json.lock` (`UPDATES_LOCK` override for tests). Well-known `/tmp` path so `sudo -u mase` (no `XDG_RUNTIME_DIR`) and a session `deploy` still serialize against each other.
- **`ensure_updates_lock`:** opens the path with `O_NOFOLLOW|O_APPEND|O_CREAT` (Python; bash redirects cannot set `O_NOFOLLOW`), refuses a symlink or a file owned by someone else. Finding #8125 / commit `c2a5c8d`.
- **`with_updates_lock <target> <error-label> <transform-fn>`:** the locked read-modify-write. Owns `ensure_updates_lock`, `flock -w 30` on fd 9 with `9>>` (`O_APPEND`, never `O_TRUNC`), the in-lock `jq empty` gate, mktemp/rm of the candidate, and `write_updates_json`. The transform is a bash function `fn src dest` that writes a JSON candidate to `dest` (return 2 = skip, no write). All three mase.fi writers go through this so the lock discipline cannot drift.
- **`write_updates_json <candidate> <target>`:** `jq empty` the candidate, then install: sibling `mktemp` + `mv` when the target dir is writable (atomic rename); in-place `cp` when it isn't (`/var/www/html` is www-data-owned, so production currently takes the cp path). Invalid candidate → non-zero, target untouched.

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

### Log entries — helm `deploy` Step 3

`deploy` (`~/Projects/helm/scripts/deploy`) diffs `OLD_HEAD..NEW_HEAD` and prepends one `{date, project, text, category: "log"}` entry per non-merge commit subject, deduped per date+project+text, under the shared flock. The CLAUDE.md Deploy section is the command that ships the site; the same invocation logs the commits.

### Feature / project entries — `scripts/mase-fi-update`

Manual `project`/`feature` entries. Sticky capacity enforced server-side via `jq` (2 `project` entries, 3 `feature` entries). Omitted date defaults to today in `Europe/Helsinki` (`TZ="Europe/Helsinki" date +%Y-%m-%d`), matching daily-summary. A supplied `[date]` must be a real `YYYY-MM-DD` calendar day — anything else is refused before the flock.

On the laptop/desktop, `mase-fi-update` is a **machine-configs wrapper** (`.local/bin/mase-fi-update`, synced by `config-sync`) that SSHes to the VPS and runs `scripts/mase-fi-update` via `sudo -n -u mase` — `Host vps` logs in as root there, and the writer must run as mase (root can't take the mase-owned flock under `fs.protected_regular`). The wrapper forwards `UPDATES_FILE`, so `UPDATES_FILE=/tmp/x.json mase-fi-update feature wander "…"` exercises the whole chain against a throwaway file; a "broken on the laptop" report starts with that wrapper, not this script.

### Daily summaries — `scripts/mase-fi-daily-summary`

Systemd user timer at 23:55 Finnish time (`mase-fi-daily-summary.timer`). Groups today's `log` entries by project:

- Single-commit projects: the raw commit subject, verbatim
- Multi-commit projects: headless Claude Code CLI (`claude -p --model sonnet`), run from a throwaway empty dir so no ambient repo CLAUDE.md/recent-commit context leaks into the summary. Absolute path `/home/mase/.local/bin/claude` because the systemd *user* PATH omits `~/.local/bin`; uses `~/.claude` OAuth creds. The model judges how many distinct notable threads the day held and emits **1–3 legible lines** (`MAX_LINES` cap), each becoming its own `daily` entry. Internal churn (refactors/audits/tests) rides as a trailing mention or drops (the raw commits live in `#activity`).
- Fallback: a single `"project: N commits"` line on timeout/empty/non-zero exit (logged to the journal; a degraded run fires one ntfy alert)

Symlink: `~/.local/bin/mase-fi-daily-summary` → `scripts/mase-fi-daily-summary`. Idempotent: skips if today's `daily` entries already exist (re-checked inside the lock).
