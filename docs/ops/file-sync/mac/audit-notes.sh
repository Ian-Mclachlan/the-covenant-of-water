#!/bin/bash
#
# audit-notes.sh — REPORT ONLY. Changes nothing, moves nothing, deletes nothing.
#
# Run this BEFORE turning on any sync. It answers three questions:
#
#   1. HOW BIG and how many files, broken down by top-level folder.
#   2. WHAT IS DUPLICATED — identical files by content hash, within the source
#      and against a comparison tree. A verified sync of a duplicated mess is
#      just a well-monitored mess.
#   3. WHAT LOOKS SENSITIVE — a mechanical screen for identifier patterns.
#
# On the screen: it reports FILE PATHS and MATCH COUNTS ONLY. It never prints
# a matched value, because writing an identifier into a log would create
# exactly the exposure the screen exists to find. It is a triage aid, not a
# compliance control, and it cannot read inside Office/PDF binaries — those are
# listed separately as "needs manual review".
#
# PERFORMANCE
#   Duplicate detection is size-bucketed: only files whose size collides with
#   another file are hashed. Two files with identical content necessarily have
#   identical size, so this is EXACT — not a sample or an approximation — and
#   it avoids hashing the large majority of a typical tree. This matters when
#   the tree is reached over a network mount.
#
# PORTABILITY
#   Runs on macOS or Linux (falls back md5 -> md5sum, stat -f -> stat -c), so
#   it is valid to run it in a Linux sandbox with the Mac folder mounted.
#   In that case pass -o to put the report somewhere reachable, because $HOME
#   inside the sandbox is not the Mac's home directory.
#
# Usage:
#   audit-notes.sh [-o OUTDIR] SOURCE_DIR [COMPARE_DIR]
#
#   SOURCE_DIR   the tree being audited
#   COMPARE_DIR  optional. A tree you ALREADY hold, to measure overlap against.
#                Use the copy you already have, not an empty destination —
#                comparing against an empty folder just reports zero.
#
# Examples:
#   audit-notes.sh ~/work-cloud/Documents ~/Existing-Archive
#   audit-notes.sh -o /mnt/mac/Desktop /mnt/mac/work-cloud/Documents /mnt/mac/Existing-Archive

set -uo pipefail

OUT_DIR=""
while getopts ":o:h" opt; do
    case "$opt" in
        o) OUT_DIR="$OPTARG" ;;
        h) sed -n '2,40p' "$0"; exit 0 ;;
        \?) echo "Unknown option: -$OPTARG" >&2; exit 2 ;;
        :)  echo "Option -$OPTARG requires an argument." >&2; exit 2 ;;
    esac
done
shift $((OPTIND - 1))

SRC="${1:-}"
CMP="${2:-}"

if [ -z "$SRC" ] || [ ! -d "$SRC" ]; then
    echo "ERROR: source directory not given or not found: '${SRC:-<unset>}'" >&2
    echo "Usage: $(basename "$0") [-o OUTDIR] SOURCE_DIR [COMPARE_DIR]" >&2
    exit 1
fi

[ -z "$OUT_DIR" ] && OUT_DIR="$HOME/Library/Logs/NotesSync"
mkdir -p "$OUT_DIR" || { echo "ERROR: cannot create output dir: $OUT_DIR" >&2; exit 1; }

STAMP="$(date '+%Y%m%d-%H%M%S')"
REPORT="$OUT_DIR/audit-$STAMP.txt"

TMPDIR_SELF="$(mktemp -d)"
cleanup() { rm -rf "$TMPDIR_SELF"; }
trap cleanup EXIT

progress() { printf '  ... %s\n' "$1" >&2; }

hash_of() {
    if command -v md5 >/dev/null 2>&1; then md5 -q "$1" 2>/dev/null
    else md5sum "$1" 2>/dev/null | cut -d' ' -f1; fi
}

size_of() { stat -f%z "$1" 2>/dev/null || stat -c%s "$1" 2>/dev/null; }

# size_index DIR OUTFILE  ->  lines of "size<TAB>path"
size_index() {
    find "$1" -type f -size +1k ! -name '.DS_Store' -print0 2>/dev/null \
    | while IFS= read -r -d '' f; do
        s=$(size_of "$f")
        [ -n "$s" ] && printf '%s\t%s\n' "$s" "$f"
      done > "$2"
}

# hash_these INFILE OUTFILE   INFILE is "size<TAB>path"; OUT is "hash<TAB>size<TAB>path"
hash_these() {
    while IFS=$'\t' read -r s f; do
        h=$(hash_of "$f")
        [ -n "$h" ] && printf '%s\t%s\t%s\n' "$h" "$s" "$f"
    done < "$1" > "$2"
}

