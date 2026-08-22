# Handoff: Nightly personal-file sync — HP work laptop → OneDrive → MacBook Air

**Status:** ready to install · **Owner:** dm2116@gmail.com · **Last updated:** 2026-08-22
**Location:** `docs/ops/file-sync/` in `the-covenant-of-water`

---

## 0. Read this first (60 seconds)

**The problem.** Personal files created on the HP work laptop are supposed to reach the
personal MacBook Air via OneDrive. It worked when done by hand. It is not happening every
night, and — more importantly — *there is currently no way to tell whether it happened*.
"I don't think it's happening" is the real bug. A sync you cannot verify is a sync you do
not have.

**The fix, in three parts:**

1. **A scheduled job on the HP laptop** copies personal folders into the personal OneDrive
   every night at 23:00, and *catches up automatically* if the laptop was off.
2. **Every run writes a receipt** — a plain text file that syncs to OneDrive like any other
   file. Open it on your phone and it tells you, in English, when the sync last ran, whether
   it worked, and how many files moved.
3. **A trigger inbox** lets the phone start a run on demand. Drop any file into a OneDrive
   folder; the laptop notices within 15 minutes and runs.

**Why a "trigger inbox" instead of your phone talking to the laptop directly.** It can't.
A Claude session on your phone runs in the cloud; the HP laptop sits behind the work
network with nothing listening for inbound connections, and a work laptop is the last
machine that should have a remote-control port open. OneDrive is the one channel that
already crosses that boundary in both directions and is already trusted by IT. So we use it
as a mailbox: the phone drops a note in, the laptop checks the mailbox on a timer. This is
slower than a direct command (up to 15 minutes) and completely robust.

**Time to install:** ~25 minutes on the HP laptop, ~10 minutes on the MacBook.

---

## 1. Architecture

```
┌────────────────────────────┐
│  HP LAPTOP (Windows, work) │
│                            │
│  C:\Users\<you>\Documents\Personal   ─┐
│  C:\Users\<you>\Desktop\Personal     ─┤  robocopy, additive only
│  C:\Users\<you>\Pictures\Personal    ─┘  (never deletes)
│              │                              │
│              ▼                              │
│  %OneDriveConsumer%\PersonalSync\      ◄────┘   ← PERSONAL OneDrive, not work
│      Documents\  Desktop\  Pictures\
│      _status\
│          LAST-RUN.txt      ← receipt you read on your phone
│          last-run.json     ← receipt Claude/Zapier reads
│          mac-last-pull.json← written BY the MacBook, read here
│          inbox\            ← drop any file here to force a run
│                            │
│  Task Scheduler:           │
│    PersonalSync-Nightly  23:00 daily, catches up if missed
│    PersonalSync-Watcher  every 15 min, checks inbox\
└────────────┬───────────────┘
             │  Microsoft OneDrive (personal account)
             ▼
┌────────────────────────────┐            ┌──────────────────┐
│  MACBOOK AIR (personal)    │            │  PHONE           │
│                            │            │                  │
│  ~/Library/CloudStorage/   │            │  OneDrive app:   │
│    OneDrive-Personal/      │            │   read LAST-RUN  │
│      PersonalSync/         │            │   upload file to │
│         │                  │            │   inbox\ to      │
│         │ optional rsync   │            │   force a run    │
│         ▼                  │            │                  │
│  ~/PersonalFromWork/       │            │  Claude dispatch:│
│                            │            │   same, via      │
│  launchd: 07:30 and 18:30  │            │   prompts in §9  │
└────────────────────────────┘            └──────────────────┘
```

**Direction of travel is one-way: laptop → Mac.** Files you create on the MacBook do not
travel back to the HP laptop. That is deliberate (see §8).

---

## 2. Design decisions, and why

