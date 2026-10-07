#!/bin/sh
# Every checkout of this repo shares one dev mariadb/postgres, so each checkout
# gets its own database. FRAPPE_DB_NAME wins when set; otherwise the db_name the
# site's site_config.json already holds (the main checkout keeps its frappe);
# otherwise frappe_<dir>_<hash of the checkout path>. Bootstrap drops only a
# database its own site_config.json names, or one with no tables, and refuses
# otherwise.
set -e

_db_table_count() {
    if [ "$FRAPPE_DB_TYPE" = "postgres" ]; then
        _exists="$(PGPASSWORD="$FRAPPE_DB_PASSWORD" psql -h "$FRAPPE_DB_HOST" -p "$FRAPPE_DB_PORT" -U "$FRAPPE_DB_USER" -d postgres -tAc \
            "SELECT 1 FROM pg_database WHERE datname = '$1'")" || return 1
        if [ -z "$_exists" ]; then
            echo 0
            return 0
        fi
        PGPASSWORD="$FRAPPE_DB_PASSWORD" psql -h "$FRAPPE_DB_HOST" -p "$FRAPPE_DB_PORT" -U "$FRAPPE_DB_USER" -d "$1" -tAc \
            "SELECT count(*) FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog', 'information_schema')"
    else
        _mysql -h "$FRAPPE_DB_HOST" -P "$FRAPPE_DB_PORT" -u "$FRAPPE_DB_USER" -p"$FRAPPE_DB_PASSWORD" -N -B -e \
            "SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = '$1'"
    fi
}

_mysql() {
    if command -v mysql >/dev/null 2>&1; then
        mysql "$@"
    elif command -v mariadb >/dev/null 2>&1; then
        mariadb "$@"
    else
        echo "mysql/mariadb client not found" >&2
        return 1
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

FRAPPE_SCRIPTS_DIR="$(cd "$(dirname "$0")" && pwd)"
. "$FRAPPE_SCRIPTS_DIR/frappe-helpers.sh"

_clean_bench_artifacts() {
    rm -rf "$BENCH_DIR/apps/frappe" 2>/dev/null || true
    rm -rf "$BENCH_DIR/env" 2>/dev/null || true
    rm -rf "$BENCH_DIR/sites" 2>/dev/null || true
    rm -rf "$BENCH_DIR/config" 2>/dev/null || true
    rm -rf "$BENCH_DIR/logs" 2>/dev/null || true
    rm -f "$BENCH_DIR/Procfile" 2>/dev/null || true
    rm -f "$BENCH_DIR/patches.txt" 2>/dev/null || true
    frappe_keep_init
    frappe_collect_keep_apps
    frappe_remove_non_keep_apps
}

_install_deps() {
    _APP_PATH="$1"
    _REAL_NAME="$2"
    if [ "$UPDATE" = "1" ] || ! uv pip show "$_REAL_NAME" >/dev/null 2>&1; then
        uv pip install -e "$_APP_PATH" --link-mode=copy
        if [ -f "$_APP_PATH/requirements.txt" ]; then
            uv pip install -r "$_APP_PATH/requirements.txt" --link-mode=copy
        fi
        if [ -f "$_APP_PATH/dev-requirements.txt" ]; then
            uv pip install -r "$_APP_PATH/dev-requirements.txt" --link-mode=copy
        elif [ -f "$_APP_PATH/pyproject.toml" ]; then
            _DEPS="$(python3 -c '
import tomllib, sys
d = tomllib.load(open(sys.argv[1], "rb")) \
    .get("tool", {}).get("bench", {}).get("dev-dependencies", {})
print(" ".join(f"{k}=={v}" if "=" not in v else f"{k}{v}" for k, v in d.items()))
' "$_APP_PATH/pyproject.toml")"
            [ -n "$_DEPS" ] && uv pip install $_DEPS --link-mode=copy
        fi
    fi
    if [ -f "$_APP_PATH/package.json" ]; then
        (cd "$_APP_PATH" && yarn)
    fi
}

# Resolves the app's python MODULE name (frappe_mcp), never the repo or
# pyproject distribution name (frappe-mcp): apps.txt entries, apps/ dir
# names, and bench --app args must all be importable module names -- a
# hyphenated apps.txt entry breaks every bench boot. Derivation lives in
# frappe-app-name.py (layout-first, unit-tested).
_get_app_name() {
    python3 "$FRAPPE_SCRIPTS_DIR/frappe-app-name.py" "$1" "$2"
}

_register_app() {
    echo >> "$BENCH_DIR/sites/apps.txt"
    echo "$1" >> "$BENCH_DIR/sites/apps.txt"
    _sed '/^$/d' "$BENCH_DIR/sites/apps.txt"
}

_source_type() {
    _SRC="$1"
    case "$_SRC" in
        file://* | ./* | ../* | /*)
            case "$_SRC" in
                *.tar.gz | *.tgz | *.tar | *.zip)
                    echo "archive-local" ;;
                *)
                    echo "local" ;;
            esac
            ;;
        git@* | ssh://git@*)
            echo "git" ;;
        https://* | http://*)
            _BASE="$(echo "$_SRC" | sed 's/#.*//')"
            case "$_BASE" in
                *.tar.gz | *.tgz | *.tar | *.zip)
                    echo "archive-remote" ;;
                *)
                    echo "git" ;;
            esac
            ;;
        *)
            echo "unknown" ;;
    esac
}

