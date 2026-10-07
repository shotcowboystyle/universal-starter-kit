#!/bin/sh

set -e
if [ -z "$ROOTDIR" ]; then
    ROOTDIR="$(git rev-parse --show-toplevel 2>/dev/null)"
fi
BENCH_DIR="${BENCH_DIR:-$ROOTDIR/apps/frappe}"
cd "$BENCH_DIR"
exec uv tool run --from frappe-bench bench "$@"