| Decision | Why |
|---|---|
| **Additive copy, never a mirror** | `robocopy /E /XO` with no `/MIR` and no `/PURGE`. Deleting a file on the work laptop must never delete your only copy on the Mac. The cost: renaming a file on the laptop produces *two* copies on the Mac. That trade is correct — a stray duplicate is an annoyance, a deleted original is a disaster. |
| **Personal OneDrive only, never the work tenant** | The scripts read `HKCU\Software\Microsoft\OneDrive\Accounts\Personal` to find the folder. A work account lives under `Business1`/`Business2` and is structurally excluded. Staging into the work tenant would put personal files under company retention/eDiscovery and could vanish on the day you leave. |
| **Receipts, not faith** | Every run writes `_status\LAST-RUN.txt`. This is the single feature that fixes the actual complaint. If the file is stale, the sync is broken, and you know within seconds from your phone. |
| **Task runs as *you*, interactively — not as SYSTEM** | The OneDrive client only runs inside your logged-on session. A task running as SYSTEM would copy files into a folder that never uploads — a silent failure that looks like success. This also means **no admin rights are needed**, which matters on a managed work laptop. |
| **`-StartWhenAvailable` on the nightly task** | This is the direct fix for "it didn't run last night." If the laptop was shut, in a bag, or on a plane at 23:00, the run fires as soon as the machine is back — instead of being skipped until tomorrow. |
| **Trigger *inbox folder*, not a specific filename** | Any file dropped in works — a photo, a note, a screenshot. The OneDrive mobile app can upload a file in three taps; it cannot easily create a file with an exact name. This makes phone-initiated runs actually usable. |
| **Mac writes a receipt back** | `mac-last-pull.json` closes the loop. Without it you know the files *left* the laptop but not that they *arrived*. |
| **15-minute polling, not a push** | See §0. Push would require an inbound listener on a work machine. Not worth it. |

---

## 3. Pre-flight — confirm these five things before installing

These are the assumptions this document is built on. Four are quick checks; #1 is the one
that can stop the whole plan.

1. **Personal OneDrive is allowed to run on the HP laptop.**
   Open OneDrive settings → *Account*. You should see two accounts, or at minimum a
   personal one. If the work tenant blocks consumer OneDrive (some MDM/DLP configurations
   do), **stop here** — none of this will work, and see §8 for the alternatives. Also worth
   a moment's thought: this moves *your own personal files* off a work machine, which is
   ordinary and fine, but anything work-owned should not go through this pipeline.

2. **Which folders actually hold personal files?**
   This document assumes `Documents\Personal`, `Desktop\Personal`, and `Pictures\Personal`.
   **This is a guess and is almost certainly wrong in the details.** Correct it in
   `sync-config.json` before the first run. Syncing all of `Documents` will drag in work
   material — pick real, personal-only subfolders.

3. **Storage headroom.** Free personal OneDrive is 5 GB. Check the current size of your
   chosen folders (right-click → Properties on Windows). If it exceeds the plan, either
   trim the source list or upgrade before running.

4. **The MacBook has the OneDrive app installed and signed in to the *same personal
   account*.** Check `~/Library/CloudStorage/` — you want a folder called
   `OneDrive-Personal`.

5. **A run time that works.** 23:00 is the default. Pick a time the laptop is usually on
   and awake but you are not using it. Avoid times when a VPN disconnect job or corporate
   patch window runs.

---

## 4. Part A — Install on the HP laptop (Windows)

Everything is under `docs/ops/file-sync/windows/`. Copy that folder to somewhere stable on
the laptop — `C:\Users\<you>\PersonalSync\` is a good choice. **Do not put the scripts
inside the OneDrive folder they manage.**

### A1. Configure

```powershell
cd C:\Users\<you>\PersonalSync
Copy-Item sync-config.example.json sync-config.json
notepad sync-config.json
```

Edit the `sources` array so it lists your real personal folders. Each entry's `name`
becomes the folder name on the Mac side, so keep names short and **never rename them later**
(renaming creates a second copy of everything).

### A2. Dry run — always do this first

```powershell
powershell -ExecutionPolicy Bypass -File .\Sync-PersonalFiles.ps1 -DryRun
```

This lists what *would* be copied and copies nothing. Read the output. If it names files
you don't recognise or work material, fix `sync-config.json` and run it again. Do not skip
this step — it is also the first time these scripts execute on a real Windows machine, so
it is where a typo or a policy block will surface.

### A3. First real run

```powershell
powershell -ExecutionPolicy Bypass -File .\Sync-PersonalFiles.ps1 -Reason manual
```

Expect the first run to be slow (it copies everything) and later runs to take seconds.
When it finishes, confirm the receipt exists:

```powershell
Get-Content "$env:OneDriveConsumer\PersonalSync\_status\LAST-RUN.txt"
```

### A4. Install the schedule

```powershell
powershell -ExecutionPolicy Bypass -File .\Install-SyncTasks.ps1 -At 23:00
```

No administrator rights required. It registers two tasks and prints their next run times.
To change the time later, just run it again with a different `-At`. To remove everything:
`.\Install-SyncTasks.ps1 -Uninstall` (this removes only the scheduled tasks — your files
and OneDrive folder are untouched).

### A5. Prove the schedule works

```powershell
Start-ScheduledTask -TaskName PersonalSync-Nightly
Start-Sleep -Seconds 30
Get-ScheduledTask -TaskName PersonalSync-Nightly, PersonalSync-Watcher |
    Get-ScheduledTaskInfo |
    Format-Table TaskName, LastRunTime, LastTaskResult, NextRunTime -AutoSize
