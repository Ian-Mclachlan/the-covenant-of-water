#!/bin/bash
#
# pull-from-onedrive.sh
#
# MacBook Air side of the sync. Copies anything new out of the OneDrive
# staging folder into a plain local folder, then writes a receipt back into
# OneDrive so the laptop (and your phone) can see the round trip completed.
#
# Additive only: --update never overwrites a newer local copy, and there is
# deliberately no --delete. Deleting a file here does not delete it on the HP
# laptop, and vice versa.
#
# Only needed if you want the files to live OUTSIDE the OneDrive folder. If you
# are happy working directly in ~/Library/CloudStorage/OneDrive-Personal/
# PersonalSync, skip this script entirely and just mark that folder
# "Always Keep on This Device" in Finder.
#
# Usage:  ./pull-from-onedrive.sh [destination]
# Default destination: ~/PersonalFromWork

set -uo pipefail

STAGE_FOLDER_NAME="PersonalSync"
DEST="${1:-$HOME/PersonalFromWork}"
LOG_DIR="$HOME/Library/Logs/PersonalSync"
LOG="$LOG_DIR/pull.log"

mkdir -p "$LOG_DIR"

log() { printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$1" | tee -a "$LOG"; }

# --- locate the personal OneDrive root -------------------------------------
# macOS 12.3+ puts cloud providers under ~/Library/CloudStorage. Older installs
# used ~/OneDrive. A work account appears as "OneDrive-<Tenant>", so match the
# personal one explicitly and never fall through to the work folder.
OD=""
for candidate in \
    "$HOME/Library/CloudStorage/OneDrive-Personal" \
    "$HOME/OneDrive" ; do
    if [ -d "$candidate" ]; then OD="$candidate"; break; fi
done

if [ -z "$OD" ]; then
    log "ERROR: personal OneDrive folder not found. Is the OneDrive app signed in to the personal account?"
    exit 1
fi

SRC="$OD/$STAGE_FOLDER_NAME"
STATUS_DIR="$SRC/_status"

if [ ! -d "$SRC" ]; then
    log "ERROR: staging folder not found: $SRC"
    log "       The HP laptop has not completed a run yet, or OneDrive has not finished syncing it down."
    exit 1
fi

mkdir -p "$DEST"

START_EPOCH=$(date +%s)
STARTED_AT=$(date -u '+%Y-%m-%dT%H:%M:%SZ')
log "=== Pull starting: $SRC -> $DEST ==="

# --- how stale is the laptop's last run? -----------------------------------
LAPTOP_RUN="unknown"
if [ -f "$STATUS_DIR/last-run.json" ]; then
    LAPTOP_RUN=$(/usr/bin/python3 -c "import json,sys;d=json.load(open(sys.argv[1]));print(d.get('finishedAt','unknown'),d.get('result','?'))" "$STATUS_DIR/last-run.json" 2>/dev/null || echo "unreadable")
fi
log "Laptop last reported: $LAPTOP_RUN"

# --- copy ------------------------------------------------------------------
# -r recursive, -t preserve times (so --update comparisons are meaningful),
# --update skip files newer on the receiver, --no-perms/--no-group avoid
# noisy permission churn coming out of a cloud-synced folder.
RSYNC_OUT=$(rsync -rt --update --no-perms --no-group --itemize-changes \
    --exclude '_status/' \
    --exclude '.DS_Store' \
    --exclude '.tmp.drivedownload/' \
    "$SRC/" "$DEST/" 2>&1)
RSYNC_RC=$?

printf '%s\n' "$RSYNC_OUT" >> "$LOG"

# Count real file transfers: itemize lines beginning with > (received) that are
# not directories.
FILES_PULLED=$(printf '%s\n' "$RSYNC_OUT" | grep -c '^>f' || true)
[ -z "$FILES_PULLED" ] && FILES_PULLED=0

if [ "$RSYNC_RC" -eq 0 ]; then
    RESULT="OK"
elif [ "$RSYNC_RC" -eq 23 ] || [ "$RSYNC_RC" -eq 24 ]; then
    # 23/24: some files vanished or were unreadable mid-transfer. Common with
    # Files On-Demand placeholders; the next run picks them up.
    RESULT="WARN"
else
    RESULT="FAILED"
fi

DURATION=$(( $(date +%s) - START_EPOCH ))
FINISHED_AT=$(date -u '+%Y-%m-%dT%H:%M:%SZ')
log "=== Pull finished: $RESULT - $FILES_PULLED file(s) in ${DURATION}s (rsync rc=$RSYNC_RC) ==="

# --- receipt back to the laptop --------------------------------------------
if [ -d "$STATUS_DIR" ]; then
    cat > "$STATUS_DIR/mac-last-pull.json" <<JSON
{
  "result": "$RESULT",
  "startedAt": "$STARTED_AT",
  "finishedAt": "$FINISHED_AT",
  "durationSec": $DURATION,
  "filesPulled": $FILES_PULLED,
  "rsyncExit": $RSYNC_RC,
  "destination": "$DEST",
  "mac": "$(scutil --get ComputerName 2>/dev/null || hostname)",
  "schemaVersion": 1
}
JSON
    log "Receipt written to $STATUS_DIR/mac-last-pull.json"
fi

# Keep the log from growing forever.
if [ -f "$LOG" ] && [ "$(wc -c < "$LOG")" -gt 5000000 ]; then
    tail -n 2000 "$LOG" > "$LOG.trim" && mv "$LOG.trim" "$LOG"
fi

[ "$RESULT" = "FAILED" ] && exit 1
exit 0
