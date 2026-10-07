#!/bin/sh
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# bench build runs yarn 1 inside the bench, and yarn 1 reads this repo's .npmrc
# and aborts on an unset ${NPM_AUTH_TOKEN} (pnpm only warns). The bench never
# fetches from the private registry, so an empty value is enough.
export NPM_AUTH_TOKEN="${NPM_AUTH_TOKEN-}"

usage() {
    cat <<'EOF'
Usage: frappe.sh <command> [options]

Commands:
  dev                   Start Frappe development server
  bootstrap [--update]  Bootstrap Frappe environment
  clean [--cache]       Clean bench artifacts
  reset [--cache] [--update]
                        Clean then bootstrap
  bench [args...]       Run bench command via uv
EOF
}

command="$1"
[ -n "$command" ] || {
    usage
    exit 1
}
shift || true

case "$command" in
    dev)
        exec sh "$SCRIPT_DIR/frappe-dev.sh" "$@"
        ;;
    bootstrap)
        exec sh "$SCRIPT_DIR/frappe-bootstrap.sh" "$@"
        ;;
    clean)
        exec sh "$SCRIPT_DIR/frappe-clean.sh" "$@"
        ;;
    bench)
        exec sh "$SCRIPT_DIR/frappe-bench.sh" "$@"
        ;;
    reset)
        CLEAN_ARGS=""
        BOOTSTRAP_ARGS=""
        while [ $# -gt 0 ]; do
            case "$1" in
                --cache)
                    CLEAN_ARGS="$CLEAN_ARGS --cache"
                    ;;
                --update)
                    BOOTSTRAP_ARGS="$BOOTSTRAP_ARGS --update"
                    ;;
                *)
                    echo "unknown reset option: $1" >&2
                    usage
                    exit 1
                    ;;
            esac
            shift
        done
        # shellcheck disable=SC2086
        sh "$SCRIPT_DIR/frappe-clean.sh" $CLEAN_ARGS
        # shellcheck disable=SC2086
        exec sh "$SCRIPT_DIR/frappe-bootstrap.sh" $BOOTSTRAP_ARGS
        ;;
    -h | --help | help)
        usage
        ;;
    *)
        echo "unknown command: $command" >&2
        usage
        exit 1
        ;;
esac
