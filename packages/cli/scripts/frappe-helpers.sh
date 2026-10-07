#!/bin/sh

# Shared helper functions for frappe CLI scripts.

frappe_keep_init() {
    FRAPPE_KEEP_APPS=" frappe "
}

frappe_add_keep() {
    _name="$1"
    [ -n "$_name" ] || return 0
    case "$FRAPPE_KEEP_APPS" in
        *" $_name "*) ;;
        *) FRAPPE_KEEP_APPS="$FRAPPE_KEEP_APPS$_name " ;;
    esac
}

frappe_collect_keep_apps() {
    # Keep local file-sourced apps from frappe.yaml when they point inside BENCH_DIR/apps.
    if [ -f "$BENCH_DIR/frappe.yaml" ]; then
        _tmp_sources="$(mktemp)" || return 1
        sed -n 's/^[[:space:]]*-[[:space:]]*//p' "$BENCH_DIR/frappe.yaml" > "$_tmp_sources"
        while IFS= read -r _src; do
            [ -n "$_src" ] || continue
            case "$_src" in
                file://* | ./* | ../* | /*) ;;
                *) continue ;;
            esac
            _path="${_src#file://}"
            case "$_path" in
                ./* | ../*) _path="$(realpath "$BENCH_DIR/$_path" 2>/dev/null || true)" ;;
                /*) _path="$(realpath "$_path" 2>/dev/null || true)" ;;
            esac
            case "$_path" in
                "$BENCH_DIR/apps/"*) frappe_add_keep "$(basename "$_path")" ;;
            esac
        done < "$_tmp_sources"
        rm -f "$_tmp_sources"
    fi

    # Keep local file-sourced apps from sites/apps.json when present.
    if [ -f "$BENCH_DIR/sites/apps.json" ]; then
        _tmp_json_apps="$(mktemp)" || return 1
        python3 - "$BENCH_DIR/sites/apps.json" "$BENCH_DIR/apps" > "$_tmp_json_apps" <<'PY'
import json, os, sys
apps_json = sys.argv[1]
apps_root = os.path.realpath(sys.argv[2])

def walk(v):
    if isinstance(v, dict):
        for vv in v.values():
            yield from walk(vv)
    elif isinstance(v, list):
        for vv in v:
            yield from walk(vv)
    elif isinstance(v, str):
        yield v

with open(apps_json, "r", encoding="utf-8") as f:
    data = json.load(f)

seen = set()
for s in walk(data):
    raw = None
    if s.startswith("file://"):
        raw = s[7:]
    elif s.startswith("./") or s.startswith("../") or s.startswith("/"):
        raw = s
    if not raw:
        continue
    p = os.path.realpath(raw if os.path.isabs(raw) else os.path.join(apps_root, "..", raw))
    if p.startswith(apps_root + os.sep):
        name = os.path.basename(p)
        if name and name not in seen:
            print(name)
            seen.add(name)
PY
        while IFS= read -r _name; do
            frappe_add_keep "$_name"
        done < "$_tmp_json_apps"
        rm -f "$_tmp_json_apps"
    fi
}

frappe_remove_non_keep_apps() {
    for _d in "$BENCH_DIR/apps"/*/; do
        [ -d "$_d" ] || continue
        _name="$(basename "$_d")"
        case "$FRAPPE_KEEP_APPS" in
            *" $_name "*) continue ;;
        esac
        # An app the repo tracks is source, not a derived copy, whether or not
        # frappe.yaml lists it yet.
        if [ -n "$(git -C "$BENCH_DIR" ls-files -- "apps/$_name" 2>/dev/null | head -n 1)" ]; then
            continue
        fi
        rm -rf "$_d"
    done
}

frappe_site_config_drop() {
    _file="$1"
    _key="$2"
    [ -f "$_file" ] || return 0
    _has="$(jq --arg k "$_key" 'has($k)' "$_file")" || return 1
    [ "$_has" = "true" ] || return 0
    jq --arg k "$_key" 'del(.[$k])' "$_file" > "$_file.tmp" && mv "$_file.tmp" "$_file"
}

frappe_checkout_db_name() {
    _root="$(cd "$1" && pwd -P)" || return 1
    _slug="$(printf '%s' "${_root##*/}" | tr '[:upper:]' '[:lower:]' | tr -c 'a-z0-9' '_' | cut -c1-16)"
    _sum="$(printf '%s' "$_root" | sha256sum | cut -c1-8)"
    printf 'frappe_%s_%s\n' "$_slug" "$_sum"
}

frappe_resolve_db_name() {
    if [ -n "$1" ]; then
        printf '%s\n' "$1"
        return 0
    fi
    if [ -f "$2" ]; then
        _name="$(jq -r '.db_name // ""' "$2")" || return 1
        if [ -n "$_name" ]; then
            printf '%s\n' "$_name"
            return 0
        fi
    fi
    frappe_checkout_db_name "$3"
}

frappe_db_may_drop() {
    _db="$1"
    _cfg="$2"
    _tables="$3"
    if [ -f "$_cfg" ] && [ "$(jq -r '.db_name // ""' "$_cfg")" = "$_db" ]; then
        return 0
    fi
    [ "$_tables" = "0" ] && return 0
    echo "refusing to drop database $_db: $_cfg does not name it and it is not empty (tables: ${_tables:-unknown}), so another checkout may own it. Set FRAPPE_DB_NAME in .env to a new name, or drop $_db yourself if it is yours." >&2
    return 1
}