_source_url() {
    echo "$1" | sed 's/#.*//'
}

_source_ref() {
    _FRAG="$(echo "$1" | sed -n 's/.*#\(.*\)/\1/p')"
    echo "$_FRAG" | sed 's/:.*//'
}

_source_subpath() {
    _FRAG="$(echo "$1" | sed -n 's/.*#\(.*\)/\1/p')"
    case "$_FRAG" in
        *:*)  echo "$_FRAG" | sed 's/[^:]*://' ;;
        *)    echo "" ;;
    esac
}

_install_local_source() {
    _SOURCE="$1"
    _PATH="$_SOURCE"
    case "$_PATH" in
        file://*)  _PATH="$(echo "$_PATH" | sed 's|^file://||')" ;;
    esac
    case "$_PATH" in
        ./* | ../*)
            _PATH="$(realpath "$BENCH_DIR/$_PATH")"
            ;;
    esac
    if [ ! -d "$_PATH" ]; then
        echo "local source path does not exist $_PATH" >&2
        return
    fi
    if [ ! -f "$_PATH/pyproject.toml" ] && [ ! -f "$_PATH/setup.py" ]; then
        echo "not a valid frappe app (no pyproject.toml or setup.py) $_PATH" >&2
        return
    fi
    REAL_NAME="$(_get_app_name "$_PATH" "$(basename "$_PATH")")" || return
    [ "$REAL_NAME" = "frappe" ] && return
    echo "installing local app $REAL_NAME from $_PATH"
    case "$_PATH" in
        "$BENCH_DIR/apps/"*)
            if [ "$(basename "$_PATH")" != "$REAL_NAME" ]; then
                mv "$_PATH" "$BENCH_DIR/apps/$REAL_NAME"
            fi
            ;;
        *)
            rm -rf "$BENCH_DIR/apps/$REAL_NAME" 2>/dev/null || true
            ln -s "$(realpath "$_PATH")" "$BENCH_DIR/apps/$REAL_NAME"
            ;;
    esac
    _install_deps "$BENCH_DIR/apps/$REAL_NAME" "$REAL_NAME"
    _register_app "$REAL_NAME"
    bench build --app "$REAL_NAME"
    bench install-app "$REAL_NAME"
}

_install_git_source() {
    _SOURCE="$1"
    _URL="$(_source_url "$_SOURCE")"
    _REF="$(_source_ref "$_SOURCE")"
    _SUBPATH="$(_source_subpath "$_SOURCE")"
    [ -z "$_REF" ] && _REF="main"
    _ID="$(echo "$_URL" | sha256sum | cut -d' ' -f1)"
    if [ -d "$FRAPPE_CACHE_DIR/apps/$_ID/.git" ]; then
        (
            cd "$FRAPPE_CACHE_DIR/apps/$_ID"
            git add .
            git reset --hard
            if [ "$UPDATE" = "1" ]; then
                git fetch --all
            fi
            git checkout "$_REF"
            git merge "origin/$_REF"
        )
    else
        git clone --branch "$_REF" "$_URL" "$FRAPPE_CACHE_DIR/apps/$_ID"
    fi
    _APP_SRC="$FRAPPE_CACHE_DIR/apps/$_ID"
    if [ -n "$_SUBPATH" ]; then
        _APP_SRC="$_APP_SRC/$_SUBPATH"
        if [ ! -d "$_APP_SRC" ]; then
            echo "subpath does not exist in repo $_SUBPATH" >&2
            return
        fi
    fi
    REAL_NAME="$(_get_app_name "$_APP_SRC" "$(basename "$_URL" .git)")" || return
    [ "$REAL_NAME" = "frappe" ] && return
    echo "installing git app $REAL_NAME from $_URL${_SUBPATH:+ (subpath $_SUBPATH)}"
    rm -rf "$BENCH_DIR/apps/$REAL_NAME" 2>/dev/null || true
    cp -r "$_APP_SRC" "$BENCH_DIR/apps/$REAL_NAME"
    _install_deps "$BENCH_DIR/apps/$REAL_NAME" "$REAL_NAME"
    _register_app "$REAL_NAME"
    bench build --app "$REAL_NAME"
    bench install-app "$REAL_NAME"
}

_install_archive_source() {
    _SOURCE="$1"
    _TYPE="$2"
    _ID="$(echo "$_SOURCE" | sha256sum | cut -d' ' -f1)"
    _EXTRACT_DIR="$FRAPPE_CACHE_DIR/apps/$_ID"
    if [ "$UPDATE" = "1" ] || [ ! -d "$_EXTRACT_DIR" ]; then
        rm -rf "$_EXTRACT_DIR" 2>/dev/null || true
        mkdir -p "$_EXTRACT_DIR"
        if [ "$_TYPE" = "archive-remote" ]; then
            _URL="$(_source_url "$_SOURCE")"
            _TMP="$(mktemp)"
            curl -fsSL "$_URL" -o "$_TMP"
            _ARCHIVE="$_TMP"
        else
            _ARCHIVE="$_SOURCE"
            case "$_ARCHIVE" in
                ./* | ../*)
                    _ARCHIVE="$(realpath "$BENCH_DIR/$_ARCHIVE")"
                    ;;
            esac
        fi
        case "$_SOURCE" in
            *.tar.gz | *.tgz)  tar xzf "$_ARCHIVE" -C "$_EXTRACT_DIR" --strip-components=1 ;;
            *.tar)             tar xf "$_ARCHIVE" -C "$_EXTRACT_DIR" --strip-components=1 ;;
            *.zip)             unzip -qo "$_ARCHIVE" -d "$_EXTRACT_DIR" ;;
        esac
        [ -f "$_TMP" ] && rm -f "$_TMP"
    fi
    _FALLBACK="$(basename "$(_source_url "$_SOURCE")" | sed 's/\.tar\.gz$//;s/\.tgz$//;s/\.tar$//;s/\.zip$//')"
    REAL_NAME="$(_get_app_name "$_EXTRACT_DIR" "$_FALLBACK")" || return
    echo "installing archive app $REAL_NAME from $_SOURCE"
    rm -rf "$BENCH_DIR/apps/$REAL_NAME" 2>/dev/null || true
    cp -r "$_EXTRACT_DIR" "$BENCH_DIR/apps/$REAL_NAME"
    _install_deps "$BENCH_DIR/apps/$REAL_NAME" "$REAL_NAME"
    _register_app "$REAL_NAME"
    bench build --app "$REAL_NAME"
    bench install-app "$REAL_NAME"
}

if [ -z "$ROOTDIR" ]; then
    ROOTDIR="$(git rev-parse --show-toplevel 2>/dev/null)"
fi
DOTENV_FILE="${DOTENV_FILE:-$ROOTDIR/.env}"
BENCH_DIR="${BENCH_DIR:-$ROOTDIR/apps/frappe}"
while [ $# -gt 0 ]; do
    case "$1" in
        --update)
            UPDATE=1
            ;;
        *)
            ;;
    esac
    shift
done
UPDATE="${UPDATE:-0}"
export COREPACK_ENABLE_STRICT=0
export COREPACK_ENABLE_PROJECT_SPEC=0
python3 -c "import distutils" 2>/dev/null || uv pip install setuptools --system --break-system-packages
if [ ! -f "$DOTENV_FILE" ] && [ -f "$ROOTDIR/.env.example" ]; then
    cp "$ROOTDIR/.env.example" "$DOTENV_FILE"
fi
. "$DOTENV_FILE"
cd "$ROOTDIR"
FRAPPE_ADMIN_PASSWORD="${FRAPPE_ADMIN_PASSWORD:-P@ssw0rd}"
FRAPPE_BASE_URL="${FRAPPE_BASE_URL:-http://localhost:8000}"
FRAPPE_BRANCH="${FRAPPE_BRANCH:-version-15-hotfix}"
FRAPPE_DB_HOST="${FRAPPE_DB_HOST:-$([ "$FRAPPE_DB_TYPE" = "postgres" ] && echo "$POSTGRES_HOSTNAME" || echo "${MARIADB_HOSTNAME:-${MYSQL_HOSTNAME:-127.0.0.1}}")}"
if [ "$FRAPPE_DB_HOST" = "localhost" ]; then
    FRAPPE_DB_HOST="127.0.0.1"
fi
FRAPPE_DB_PASSWORD="${FRAPPE_DB_PASSWORD:-$([ "$FRAPPE_DB_TYPE" = "postgres" ] && echo "$POSTGRES_PASSWORD" || echo "${MARIADB_PASSWORD:-${MYSQL_PASSWORD:-root}}")}"
FRAPPE_DB_PORT="${FRAPPE_DB_PORT:-$([ "$FRAPPE_DB_TYPE" = "postgres" ] && echo "$POSTGRES_PORT" || echo "${MARIADB_PORT:-${MYSQL_PORT:-3306}}")}"
FRAPPE_DB_TYPE="${FRAPPE_DB_TYPE:-mariadb}"
FRAPPE_DB_USER="${FRAPPE_DB_USER:-$([ "$FRAPPE_DB_TYPE" = "postgres" ] && echo "$POSTGRES_USERNAME" || echo "${MARIADB_USERNAME:-${MYSQL_USERNAME:-root}}")}"
FRAPPE_REPO="${FRAPPE_REPO:-https://github.com/frappe/frappe.git}"
FRAPPE_CACHE_DIR="${XDG_CACHE_HOME:-$HOME/.cache}/frappe"
REDIS_CACHE_URI="${REDIS_CACHE_URI:-redis://localhost:6379}"
REDIS_QUEUE_URI="${REDIS_QUEUE_URI:-redis://localhost:6380}"
SITE_NAME="${SITE_NAME:-$(echo "$FRAPPE_BASE_URL" | sed 's|^https*://||' | sed 's|:[0-9]*.*||' | sed 's|/.*||')}"
FRAPPE_DB_NAME="$(frappe_resolve_db_name "${FRAPPE_DB_NAME:-}" "$BENCH_DIR/sites/$SITE_NAME/site_config.json" "$ROOTDIR")"
echo "dev database $FRAPPE_DB_NAME"
bench() {
    uv tool run --from frappe-bench bench "$@"
}
_i=0
while true; do
    if [ "$FRAPPE_DB_TYPE" = "postgres" ]; then
        PGPASSWORD="$FRAPPE_DB_PASSWORD" psql -h "$FRAPPE_DB_HOST" -p "$FRAPPE_DB_PORT" -U "$FRAPPE_DB_USER" -d postgres -c "SELECT 1" >/dev/null 2>&1 && break
    else
        _mysql -h "$FRAPPE_DB_HOST" -P "$FRAPPE_DB_PORT" -u "$FRAPPE_DB_USER" -p"$FRAPPE_DB_PASSWORD" -e "SELECT 1" >/dev/null 2>&1 && break
    fi
    _i=$((_i + 1))
    if [ "$_i" -gt 30 ]; then
        printf "\nfailed to connect to database\n" >&2
        exit 1
    fi
    printf .
    sleep 1
done
[ "$_i" -gt 0 ] && printf "\n"
if [ ! -f "$BENCH_DIR/apps/frappe/package.json" ] || [ ! -f "$BENCH_DIR/Procfile" ] || \
    ! "$BENCH_DIR/env/bin/python3" -c "from frappe.utils.bench_helper import main" 2>/dev/null || \
    [ ! -d "$BENCH_DIR/apps/frappe/node_modules" ] || [ ! -d "$BENCH_DIR/sites" ]; then
    _clean_bench_artifacts
    if [ -d "$FRAPPE_CACHE_DIR/apps/frappe/.git" ]; then
        (cd "$FRAPPE_CACHE_DIR/apps/frappe" && git add . && git reset --hard && git pull)
    else
        mkdir -p "$FRAPPE_CACHE_DIR/apps"
        git clone --branch "$FRAPPE_BRANCH" "$FRAPPE_REPO" "$FRAPPE_CACHE_DIR/apps/frappe"
    fi
    echo n | bench init \
        --ignore-exist \
        --skip-assets \
        --skip-redis-config-generation \
        --frappe-path="$FRAPPE_CACHE_DIR/apps/frappe" \
        --frappe-branch="$FRAPPE_BRANCH" \
        "$BENCH_DIR"
    _DID_INIT=1
fi
echo frappe > "$BENCH_DIR/sites/apps.txt"
cd "$BENCH_DIR"
. env/bin/activate
if [ "${_DID_INIT:-0}" = "1" ]; then
    bench build --app frappe
fi
jq 'del(.redis_cache, .redis_queue, .redis_socketio)' \
    "$BENCH_DIR/sites/common_site_config.json" > _common_site_config.json && \
    mv _common_site_config.json "$BENCH_DIR/sites/common_site_config.json"
bench set-config -g db_type "$FRAPPE_DB_TYPE"
bench set-config -g developer_mode 1
bench set-config -g redis_cache "$REDIS_CACHE_URI"
bench set-config -g redis_queue "$REDIS_QUEUE_URI"
bench set-config -g redis_socketio "$REDIS_QUEUE_URI"
if [ "$FRAPPE_DB_TYPE" = "mariadb" ] || [ "$FRAPPE_DB_TYPE" = "mysql" ]; then
    _mysql -h "$FRAPPE_DB_HOST" -P "$FRAPPE_DB_PORT" -u "$FRAPPE_DB_USER" -p"$FRAPPE_DB_PASSWORD" -e "
        CREATE USER IF NOT EXISTS '$FRAPPE_DB_NAME'@'%' IDENTIFIED BY '$FRAPPE_DB_PASSWORD';
        GRANT ALL PRIVILEGES ON *.* TO '$FRAPPE_DB_NAME'@'%' WITH GRANT OPTION;
        FLUSH PRIVILEGES;
    "
elif [ "$FRAPPE_DB_TYPE" = "postgres" ]; then
    PGPASSWORD="$FRAPPE_DB_PASSWORD" psql -h "$FRAPPE_DB_HOST" -p "$FRAPPE_DB_PORT" -U "$FRAPPE_DB_USER" -d postgres -c "
        DO \$\$
        BEGIN
            IF NOT EXISTS (SELECT FROM pg_catalog.pg_user WHERE usename = '$FRAPPE_DB_NAME') THEN
                CREATE USER $FRAPPE_DB_NAME WITH PASSWORD '$FRAPPE_DB_PASSWORD';
            END IF;
            GRANT ALL PRIVILEGES ON DATABASE $FRAPPE_DB_NAME TO $FRAPPE_DB_NAME;
        EXCEPTION WHEN OTHERS THEN
            NULL;
        END \$\$;
    "
fi
_DB_INITIALIZED=1
if [ -f "$BENCH_DIR/sites/$SITE_NAME/site_config.json" ]; then
    if [ "$FRAPPE_DB_TYPE" = "postgres" ]; then
        PGPASSWORD="$FRAPPE_DB_PASSWORD" psql -h "$FRAPPE_DB_HOST" -p "$FRAPPE_DB_PORT" -U "$FRAPPE_DB_USER" -d "$FRAPPE_DB_NAME" -c "SELECT 1 FROM \"tabDefaultValue\" LIMIT 1" >/dev/null 2>&1 || _DB_INITIALIZED=0
    else
        _mysql -h "$FRAPPE_DB_HOST" -P "$FRAPPE_DB_PORT" -u "$FRAPPE_DB_USER" -p"$FRAPPE_DB_PASSWORD" -D "$FRAPPE_DB_NAME" -e "SELECT 1 FROM tabDefaultValue LIMIT 1" >/dev/null 2>&1 || _DB_INITIALIZED=0
    fi
fi
if [ ! -f "$BENCH_DIR/sites/$SITE_NAME/site_config.json" ] || [ "$_DB_INITIALIZED" = "0" ]; then
    _TABLES="$(_db_table_count "$FRAPPE_DB_NAME")" || _TABLES=""
    frappe_db_may_drop "$FRAPPE_DB_NAME" "$BENCH_DIR/sites/$SITE_NAME/site_config.json" "$_TABLES" || exit 1
    if [ "$FRAPPE_DB_TYPE" = "postgres" ]; then
        PGPASSWORD="$FRAPPE_DB_PASSWORD" psql -h "$FRAPPE_DB_HOST" -p "$FRAPPE_DB_PORT" -U "$FRAPPE_DB_USER" -c \
            "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$FRAPPE_DB_NAME';"
    else
        _mysql -h "$FRAPPE_DB_HOST" -P "$FRAPPE_DB_PORT" -u "$FRAPPE_DB_USER" -p"$FRAPPE_DB_PASSWORD" -e \
            "SELECT GROUP_CONCAT(CONCAT('KILL ',id,';') SEPARATOR ' ') FROM INFORMATION_SCHEMA.PROCESSLIST WHERE db='$FRAPPE_DB_NAME' INTO @kill_list; SET @kill_list = IFNULL(@kill_list,'SELECT 1'); PREPARE kill_stmt FROM @kill_list; EXECUTE kill_stmt; DEALLOCATE PREPARE kill_stmt;"
    fi
    if [ "$FRAPPE_DB_HOST" = "127.0.0.1" ]; then
        if [ "$FRAPPE_DB_TYPE" = "postgres" ]; then
            PGPASSWORD="$FRAPPE_DB_PASSWORD" psql -h "$FRAPPE_DB_HOST" -p "$FRAPPE_DB_PORT" -U "$FRAPPE_DB_USER" -c \
                "DROP DATABASE IF EXISTS $FRAPPE_DB_NAME;"
        else
            _mysql -h "$FRAPPE_DB_HOST" -P "$FRAPPE_DB_PORT" -u "$FRAPPE_DB_USER" -p"$FRAPPE_DB_PASSWORD" -e \
                "DROP DATABASE IF EXISTS $FRAPPE_DB_NAME;"
        fi
    fi
    rm -rf "$BENCH_DIR/sites/$SITE_NAME" 2>/dev/null || true
    bench new-site \
        --admin-password="$FRAPPE_ADMIN_PASSWORD" \
        --db-host="$FRAPPE_DB_HOST" \
        --db-name="$FRAPPE_DB_NAME" \
        --db-password="$FRAPPE_DB_PASSWORD" \
        --db-port="$FRAPPE_DB_PORT" \
        --db-root-password="$FRAPPE_DB_PASSWORD" \
        --db-type="$FRAPPE_DB_TYPE" \
        "$SITE_NAME"
fi
bench use "$SITE_NAME"
APPS_CONFIG_FILE="$BENCH_DIR/frappe.yaml"
if [ -f "$APPS_CONFIG_FILE" ]; then
    python3 -c '
import yaml, sys
with open(sys.argv[1]) as f:
    for app in (yaml.safe_load(f) or {}).get("apps", []):
        print(app)
' "$APPS_CONFIG_FILE" | while IFS= read -r SOURCE; do
        if [ -z "$SOURCE" ]; then
            continue
        fi
        _TYPE="$(_source_type "$SOURCE")"
        case "$_TYPE" in
            local)
                _install_local_source "$SOURCE"
                ;;
            git)
                _install_git_source "$SOURCE"
                ;;
            archive-local | archive-remote)
                _install_archive_source "$SOURCE" "$_TYPE"
                ;;
            *)
                echo "unknown source type for $SOURCE" >&2
                ;;
        esac
    done
fi
SITE_CONFIG="$(cat "$BENCH_DIR/sites/$SITE_NAME/site_config.json")"
if [ "$(echo "$SITE_CONFIG" | jq -r '.db_user // ""')" != "$FRAPPE_DB_USER" ]; then
    bench --site "$SITE_NAME" set-config db_user "$FRAPPE_DB_USER"
fi
if [ "$(echo "$SITE_CONFIG" | jq -r '.developer_mode // ""')" != "1" ]; then
    bench --site "$SITE_NAME" set-config developer_mode 1
fi
if [ "$(echo "$SITE_CONFIG" | jq -r '.allow_tests // ""')" != "1" ]; then
    bench --site "$SITE_NAME" set-config allow_tests 1
fi
if [ "$(echo "$SITE_CONFIG" | jq -r '.db_host // ""')" != "$FRAPPE_DB_HOST" ]; then
    bench --site "$SITE_NAME" set-config db_host "$FRAPPE_DB_HOST"
fi
if [ "$(echo "$SITE_CONFIG" | jq -r '.db_name // ""')" != "$FRAPPE_DB_NAME" ]; then
    bench --site "$SITE_NAME" set-config db_name "$FRAPPE_DB_NAME"
fi
if [ "$(echo "$SITE_CONFIG" | jq -r '.db_password // ""')" != "$FRAPPE_DB_PASSWORD" ]; then
    bench --site "$SITE_NAME" set-config db_password "$FRAPPE_DB_PASSWORD"
fi
if [ "$(echo "$SITE_CONFIG" | jq -r '.db_port // ""')" != "$FRAPPE_DB_PORT" ]; then
    bench --site "$SITE_NAME" set-config db_port "$FRAPPE_DB_PORT"
fi
if [ "$(echo "$SITE_CONFIG" | jq -r '.host_name // ""')" != "$FRAPPE_BASE_URL" ]; then
    bench --site "$SITE_NAME" set-config host_name "$FRAPPE_BASE_URL"
fi
if [ "$(echo "$SITE_CONFIG" | jq -r '.restart_supervisor_on_update // ""')" != "1" ]; then
    bench --site "$SITE_NAME" set-config restart_supervisor_on_update 1
fi
# Dev proxy: route /auth and /api/auth through Frappe to One and Keycloak
if [ "$(echo "$SITE_CONFIG" | jq -r '.one_dev_proxy // ""')" != "true" ]; then
    bench --site "$SITE_NAME" set-config one_dev_proxy 1
fi
if [ -n "${ONE_PORT:-}" ] && [ "$(echo "$SITE_CONFIG" | jq -r '.one_dev_proxy_target // ""')" != "http://localhost:${ONE_PORT}" ]; then
    bench --site "$SITE_NAME" set-config one_dev_proxy_target "http://localhost:${ONE_PORT}"
fi
frappe_site_config_drop "$BENCH_DIR/sites/$SITE_NAME/site_config.json" keycloak_dev_proxy_target
if [ -n "${KEYCLOAK_PORT:-}" ] && [ "$(echo "$SITE_CONFIG" | jq -r '.one_dev_proxy_keycloak_target // ""')" != "http://localhost:${KEYCLOAK_PORT}/auth" ]; then
    bench --site "$SITE_NAME" set-config one_dev_proxy_keycloak_target "http://localhost:${KEYCLOAK_PORT}/auth"
fi
bench migrate
# Mark the Frappe setup wizard complete so freshly bootstrapped sites skip it.
# enable_setup_wizard_complete flips Installed Application.is_setup_complete=1
# (the exact lever the real wizard uses) -- on this Frappe the desk redirect is
# gated by that per-app flag, not System Settings.setup_complete. bench execute
# auto-commits; re-running over an already-complete row is a no-op (idempotent).
for _app in frappe erpnext; do
    bench --site "$SITE_NAME" execute \
        frappe.desk.page.setup_wizard.setup_wizard.enable_setup_wizard_complete \
        --kwargs "{\"app_name\": \"$_app\"}" 2>/dev/null || true
done
# Land the desk on a workspace instead of the wizard route.
bench --site "$SITE_NAME" execute \
    frappe.db.set_default --kwargs '{"key": "desktop:home_page", "val": "workspace"}' 2>/dev/null || true
bench clear-cache
bench enable-scheduler