SRC_ALL="$TMPDIR_SELF/src.all"      # every file, no size floor
SRC_SIZES="$TMPDIR_SELF/src.sizes"  # files >1k only, used for dedup
CMP_SIZES="$TMPDIR_SELF/cmp.sizes"
SRC_HASHES="$TMPDIR_SELF/src.hashes"

{
echo "NOTES CORPUS AUDIT"
echo "=================="
echo "Generated : $(date '+%Y-%m-%d %H:%M:%S')"
echo "Source    : $SRC"
echo "Compare   : ${CMP:-<none>}"
echo "Host      : $(uname -s)"
echo ""

# ------------------------------------------------------------- 1. size ------
echo "1. SIZE AND SHAPE"
echo "-----------------"
progress "indexing source"
find "$SRC" -type f ! -name '.DS_Store' 2>/dev/null > "$SRC_ALL"
size_index "$SRC" "$SRC_SIZES"
ALL_FILES=$(wc -l < "$SRC_ALL" | tr -d ' ')
TOTAL_FILES=$(wc -l < "$SRC_SIZES" | tr -d ' ')
echo "Files total  : $ALL_FILES"
echo "Files over 1k: $TOTAL_FILES  (only these are hashed for duplicates)"
echo "Total size   : $(du -sh "$SRC" 2>/dev/null | cut -f1)"
echo ""
echo "By top-level folder:"
find "$SRC" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | sort | while read -r d; do
    printf '  %-44s %8s  %7s files\n' \
        "$(basename "$d")" \
        "$(du -sh "$d" 2>/dev/null | cut -f1)" \
        "$(find "$d" -type f 2>/dev/null | wc -l | tr -d ' ')"
done
echo ""
echo "By extension (top 15):"
sed 's/.*\///' "$SRC_ALL" | grep '\.' | sed 's/.*\.//' \
    | tr 'A-Z' 'a-z' | awk 'length($0) < 8' | sort | uniq -c | sort -rn | head -15 \
    | awk '{printf "  %-12s %s\n", $2, $1}'
echo ""

# -------------------------------------------------------- 2. duplicates -----
echo "2. DUPLICATES WITHIN THE SOURCE"
echo "-------------------------------"
echo "(identical content, any name or location)"
echo ""

cut -f1 "$SRC_SIZES" | sort -n | uniq -d > "$TMPDIR_SELF/dupsizes"
awk -F'\t' 'NR==FNR{w[$1];next} ($1 in w)' "$TMPDIR_SELF/dupsizes" "$SRC_SIZES" \
    > "$TMPDIR_SELF/candidates"
CAND_N=$(wc -l < "$TMPDIR_SELF/candidates" | tr -d ' ')
echo "Size-collision candidates hashed: $CAND_N of $TOTAL_FILES files"
echo "(files with a unique size cannot have a duplicate, so they are skipped)"
progress "hashing $CAND_N candidate files"
hash_these "$TMPDIR_SELF/candidates" "$SRC_HASHES"
echo ""

DUP_GROUPS=$(cut -f1 "$SRC_HASHES" | sort | uniq -d | wc -l | tr -d ' ')
echo "Duplicate groups: $DUP_GROUPS"

WASTED=$(sort "$SRC_HASHES" | awk -F'\t' '
    { count[$1]++; size[$1]=$2 }
    END { t=0; for (h in count) if (count[h]>1) t += size[h]*(count[h]-1); print t+0 }')
echo "Reclaimable    : $(echo "$WASTED" | awk '{printf "%.2f GB (%d bytes)", $1/1073741824, $1}')"

# Redundant copies = sum over duplicate groups of (members - 1).
REDUNDANT=$(cut -f1 "$SRC_HASHES" | sort | uniq -c \
    | awk '$1 > 1 { t += $1 - 1 } END { print t+0 }')
DISTINCT_BLOBS=$(( TOTAL_FILES - REDUNDANT ))
echo "Redundant copies: $REDUNDANT file(s) are byte-identical to another file"
echo "Distinct blobs  : $DISTINCT_BLOBS of $TOTAL_FILES"
echo ""

echo "Largest 20 duplicate groups:"
cut -f1 "$SRC_HASHES" | sort | uniq -d | while read -r h; do
    sz=$(grep "^$h"$'\t' "$SRC_HASHES" | head -1 | cut -f2)
    n=$(grep -c "^$h"$'\t' "$SRC_HASHES")
    printf '%s\t%s\t%s\n' "$((sz * (n - 1)))" "$n" "$h"
done | sort -rn | head -20 | while IFS=$'\t' read -r waste n h; do
    echo "  ${n}x  $(echo "$waste" | awk '{printf "%7.1f MB wasted", $1/1048576}')"
    grep "^$h"$'\t' "$SRC_HASHES" | cut -f3 | sed 's|^|      |'
done
echo ""

# ------------------------------------------- 2b. overlap with what you have -
if [ -n "$CMP" ] && [ -d "$CMP" ]; then
    echo "2b. OVERLAP WITH THE COMPARISON TREE"
    echo "------------------------------------"
    echo "Compare: $CMP"
    echo ""
    progress "indexing comparison tree"
    size_index "$CMP" "$CMP_SIZES"
    CMP_FILES=$(wc -l < "$CMP_SIZES" | tr -d ' ')

    # Only sizes present in BOTH trees can produce a cross-tree match.
    comm -12 <(cut -f1 "$SRC_SIZES" | sort -u) <(cut -f1 "$CMP_SIZES" | sort -u) \
        > "$TMPDIR_SELF/shared.sizes"

    awk -F'\t' 'NR==FNR{w[$1];next} ($1 in w)' "$TMPDIR_SELF/shared.sizes" "$SRC_SIZES" \
        > "$TMPDIR_SELF/src.cand2"
    awk -F'\t' 'NR==FNR{w[$1];next} ($1 in w)' "$TMPDIR_SELF/shared.sizes" "$CMP_SIZES" \
        > "$TMPDIR_SELF/cmp.cand2"

    progress "hashing $(wc -l < "$TMPDIR_SELF/src.cand2" | tr -d ' ') source + $(wc -l < "$TMPDIR_SELF/cmp.cand2" | tr -d ' ') comparison candidates"
    hash_these "$TMPDIR_SELF/src.cand2" "$TMPDIR_SELF/src.h2"
    hash_these "$TMPDIR_SELF/cmp.cand2" "$TMPDIR_SELF/cmp.h2"

    cut -f1 "$TMPDIR_SELF/cmp.h2" | sort -u > "$TMPDIR_SELF/cmp.hashset"

    ALREADY=$(cut -f1 "$TMPDIR_SELF/src.h2" | sort -u \
        | comm -12 - "$TMPDIR_SELF/cmp.hashset" | wc -l | tr -d ' ')
    ALREADY_BYTES=$(sort -u -k1,1 "$TMPDIR_SELF/src.h2" | awk -F'\t' -v f="$TMPDIR_SELF/cmp.hashset" '
        BEGIN { while ((getline l < f) > 0) have[l] }
        ($1 in have) { t += $2 }
        END { print t+0 }')

    echo "Comparison tree  : $CMP_FILES files over 1k"
    echo "Already held     : $ALREADY distinct source files, $(echo "$ALREADY_BYTES" | awk '{printf "%.2f GB", $1/1073741824}')"
    echo "(these are not new work — a sync would skip them)"
    echo ""

    echo "For scale: the $TOTAL_FILES source files over 1k reduce to $DISTINCT_BLOBS"
    echo "distinct content blobs once internal duplication is collapsed."
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
grep -Ei "\.($SCAN_EXT)$" "$SRC_ALL" > "$TMPDIR_SELF/scannable" || true
SCAN_N=$(wc -l < "$TMPDIR_SELF/scannable" | tr -d ' ')
echo "Scannable text files: $SCAN_N"
echo ""

screen() {
    local label="$1" pattern="$2"
    echo "  [$label]"
    while IFS= read -r f; do
        c=$(grep -Eoc "$pattern" "$f" 2>/dev/null) || c=0
        [ "${c:-0}" -gt 0 ] 2>/dev/null && printf '    %4d  %s\n' "$c" "$f"
    done < "$TMPDIR_SELF/scannable" | sort -rn | head -25
    echo ""
}

progress "running identifier screen over $SCAN_N files"
screen "SSN-shaped"        '[0-9]{3}-[0-9]{2}-[0-9]{4}'
screen "long digit runs (possible MRN / member ID)" '[^0-9][0-9]{7,12}[^0-9]'
screen "DOB-adjacent"      '(DOB|D\.O\.B|date of birth|born on)'
screen "MRN / patient keywords" '(MRN|medical record number|patient name|member ID|ICD-?1[0-9])'
screen "phone-shaped"      '\([0-9]{3}\) ?[0-9]{3}-[0-9]{4}|[0-9]{3}-[0-9]{3}-[0-9]{4}'

echo "  [NOT MACHINE-SCANNABLE — review by hand or exclude]"
grep -Ei '\.(docx?|xlsx?|pptx?|pdf|pages|numbers|key|zip|msg|eml)$' "$SRC_ALL" \
    > "$TMPDIR_SELF/binaries" || true
head -40 "$TMPDIR_SELF/binaries" | sed 's|^|    |'
echo ""
echo "  Total files in that category: $(wc -l < "$TMPDIR_SELF/binaries" | tr -d ' ')"
echo ""

echo "END OF REPORT"
} 2>&1 | tee "$REPORT"

echo ""
echo "Saved to: $REPORT"