```

`LastTaskResult` of `0` means success. Anything else, see §7.

### A6. Prove the phone trigger works

Create a file in the inbox from the laptop, and confirm the watcher picks it up:

```powershell
"test" | Set-Content "$env:OneDriveConsumer\PersonalSync\_status\inbox\test.txt"
Start-ScheduledTask -TaskName PersonalSync-Watcher
Start-Sleep -Seconds 20
Get-Content "$env:OneDriveConsumer\PersonalSync\_status\LAST-RUN.txt" | Select-Object -First 6
```

The receipt's `TRIGGER` line should now read `on-demand`, and `test.txt` should have moved
into `inbox\.claimed\`.

**Logs live at** `%LOCALAPPDATA%\PersonalSync\logs\sync-YYYY-MM.log`.

---

## 5. Part B — Install on the MacBook Air

Choose one option. **Option 1 is recommended** — it is fewer moving parts, and fewer moving
parts is the entire point of this exercise.

### Option 1 — Work directly in the OneDrive folder (recommended)

1. Open Finder → `~/Library/CloudStorage/OneDrive-Personal/`
2. Right-click the `PersonalSync` folder → **Always Keep on This Device**.
3. Drag `PersonalSync` to the Finder sidebar for one-click access.

That's it. Files arrive on their own. The "Always Keep on This Device" step matters: without
it, OneDrive stores placeholders and the files are not really on the laptop — which is
exactly what you *don't* want on a plane. Nothing else to install, nothing else to break.

### Option 2 — Copy into a plain local folder

Use this if you want the files somewhere outside OneDrive (e.g. so a Time Machine or Backblaze
backup treats them as ordinary local files, or so deleting from OneDrive later doesn't touch
them).

```bash
mkdir -p ~/bin ~/Library/LaunchAgents ~/Library/Logs/PersonalSync
cp docs/ops/file-sync/mac/pull-from-onedrive.sh ~/bin/
chmod +x ~/bin/pull-from-onedrive.sh

# Run once by hand first and read the output
~/bin/pull-from-onedrive.sh

# Then schedule it: 07:30, 18:30, and at every login
sed "s|__HOME__|$HOME|g" docs/ops/file-sync/mac/com.personal.onedrive-pull.plist \
  > ~/Library/LaunchAgents/com.personal.onedrive-pull.plist
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.personal.onedrive-pull.plist
```

Verify and control it:

```bash
launchctl print gui/$(id -u)/com.personal.onedrive-pull   # is it loaded?
launchctl kickstart -k gui/$(id -u)/com.personal.onedrive-pull   # run it right now
tail -n 40 ~/Library/Logs/PersonalSync/pull.log
launchctl bootout gui/$(id -u)/com.personal.onedrive-pull  # remove
```

> **macOS gotcha — grant Full Disk Access.** A launchd agent reading
> `~/Library/CloudStorage` or writing to `~/Documents` can be silently blocked by macOS
> privacy protection. The symptom is `Operation not permitted` in `pull.log` while the same
> command works fine when you run it in Terminal. Fix: **System Settings → Privacy &
> Security → Full Disk Access → +** and add `/bin/bash`. Press ⌘⇧G in the file picker to
> type the path. Then `launchctl kickstart -k …` to retry.

---

## 6. Part C — Using it from your phone

### "Did it run last night?"

Open the **OneDrive app** → `PersonalSync` → `_status` → **`LAST-RUN.txt`**. You get:

```
PERSONAL FILE SYNC - LAST RUN RECEIPT
=====================================

