# Handoff: durable personal copy of work-laptop notes

**Status:** revised — v1 was built on a topology that doesn't exist
**Owner:** dm2116@gmail.com · **Last updated:** 2026-08-22
**Location:** `docs/ops/file-sync/` in `the-covenant-of-water`

> ⚠️ **This repository is PUBLIC.** Nothing in this folder names an employer,
> a project, a team, or an internal folder structure, and it must stay that
> way. All of that lives in `notes-sync.conf`, which is local and never
> committed. Do not paste real paths, folder names, or file listings into any
> file here, into a commit message, or into a PR description.

---

## 0. What changed, and why

The first version of this runbook assumed a **personal Microsoft OneDrive**
account as the transport: work laptop → personal OneDrive → MacBook. A survey
of the actual MacBook found that account doesn't exist. What's actually there:

- The only OneDrive on the Mac belongs to the **work tenant**.
- Personal cloud storage on the Mac is **Google Drive**, under the gmail account.
- ~18 GB of the corpus is already on the Mac in **two separate copies** outside
  OneDrive, and **~43% of the OneDrive content is duplicated against itself**.

Installed as written, v1 would have failed outright or silently resolved to the
work tenant — automating the exact problem it was meant to solve. So the design
changed in three ways.

### The problem was misdiagnosed

v1 said the bug was "it doesn't run nightly and you can't verify it." That was
your report, and verification is still worth having. But it isn't the thing that
will actually cost you.

**The real exposure: the work tenant's OneDrive folder is not storage you
control.** When the work account is deprovisioned, the sync client removes the
local copy from every machine signed into it — including the MacBook. Notes that
exist only there go with it, on someone else's schedule, without warning.

That reframes the goal. This is not a sync project. It is **getting a durable
personal copy of your own notes onto storage that survives the work account**,
and then keeping it current.

### The second problem: the corpus is a mess

18 GB in two copies, 43% internally duplicated. Making that copy reliable and
well-monitored produces a reliable, well-monitored duplicate of a mess. The
audit step (§3) now comes *first* and is not optional.

### Why it "worked fine a couple of days ago"

Because both machines are signed into the same work tenant, so OneDrive was
already carrying files between them. Nothing was ever built — you were using the
work tenant as the transport, which works right up until it doesn't.

**And the connector errors have the same root cause.** Pointing Claude at the
work OneDrive requires OAuth consent that only a tenant administrator can grant.
A healthcare organisation will not grant it to a third-party app. Those errors
aren't a misconfiguration to debug — that path is closed. All automation here
runs **locally on your own Mac** instead.

---

## 1. Corrected architecture

```
┌─────────────────────────────┐
│  WORK LAPTOP (Windows)      │   Nothing is installed here.
│                             │   No scripts, no scheduled tasks,
│  Notes live inside the      │   no admin rights, nothing new for
│  work tenant's OneDrive     │   anyone to notice.
│  folder (already synced)    │
└──────────────┬──────────────┘
               │  work tenant OneDrive — already working
               ▼
┌─────────────────────────────┐
│  MACBOOK AIR (personal)     │
│                             │
│  ~/Library/CloudStorage/    │  ← revocable. Wiped on deprovisioning.
│    OneDrive-<work tenant>/  │
│              │              │
│              │  sync-notes.sh — additive, never deletes
│              ▼              │
│  Google Drive (personal)    │  ← DURABLE. Survives the work account.
│    or a plain local folder  │
│      _status/LAST-RUN.txt   │     receipt, readable on your phone
│      _status/manifest.tsv   │     record of what existed
│      _status/inbox/         │     drop a file here to force a run
│                             │
│  launchd: every 15 min      │
└─────────────────────────────┘
```

Two properties worth naming:

**Everything runs on hardware you own.** The work laptop gets no scripts and no
scheduled tasks. The Mac reads a folder it has already synced and writes to a
folder it owns. No new channel is opened off the work machine.

**The receipt moved to the personal side.** It lands in Google Drive, so it
still reaches your phone — through a personal account rather than a work one.

---

## 2. Before anything else: the scope question

These are your notes — meeting notes, your own thinking, your action items. That
is an ordinary thing to want a durable copy of, and most of the value is in the
parts only you wrote.

Two things are worth being straight about, once:

**PHI is not the only line.** You've scoped this as "not PHI/PII" and that's the
right first filter, but work-tenant content is also employer-confidential by
default — internal strategy, governance discussion, unpublished research
direction. That's a separate category from patient data, and it doesn't become
personal because you typed it. The distinction that actually holds up is
**authorship**: notes you wrote are a much stronger claim than decks others
shared, exports, or attachments you received.

**"No PHI" is hard to guarantee across 18 GB by assertion.** In a clinical AI
context, identifiers turn up in places nobody intended — a case discussed in a
governance meeting, an MRN in a pasted screenshot, a de-identification example
that wasn't fully de-identified. §3 runs a mechanical screen for this. It's
triage, not proof.

The person who can actually rule on whether this is permitted is your compliance
team or your manager — not me, and not a runbook. If you've already had that
conversation, this section is just a checklist. If you haven't, it's worth
having before 18 GB moves, not after.

