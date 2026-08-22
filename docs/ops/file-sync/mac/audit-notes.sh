#!/bin/bash
#
# audit-notes.sh — REPORT ONLY. Changes nothing, moves nothing, deletes nothing.
#
# Run this BEFORE turning on any sync. It answers three questions about the
# notes corpus:
#
#   1. HOW BIG and how many files, broken down by top-level folder.
#   2. WHAT IS DUPLICATED — identical files by content hash, within the source
#      and against the destination. A verified sync of a duplicated mess is
#      just a well-monitored mess.
#   3. WHAT LOOKS SENSITIVE — a mechanical screen for identifier patterns.
#
# On the screen: it reports FILE PATHS and MATCH COUNTS ONLY. It never prints
# a matched value, because writing an identifier into a log file would create
# exactly the exposure the screen exists to find. It is a triage aid, not a
# compliance control, and it cannot read inside Office/PDF binaries — those are
# listed separately as "needs manual review".
#
# Usage:  ./audit-notes.sh [source_dir] [dest_dir]
# Config: reads notes-sync.conf from the same directory if present.

set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
[ -f "$HERE/notes-sync.conf" ] && . "$HERE/notes-sync.conf"

SRC="${1:-${NOTES_SOURCE:-}}"
DST="${2:-${NOTES_DEST:-}}"

OUT_DIR="$HOME/Library/Logs/NotesSync"
mkdir -p "$OUT_DIR"
STAMP="$(date '+%Y%m%d-%H%M%S')"
REPORT="$OUT_DIR/audit-$STAMP.txt"

if [ -z "$SRC" ] || [ ! -d "$SRC" ]; then
    echo "ERROR: source directory not set or not found: '${SRC:-<unset>}'"
    echo "       Pass it as the first argument, or set NOTES_SOURCE in notes-sync.conf"
    exit 1
fi

hash_of() {
    if command -v md5 >/dev/null 2>&1; then md5 -q "$1" 2>/dev/null
    else md5sum "$1" 2>/dev/null | cut -d' ' -f1; fi
}