RESULT      : OK
FINISHED    : 2026-08-21 23:00:11 (Pacific Standard Time)
TRIGGER     : scheduled
COPIED      : 14 new/updated file(s), 122.4 MB
DURATION    : 38 second(s)
LAPTOP      : HP-LAPTOP-01
NEXT RUN    : 2026-08-22 23:00
...
```

**The 26-hour rule:** if `FINISHED` is more than about 26 hours old, or `RESULT` is not
`OK`, something is wrong. Everything else is noise.

### "Run it now"

Open the **OneDrive app** → `PersonalSync` → `_status` → `inbox` → **+ / Upload** → pick any
file at all (a screenshot is easiest). Within 15 minutes — assuming the laptop is on, awake,
and logged in — the sync runs and `LAST-RUN.txt` updates with `TRIGGER : on-demand`.

If the laptop is asleep or off, the trigger simply waits in the inbox and fires when it
wakes. Nothing is lost.

---

## 7. Troubleshooting

| Symptom | Most likely cause | Fix |
|---|---|---|
| `LAST-RUN.txt` is days old | Laptop was off/asleep at 23:00 and hasn't been back since | It will catch up on next login. If it doesn't, check `Get-ScheduledTaskInfo` — the task may be disabled. |
| `LAST-RUN.txt` never appeared at all | Nightly task never ran, or the staging folder isn't in the *personal* OneDrive | Run `Sync-PersonalFiles.ps1 -Reason manual` by hand and read the error. |
| Receipt says OK but files aren't on the Mac | Files copied into the folder but OneDrive hasn't uploaded them | Check the OneDrive tray icon on the laptop. Paused? Signed out? "Processing changes" forever? Quit and reopen OneDrive. |
| `LastTaskResult` is `0x41303` | Task has never run yet | Not an error. Wait for the schedule or `Start-ScheduledTask`. |
| `LastTaskResult` is `0x1` | Script exited with a failure | Read `%LOCALAPPDATA%\PersonalSync\logs\sync-YYYY-MM.log`. |
| Script: "Could not locate the PERSONAL OneDrive folder" | Personal account not signed in, or only the work tenant is present | Sign in to personal OneDrive. If IT blocks it, see §8. |
| Robocopy reports failures on a few files | Files were open (Word/Excel lock files) or path too long | Usually self-healing — next run picks them up. Persistent failures: add the pattern to `excludeFiles`. |
| Nightly task never fires while the lid is shut | Wake timers disabled by corporate power policy | `-WakeToRun` is set but can be overridden by policy. Fall back to relying on `-StartWhenAvailable` catch-up at next login — set the time to something like 12:30 when the laptop is likely open. |
| Mac: `Operation not permitted` in `pull.log` | macOS Full Disk Access | See the gotcha box in §5. |
| Mac: rsync exit 23 or 24 | Files On-Demand placeholders vanished mid-copy | Benign. Marking the folder "Always Keep on This Device" removes it. |
| Duplicate files on the Mac with slightly different names | A file was renamed on the laptop; additive copy keeps both | Expected behaviour (§2). Delete the stale one on the Mac; it will not come back unless it changes on the laptop. |
| OneDrive says "storage full" | 5 GB free tier | Trim `sources`, raise `maxFileMB` down, or upgrade the plan. |

---

## 8. Limitations — what this deliberately does not do

- **It is one-way.** Laptop → Mac. Files created on the MacBook stay on the MacBook. Making
  it two-way means real conflict resolution and a much bigger failure surface; if you want
  that, say so and we'll design it separately.
- **It never deletes anything on the receiving side.** Cleanup is a manual, occasional job.
- **It cannot run while the laptop is off.** No software fixes this. The catch-up behaviour
  is the mitigation.
- **The phone trigger is not instant.** Up to 15 minutes, plus OneDrive propagation.
- **It does not encrypt anything beyond what OneDrive already does.** If some of these files
  are genuinely sensitive, that's a separate conversation.
- **If IT blocks personal OneDrive on the work laptop, this plan is dead** and the realistic
  alternatives are: a personal USB drive on a schedule, a personal cloud client that *is*
  permitted, or simply not creating personal files on the work machine. Confirm §3.1 early.
- **The PowerShell has not been executed on a Windows machine yet.** It was written and
  syntax-reviewed but authored in a Linux container. The `-DryRun` step in §A2 exists
  precisely to catch anything that surfaces only at runtime — do not skip it.

---

## 9. Prompts to hand to Claude

Copy these verbatim. Each is self-contained.

### 9.1 — For Claude Code running **on the HP laptop** (install)

> I need you to install a nightly personal-file sync on this Windows laptop. The scripts and
> the full handoff document are in the repo `the-covenant-of-water` under
> `docs/ops/file-sync/` on branch `claude/file-sync-hp-macbook-onedrive-w2370g`. Read
> `HANDOFF.md` first, then follow section 4 exactly: copy the `windows/` folder to
> `C:\Users\<me>\PersonalSync`, help me fill in `sync-config.json` with my real personal
> folders (ask me — don't guess), run the dry run and show me the output before copying
> anything, then do the first real run and install the scheduled tasks. Finish by showing me
> the contents of `_status\LAST-RUN.txt` and the output of `Get-ScheduledTaskInfo` for both
> tasks. Do not use `/MIR` or anything that can delete files.

### 9.2 — For Claude Code running **on the MacBook Air** (install)

> Set up the receiving end of my OneDrive file sync on this Mac. Read
> `docs/ops/file-sync/HANDOFF.md` in `the-covenant-of-water` (branch
> `claude/file-sync-hp-macbook-onedrive-w2370g`), section 5. Confirm the OneDrive personal
> account is signed in and `~/Library/CloudStorage/OneDrive-Personal/PersonalSync` exists.
> Then set that folder to "Always Keep on This Device" and tell me if it worked. If I say I
> want the files outside OneDrive, do Option 2 instead: install
> `mac/pull-from-onedrive.sh` to `~/bin`, load the launchd agent, run it once, and show me
> the log.

### 9.3 — Daily check-in (phone, no connectors needed)

> Remind me to check my file sync. Tell me to open the OneDrive app →
> `PersonalSync/_status/LAST-RUN.txt` and read me back what to look for: `RESULT` should be
> `OK` and `FINISHED` should be less than 26 hours old. If I paste you the contents, tell me
> whether the sync is healthy and what to do if not.

### 9.4 — Daily check-in (automated, if a OneDrive connector is configured)

> Read `PersonalSync/_status/last-run.json` from my personal OneDrive. Tell me in one line
> whether the sync is healthy: `result` must be `OK` and `finishedAt` must be within the last
> 26 hours. If it's stale or failed, say so plainly, tell me the likely cause using the
> troubleshooting table in `docs/ops/file-sync/HANDOFF.md`, and offer to force a run.

### 9.5 — Force a run from the phone (automated)

> My file sync looks stale. Force a run: upload any small file into
> `PersonalSync/_status/inbox/` in my personal OneDrive — the filename doesn't matter. Then
> tell me the laptop will pick it up within 15 minutes if it's awake, and offer to re-check
> `_status/last-run.json` in 20 minutes.

### 9.6 — Set up a recurring reminder

> Create a Routine that fires every weekday at 08:00 my time and runs prompt 9.4 from
> `docs/ops/file-sync/HANDOFF.md`. If the sync is healthy, say nothing. If it's stale or
> failed, notify me.

> **On connectors:** 9.4 and 9.5 need Claude to have access to your personal OneDrive — via
> a OneDrive connector or a Zapier "Microsoft OneDrive" action (`Upload File`, `Find File`).
> Without one, use 9.3 and 9.5-by-hand, which need nothing but the OneDrive mobile app and
> work perfectly well. Ask me to wire up the connector if you want the automated version.

---

## 10. File inventory

| File | Runs on | Purpose |
|---|---|---|
| `HANDOFF.md` | — | This document |
| `windows/Sync-PersonalFiles.ps1` | HP laptop | The copy itself + writes receipts |
| `windows/Watch-RunNow.ps1` | HP laptop | Polls the OneDrive inbox for phone triggers |
| `windows/Install-SyncTasks.ps1` | HP laptop | Registers/removes the two scheduled tasks |
| `windows/sync-config.example.json` | HP laptop | Template — copy to `sync-config.json` and edit |
| `mac/pull-from-onedrive.sh` | MacBook | Option 2 only: copies out of OneDrive, writes a receipt back |
| `mac/com.personal.onedrive-pull.plist` | MacBook | Option 2 only: launchd schedule |

`sync-config.json` (the real one, with your folder paths) is intentionally **not** in the
repo — it is machine-specific and may name private directories.

---

## 11. Open questions for you

Answer these and the config can be finalised; until then §3.2's guessed folder list stands
as the working assumption.

1. Which exact folders on the HP laptop hold personal files?
2. Roughly how much data is that, and what's your OneDrive plan?
3. Does IT permit personal OneDrive on the work laptop?
4. Preferred nightly run time, and is the laptop usually awake then?
5. MacBook: Option 1 (work inside OneDrive) or Option 2 (copy to `~/PersonalFromWork`)?
6. Do you want the automated phone check (9.4/9.5), which needs a OneDrive connector wired up?