**What this document does not do:** it doesn't bypass anything. It copies files
your personal Mac has already synced, to another folder on that same Mac. If a
DLP control would block that, it will still block it.

### The narrower version, if you want it

Sync **only files you authored**, and exclude received material entirely. Fewer
files, a far stronger ownership claim, and it captures the thing you actually
said you wanted — your notes, your thoughts, your next steps. §5 shows the
config for this. It's the version I'd suggest starting with.

---

## 3. Step one: audit. Do not skip this.

`audit-notes.sh` changes nothing. It reads, counts, and reports.

```bash
cd ~/bin
./audit-notes.sh "/path/to/work/OneDrive/notes-root" "/path/to/personal/dest"
```

It answers three questions:

| Section | Question | Why it matters |
|---|---|---|
| 1. Size and shape | How big, how many files, by folder and by type | Tells you whether this fits in Google Drive and what you're actually dealing with |
| 2. Duplicates | What's byte-identical, within the source and against the destination | The 43% figure. Reclaimable space, and how much of the 18 GB is genuinely new |
| 3. Identifier screen | Which files contain SSN-shaped, MRN-shaped, DOB-adjacent or phone-shaped strings | Triage for §2 |

**On the identifier screen.** It reports **file paths and match counts only —
never the matched value.** Writing an identifier into a log would create exactly
the exposure the screen exists to find. A hit is not proof of anything: long
digit runs appear in dates, version numbers, and ticket IDs. A clean result is
not proof of absence either — it can't read inside Word, Excel, PowerPoint, or
PDF, so those are listed separately as needing manual review.

Read the report before configuring anything. It will change what you sync.

---

## 4. Step two: pick the destination

The destination must be somewhere the work account cannot revoke. `sync-notes.sh`
refuses to write anywhere with `OneDrive-` or `SharePoint` in the path.

| Option | Good for | Trade-off |
|---|---|---|
| **Google Drive (personal)** | Receipts reach your phone; off-machine backup | 18 GB against your Drive quota; content leaves the Mac |
| **Plain local folder** (`~/Notes`) | Nothing leaves the machine; simplest | No phone visibility; needs Time Machine or similar behind it |
| **Local + Drive for receipts only** | Corpus stays local, status is still visible on the phone | Slightly more setup |

If the audit shows the corpus is mostly duplicates, dedup first — you may find
the real figure is well under 18 GB.

---

## 5. Step three: install (MacBook only)

```bash
mkdir -p ~/bin ~/Library/Logs/NotesSync ~/Library/LaunchAgents
cp docs/ops/file-sync/mac/{sync-notes.sh,audit-notes.sh} ~/bin/
cp docs/ops/file-sync/mac/notes-sync.conf.example ~/bin/notes-sync.conf
chmod +x ~/bin/sync-notes.sh ~/bin/audit-notes.sh

ls ~/Library/CloudStorage/          # find the exact work tenant folder name
nano ~/bin/notes-sync.conf          # set NOTES_SOURCE and NOTES_DEST
```

`notes-sync.conf` holds the real paths and is **never committed**.

### The authored-only variant

To sync only what you wrote, add received-material folders to `EXTRA_EXCLUDES`
in the config — shared decks, downloads, attachments, exports — and point
`NOTES_SOURCE` at your notes root rather than the whole tenant folder.

### Dry run, then real run

```bash
~/bin/sync-notes.sh --dry-run    # lists what would copy, copies nothing
~/bin/sync-notes.sh --now
cat "$(grep '^NOTES_DEST' ~/bin/notes-sync.conf | cut -d'"' -f2)/_status/LAST-RUN.txt"
```

### Schedule it

```bash
sed "s|__HOME__|$HOME|g" docs/ops/file-sync/mac/com.personal.notes-sync.plist \
  > ~/Library/LaunchAgents/com.personal.notes-sync.plist
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.personal.notes-sync.plist
launchctl kickstart -k gui/$(id -u)/com.personal.notes-sync    # run now
launchctl print gui/$(id -u)/com.personal.notes-sync           # verify
```

One agent covers both jobs: it wakes every 15 minutes and exits immediately
unless the last run is overdue or a trigger file is waiting.

> **macOS gotcha — Full Disk Access.** A launchd agent reading
> `~/Library/CloudStorage` can be silently blocked by macOS privacy protection.
> Symptom: `Operation not permitted` in `~/Library/Logs/NotesSync/sync.log`
> while the same command works in Terminal. Fix: **System Settings → Privacy &
> Security → Full Disk Access → +**, add `/bin/bash` (⌘⇧G to type the path),
> then `launchctl kickstart -k …`.

---

## 6. Nothing to install on the work laptop

This is deliberate, and it's a change from v1.

If your notes already live inside the work tenant's OneDrive folder — which they
do, since the Mac is receiving them — then leg one is already running. OneDrive
does it. There is nothing to schedule and nothing to add.

If some folder on the laptop sits *outside* OneDrive, **move it in once, by
hand.** That's a drag-and-drop, not a script. It needs no admin rights, no
scheduled task, and adds nothing to a managed machine.

