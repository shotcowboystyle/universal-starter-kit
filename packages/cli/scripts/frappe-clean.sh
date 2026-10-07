#!/bin/sh
set -e
if [ -z "$ROOTDIR" ]; then
    ROOTDIR="$(git rev-parse --show-toplevel 2>/dev/null)"
fi
BENCH_DIR="${BENCH_DIR:-$ROOTDIR/apps/frappe}"
FRAPPE_CACHE_DIR="${XDG_CACHE_HOME:-$HOME/.cache}/frappe"
. "$(cd "$(dirname "$0")" && pwd)/frappe-helpers.sh"
CLEAN_CACHE=0
while [ $# -gt 0 ]; do
    case "$1" in
        --cache) CLEAN_CACHE=1 ;;
        *) ;;
    esac
    shift
done
frappe_keep_init
frappe_collect_keep_apps
frappe_remove_non_keep_apps
rm -rf "$BENCH_DIR/env" 2>/dev/null || true
rm -rf "$BENCH_DIR/sites" 2>/dev/null || true
rm -rf "$BENCH_DIR/config" 2>/dev/null || true
rm -rf "$BENCH_DIR/logs" 2>/dev/null || true
rm -f "$BENCH_DIR/Procfile" 2>/dev/null || true
rm -f "$BENCH_DIR/patches.txt" 2>/dev/null || true
if [ "$CLEAN_CACHE" = "1" ]; then
    rm -rf "$FRAPPE_CACHE_DIR"
    echo "cleaned bench and cache"
else
    echo "cleaned bench"
fi
