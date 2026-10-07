#!/bin/sh
set -e

kill_port() {
    PORT="$1"
    if command -v lsof >/dev/null 2>&1; then
        lsof -i :"$PORT" -t | xargs kill 2>/dev/null || true
    elif command -v ss >/dev/null 2>&1; then
        ss -lptn "sport = :$PORT" 2>/dev/null | awk 'NR>1 {match($0,/pid=([0-9]+)/,a); if(a[1]) print a[1]}' | xargs kill 2>/dev/null || true
    fi
}

_sed() {
    _expr="$1"
    _file="$2"
    if sed --version >/dev/null 2>&1; then
        sed -i "$_expr" "$_file"
    else
        sed -i '' "$_expr" "$_file"
    fi
}

if [ -z "$ROOTDIR" ]; then
    ROOTDIR="$(git rev-parse --show-toplevel 2>/dev/null)"
fi
DOTENV_FILE="${DOTENV_FILE:-$ROOTDIR/.env}"
if [ -f "$DOTENV_FILE" ]; then
    . "$DOTENV_FILE"
fi
kill_port "${FRAPPE_PORT:-8000}"
kill_port "${FRAPPE_SOCKETIO_PORT:-9000}"
BENCH_DIR="${BENCH_DIR:-$ROOTDIR/apps/frappe}"
sh "$(cd "$(dirname "$0")" && pwd)/frappe-bootstrap.sh"
cd "$BENCH_DIR"
. env/bin/activate
_sed "s|[^ ]*/node |$(command -v node) |g" "$BENCH_DIR/Procfile"
_sed "s| bench | uv tool run --from frappe-bench bench |g" "$BENCH_DIR/Procfile"
_sed "s|: *bench |: uv tool run --from frappe-bench bench |g" "$BENCH_DIR/Procfile"
_sed "s|uv tool run --from frappe-bench bench serve.*--port [0-9][0-9]*|uv tool run --from frappe-bench bench serve --port ${FRAPPE_PORT:-8000}|g" "$BENCH_DIR/Procfile"
exec uv tool run honcho start "$@"
