#!/bin/bash
#
# sync-notes.sh — make a durable personal copy of the notes corpus.
#
# WHAT THIS IS FOR
#   The work tenant's OneDrive folder on this Mac is not storage you control.
#   When the work account is deprovisioned, the sync client removes the local
#   copy. Anything that exists only there disappears with the account. This
#   script keeps a copy somewhere that outlives it.
#
# WHERE IT RUNS
#   Entirely on the personal Mac. Nothing is installed on the work laptop and
#   nothing runs inside the work tenant. It reads a folder this machine has
#   already synced and writes to a folder this machine owns.
#
# SAFETY
#   Additive only. No --delete, ever. --update never overwrites a newer local
#   copy. Deleting something at the destination does not delete it at the
#   source, and vice versa.
#
# Usage:
#   ./sync-notes.sh --now       always run
#   ./sync-notes.sh --if-due    run only if overdue or a trigger file is waiting
#   ./sync-notes.sh --dry-run   list what would copy, copy nothing

set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONF="$HERE/notes-sync.conf"

if [ ! -f "$CONF" ]; then
    echo "ERROR: $CONF not found. Copy notes-sync.conf.example and edit it."
    exit 1
fi
# shellcheck disable=SC1090
. "$CONF"

MODE="${1:---now}"
LOG_DIR="$HOME/Library/Logs/NotesSync"
LOG="$LOG_DIR/sync.log"
mkdir -p "$LOG_DIR"

log() { printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$1" >> "$LOG"; }
say() { printf '%s\n' "$1"; log "$1"; }

: "${NOTES_SOURCE:?NOTES_SOURCE not set in notes-sync.conf}"
: "${NOTES_DEST:?NOTES_DEST not set in notes-sync.conf}"
: "${MAX_AGE_HOURS:=20}"
: "${MAX_FILE_MB:=500}"

STATUS_DIR="$NOTES_DEST/_status"
INBOX="$STATUS_DIR/inbox"
RECEIPT_TXT="$STATUS_DIR/LAST-RUN.txt"
RECEIPT_JSON="$STATUS_DIR/last-run.json"

# ------------------------------------------------------------ preflight ----

if [ ! -d "$NOTES_SOURCE" ]; then
    say "ERROR: source not found: $NOTES_SOURCE"
    say "       Check ~/Library/CloudStorage/ — the work tenant folder name may have changed,"
    say "       or the account may have been signed out or deprovisioned."
    exit 1
fi

DEST_PARENT="$(dirname "$NOTES_DEST")"
if [ ! -d "$DEST_PARENT" ]; then
    say "ERROR: destination parent does not exist: $DEST_PARENT"
    exit 1
fi

# Refuse to write the durable copy inside a work-tenant folder — that would
# defeat the entire purpose of the script.
case "$NOTES_DEST" in
    *OneDrive-*|*SharePoint*)
        say "ERROR: NOTES_DEST points inside a work-tenant folder: $NOTES_DEST"
        say "       The durable copy must live somewhere the work account cannot revoke."
        exit 1
        ;;
esac

mkdir -p "$NOTES_DEST" "$STATUS_DIR" "$INBOX"

# ------------------------------------------------------- should we run? ----

TRIGGERED=0
TRIGGER_FILES=$(find "$INBOX" -maxdepth 1 -type f ! -name '.DS_Store' 2>/dev/null | wc -l | tr -d ' ')
[ "$TRIGGER_FILES" -gt 0 ] && TRIGGERED=1

if [ "$MODE" = "--if-due" ]; then
    DUE=0
    if [ ! -f "$RECEIPT_JSON" ]; then
        DUE=1
    else
        LAST_EPOCH=$(stat -f%m "$RECEIPT_JSON" 2>/dev/null || stat -c%Y "$RECEIPT_JSON" 2>/dev/null || echo 0)
        AGE_H=$(( ( $(date +%s) - LAST_EPOCH ) / 3600 ))
        [ "$AGE_H" -ge "$MAX_AGE_HOURS" ] && DUE=1
    fi
    if [ "$DUE" -eq 0 ] && [ "$TRIGGERED" -eq 0 ]; then
        log "not due, no trigger — skipping"
        exit 0
    fi
fi

REASON="scheduled"
[ "$TRIGGERED" -eq 1 ] && REASON="on-demand"
[ "$MODE" = "--now" ] && [ "$TRIGGERED" -eq 0 ] && REASON="manual"

# Claim triggers so they fire once.
if [ "$TRIGGERED" -eq 1 ]; then
    mkdir -p "$INBOX/.claimed"
    find "$INBOX" -maxdepth 1 -type f ! -name '.DS_Store' 2>/dev/null | while read -r t; do
        mv "$t" "$INBOX/.claimed/$(date '+%Y%m%d-%H%M%S')-$(basename "$t")" 2>/dev/null || rm -f "$t"
    done
    find "$INBOX/.claimed" -type f -mtime +30 -delete 2>/dev/null
fi

# ----------------------------------------------------------------- copy ----