{
echo "NOTES CORPUS AUDIT"
echo "=================="
echo "Generated : $(date '+%Y-%m-%d %H:%M:%S')"
echo "Source    : $SRC"
echo "Dest      : ${DST:-<not set>}"
echo ""

# ------------------------------------------------------------- 1. size ------
echo "1. SIZE AND SHAPE"
echo "-----------------"
TOTAL_FILES=$(find "$SRC" -type f ! -name '.DS_Store' 2>/dev/null | wc -l | tr -d ' ')
echo "Total files: $TOTAL_FILES"
echo "Total size : $(du -sh "$SRC" 2>/dev/null | cut -f1)"
echo ""
echo "By top-level folder:"
find "$SRC" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | while read -r d; do
    printf '  %-46s %8s  %6s files\n' \
        "$(basename "$d")" \
        "$(du -sh "$d" 2>/dev/null | cut -f1)" \
        "$(find "$d" -type f 2>/dev/null | wc -l | tr -d ' ')"
done
echo ""
echo "By extension (top 15):"
find "$SRC" -type f 2>/dev/null | sed 's/.*\.//' | tr 'A-Z' 'a-z' \
    | awk 'length($0) < 8' | sort | uniq -c | sort -rn | head -15 \
    | awk '{printf "  %-12s %s\n", $2, $1}'
echo ""

# -------------------------------------------------------- 2. duplicates -----
echo "2. DUPLICATES WITHIN THE SOURCE"
echo "-------------------------------"
echo "(identical content, any name or location)"
echo ""
TMP_HASHES="$(mktemp)"
find "$SRC" -type f -size +1k ! -name '.DS_Store' 2>/dev/null | while read -r f; do
    h=$(hash_of "$f")
    [ -n "$h" ] && printf '%s\t%s\t%s\n' "$h" "$(stat -f%z "$f" 2>/dev/null || stat -c%s "$f" 2>/dev/null)" "$f"
done > "$TMP_HASHES"

DUP_GROUPS=$(cut -f1 "$TMP_HASHES" | sort | uniq -d | wc -l | tr -d ' ')
echo "Duplicate groups: $DUP_GROUPS"

WASTED=$(cut -f1,2 "$TMP_HASHES" | sort | awk -F'\t' '
    { count[$1]++; size[$1]=$2 }
    END { t=0; for (h in count) if (count[h]>1) t += size[h]*(count[h]-1); print t }')
if [ -n "$WASTED" ] && [ "$WASTED" -gt 0 ] 2>/dev/null; then
    echo "Reclaimable    : $(echo "$WASTED" | awk '{printf "%.2f GB", $1/1073741824}')"
fi
echo ""
echo "Largest 20 duplicate groups:"
cut -f1 "$TMP_HASHES" | sort | uniq -d | while read -r h; do
    sz=$(grep "^$h	" "$TMP_HASHES" | head -1 | cut -f2)
    n=$(grep -c "^$h	" "$TMP_HASHES")
    printf '%s\t%s\t%s\n' "$((sz * (n - 1)))" "$n" "$h"
done | sort -rn | head -20 | while IFS=$'\t' read -r waste n h; do
    echo "  ${n}x  $(echo "$waste" | awk '{printf "%7.1f MB wasted", $1/1048576}')"
    grep "^$h	" "$TMP_HASHES" | cut -f3 | sed 's|^|      |'
done
echo ""

# ------------------------------------------- 2b. already at destination -----
if [ -n "${DST:-}" ] && [ -d "$DST" ]; then
    echo "2b. ALREADY PRESENT AT DESTINATION"
    echo "----------------------------------"
    DST_HASHES="$(mktemp)"
    find "$DST" -type f -size +1k ! -name '.DS_Store' 2>/dev/null | while read -r f; do
        h=$(hash_of "$f"); [ -n "$h" ] && echo "$h"
    done | sort -u > "$DST_HASHES"
    ALREADY=$(cut -f1 "$TMP_HASHES" | sort -u | comm -12 - "$DST_HASHES" | wc -l | tr -d ' ')
    echo "Source files whose content is already at the destination: $ALREADY"
    echo "(these will be skipped by the sync — they are not new work)"
    rm -f "$DST_HASHES"
    echo ""
fi

# ------------------------------------------------------- 3. identifiers -----
echo "3. IDENTIFIER SCREEN"
echo "--------------------"
echo "Report-only. Paths and counts, never matched values."
echo "A hit is NOT proof of anything — long digit strings appear in dates,"
echo "version numbers and IDs. A clean result is NOT proof of absence either."
echo ""

SCAN_EXT='txt|md|markdown|csv|tsv|json|xml|html|htm|rtf|log|yaml|yml'

screen() {
    local label="$1" pattern="$2" hits=0
    echo "  [$label]"
    find "$SRC" -type f 2>/dev/null | grep -Ei "\.($SCAN_EXT)$" | while read -r f; do
        c=$(grep -Eoc "$pattern" "$f" 2>/dev/null || echo 0)
        [ "$c" -gt 0 ] 2>/dev/null && printf '    %4d  %s\n' "$c" "$f"
    done | sort -rn | head -25
    echo ""
}

screen "SSN-shaped"        '[0-9]{3}-[0-9]{2}-[0-9]{4}'
screen "long digit runs (possible MRN / member ID)" '[^0-9][0-9]{7,12}[^0-9]'
screen "DOB-adjacent"      '(DOB|D\.O\.B|date of birth|born on)'
screen "MRN / patient keywords" '(MRN|medical record number|patient name|member ID|ICD-?1[0-9])'
screen "phone-shaped"      '\([0-9]{3}\) ?[0-9]{3}-[0-9]{4}|[0-9]{3}-[0-9]{3}-[0-9]{4}'

echo "  [NOT MACHINE-SCANNABLE — review by hand or exclude]"
find "$SRC" -type f 2>/dev/null \
    | grep -Ei '\.(docx?|xlsx?|pptx?|pdf|pages|numbers|key|zip|msg|eml)$' \
    | head -40 | sed 's|^|    |'
echo ""
UNSCANNED=$(find "$SRC" -type f 2>/dev/null | grep -Eic '\.(docx?|xlsx?|pptx?|pdf|pages|numbers|key|zip|msg|eml)$')
echo "  Total files in that category: $UNSCANNED"
echo ""

rm -f "$TMP_HASHES"

echo "END OF REPORT"
} 2>&1 | tee "$REPORT"

echo ""
echo "Saved to: $REPORT"