This also sidesteps the connector problem entirely: no tenant consent is needed
because nothing touches the tenant's API.

---

## 7. Checking it from your phone

Google Drive app → your notes folder → `_status` → **`LAST-RUN.txt`**:

```
NOTES SYNC — LAST RUN RECEIPT
=============================

RESULT      : OK
FINISHED    : 2026-08-22 07:30:14 PDT
TRIGGER     : scheduled
NEW FILES   : 6 copied this run
CORPUS      : 4,182 file(s), 11G held in the durable copy
DURATION    : 52s
MAC         : MacBook Air
WORK SOURCE : yes
```

**Two lines matter.** `RESULT` should be `OK` and `FINISHED` should be under ~26
hours old. `WORK SOURCE` is the deprovisioning canary: if it reports the folder
is gone, the durable copy is now the only copy — which is the outcome this whole
exercise exists to produce.

**To force a run:** Google Drive app → `_status` → `inbox` → upload any file. A
screenshot works. It runs within 15 minutes if the Mac is awake.

`_status/manifest-YYYY-MM.tsv` lists every file held, with size and date — a
record of what existed even if the source disappears.

---

## 8. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `ERROR: source not found` | Work tenant folder renamed, signed out, or deprovisioned | `ls ~/Library/CloudStorage/` and update `NOTES_SOURCE`. If it's gone entirely, the durable copy is now the only copy. |
| `ERROR: NOTES_DEST points inside a work-tenant folder` | Destination is inside OneDrive/SharePoint | Working as intended. Pick a personal destination. |
| Receipt over 26 hours old | Mac asleep, or agent not loaded | `launchctl print gui/$(id -u)/com.personal.notes-sync` |
| `Operation not permitted` in the log | macOS Full Disk Access | See the gotcha in §5 |
| rsync exit 23 / 24 | Cloud placeholders vanished mid-copy | Benign; next run picks them up. Mark the source "Always Keep on This Device". |
| Sync is very slow the first time | Files On-Demand hydrating placeholders | Expected once. Later runs are incremental. |
| Google Drive quota full | 18 GB against a 15 GB free tier | Run the audit and dedup first, or go local-only |
| Claude can't reach the work OneDrive | Tenant admin consent — not grantable | Not fixable. Automation runs locally instead (§0). |

---

## 9. Limitations

- **One-way.** Work tenant → personal copy. Edits on the personal side don't go back.
- **Never deletes.** Cleanup is manual and occasional.
- **The identifier screen is triage, not a compliance control.** It cannot read
  Office or PDF binaries, and pattern matching both over- and under-reports.
- **Nothing here is a legal or policy opinion.** Whether this is permitted is a
  question for your compliance team.
- **If the work account is deprovisioned before this runs, the window is closed.**
  That is the argument for doing the audit this week rather than next month.
- **Untested against your real corpus.** These scripts were written in a Linux
  container. Bash and plist syntax are verified; behaviour against 18 GB of real
  files is not. The audit is report-only and the sync has a dry-run mode —
  use both first.

---

## 10. Prompts

> Keep real folder names out of anything you paste into a public repo, a commit
> message, or a PR description. In the prompts below, describe paths rather than
> quoting them where you can.

**On the MacBook — audit first**

> Read `docs/ops/file-sync/HANDOFF.md` in `the-covenant-of-water`, branch
> `claude/file-sync-hp-macbook-onedrive-w2370g`. Install `audit-notes.sh` to
> `~/bin` and run it against my work OneDrive notes root and my intended
> personal destination — ask me for both paths, don't guess. Then walk me
> through the report: how much is duplicated, how much is genuinely new, and
> which files the identifier screen flagged. Don't install the sync or change
> anything yet. Don't paste real folder paths into any file that gets committed
> — the repo is public.

**On the MacBook — install the sync**

> Following section 5 of `docs/ops/file-sync/HANDOFF.md`, install
> `sync-notes.sh` and the launchd agent on this Mac. Help me fill in
> `notes-sync.conf` — ask me for the paths. Run the dry run and show me the
> output before anything is copied. Then do the first real run and show me
> `_status/LAST-RUN.txt`. The destination must not be inside any work tenant
> folder.

**Daily check (no connector needed — that path is closed)**

> Remind me to check my notes sync: Google Drive app → my notes folder →
> `_status/LAST-RUN.txt`. `RESULT` should be `OK`, `FINISHED` under 26 hours
> old, and `WORK SOURCE` should say yes. If I paste it to you, tell me whether
> it's healthy.

---

## 11. Open questions

1. **Has anyone at work signed off on this?** Changes how much to sync, and
   whether the authored-only variant is the right starting point.
2. **Is the work account at any near-term risk** — role change, offboarding,
   reorg? Changes the urgency of the audit.
3. **Google Drive or local-only** for the durable copy? Depends on the audit's
   real size figure and your Drive quota.
4. **Everything, or authored-only?** My suggestion is authored-only to start.
5. **What are the two existing 18 GB copies on the Mac,** and can they be folded
   into one destination? Right now they're a third and fourth copy of the mess.