START_EPOCH=$(date +%s)
STARTED_AT=$(date -u '+%Y-%m-%dT%H:%M:%SZ')
say "=== Sync starting ($REASON) ==="

RSYNC_ARGS=(-rt --update --no-perms --no-group --itemize-changes
            --exclude '_status/'
            --exclude '.DS_Store'
            --exclude '.tmp.drivedownload/'
            --exclude '.tmp.driveupload/')

for pat in "${EXTRA_EXCLUDES[@]:-}"; do
    [ -n "$pat" ] && RSYNC_ARGS+=(--exclude "$pat")
done

[ "$MAX_FILE_MB" -gt 0 ] 2>/dev/null && RSYNC_ARGS+=(--max-size="${MAX_FILE_MB}m")
[ "$MODE" = "--dry-run" ] && RSYNC_ARGS+=(--dry-run)

RSYNC_OUT=$(rsync "${RSYNC_ARGS[@]}" "$NOTES_SOURCE/" "$NOTES_DEST/" 2>&1)
RSYNC_RC=$?

printf '%s\n' "$RSYNC_OUT" >> "$LOG"

FILES_COPIED=$(printf '%s\n' "$RSYNC_OUT" | grep -c '^>f' || true)
[ -z "$FILES_COPIED" ] && FILES_COPIED=0

case "$RSYNC_RC" in
    0)     RESULT="OK" ;;
    23|24) RESULT="WARN" ;;   # vanished/unreadable mid-transfer — common with
    *)     RESULT="FAILED" ;; # cloud placeholders; next run picks them up
esac

DURATION=$(( $(date +%s) - START_EPOCH ))
FINISHED_AT=$(date -u '+%Y-%m-%dT%H:%M:%SZ')

if [ "$MODE" = "--dry-run" ]; then
    say "=== DRY RUN: $FILES_COPIED file(s) would copy. Nothing was written. ==="
    printf '%s\n' "$RSYNC_OUT" | grep '^>f' | head -50
    exit 0
fi

# ------------------------------------------------------------- manifest ----
# A record of what the corpus contained. If the source is ever wiped, this is
# the evidence of what was there.
MANIFEST="$STATUS_DIR/manifest-$(date '+%Y-%m').tsv"
find "$NOTES_DEST" -type f ! -path "$STATUS_DIR/*" ! -name '.DS_Store' 2>/dev/null \
    | while read -r f; do
        printf '%s\t%s\t%s\n' \
            "$(stat -f%z "$f" 2>/dev/null || stat -c%s "$f" 2>/dev/null)" \
            "$(stat -f%Sm -t '%Y-%m-%d' "$f" 2>/dev/null || date -r "$f" '+%Y-%m-%d' 2>/dev/null)" \
            "${f#$NOTES_DEST/}"
    done > "$MANIFEST"
TOTAL_KEPT=$(wc -l < "$MANIFEST" | tr -d ' ')
TOTAL_SIZE=$(du -sh "$NOTES_DEST" 2>/dev/null | cut -f1)

# ------------------------------------------------------------- receipts ----

SRC_ALIVE="yes"
[ -d "$NOTES_SOURCE" ] || SRC_ALIVE="NO — source folder is gone"

cat > "$RECEIPT_TXT" <<TXT
NOTES SYNC — LAST RUN RECEIPT
=============================

RESULT      : $RESULT
FINISHED    : $(date '+%Y-%m-%d %H:%M:%S %Z')
TRIGGER     : $REASON
NEW FILES   : $FILES_COPIED copied this run
CORPUS      : $TOTAL_KEPT file(s), $TOTAL_SIZE held in the durable copy
DURATION    : ${DURATION}s
MAC         : $(scutil --get ComputerName 2>/dev/null || hostname)
WORK SOURCE : $SRC_ALIVE

If RESULT is not OK, or FINISHED is more than ~26 hours old, something is
wrong. If WORK SOURCE says the folder is gone, the work account may have been
deprovisioned — the durable copy above is now the only copy.

To force a run: put any file into  _status/inbox/
This Mac checks that folder every 15 minutes while it is awake.
TXT

cat > "$RECEIPT_JSON" <<JSON
{
  "result": "$RESULT",
  "trigger": "$REASON",
  "startedAt": "$STARTED_AT",
  "finishedAt": "$FINISHED_AT",
  "durationSec": $DURATION,
  "filesCopiedThisRun": $FILES_COPIED,
  "corpusFileCount": $TOTAL_KEPT,
  "rsyncExit": $RSYNC_RC,
  "sourceAlive": $([ -d "$NOTES_SOURCE" ] && echo true || echo false),
  "mac": "$(scutil --get ComputerName 2>/dev/null || hostname)",
  "schemaVersion": 2
}
JSON

say "=== Finished: $RESULT — $FILES_COPIED new file(s), corpus now $TOTAL_KEPT files (${DURATION}s) ==="

if [ -f "$LOG" ] && [ "$(wc -c < "$LOG")" -gt 5000000 ]; then
    tail -n 2000 "$LOG" > "$LOG.trim" && mv "$LOG.trim" "$LOG"
fi

[ "$RESULT" = "FAILED" ] && exit 1
exit 0
