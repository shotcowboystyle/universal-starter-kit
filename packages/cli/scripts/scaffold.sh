#!/bin/sh
# Scaffold a consumer project from the universal-starter-kit monorepo.
#
# The consumer project IS the monorepo at one commit, pruned: the published
# packages under public/ go (they come back from the registry), the singleton
# apps not asked for go, and apps/one (the One platform app) is renamed to each
# product app. `mpo init` and `mpo update` call this script; it also runs on its
# own with nothing but git, node and a POSIX shell.
#
# Usage: scaffold.sh [options] <source> <ref> <target>
#   source   path to a local clone (taken with git archive) or a git URL
#            (shallow fetch of the ref)
#   ref      branch, tag or commit
#   target   directory to write; must not exist or be empty (see --into)
#
# Options:
#   --app <name>          product app derived from apps/one (repeatable)
#   --service <name>      singleton app under apps/ to keep (repeatable):
#                         ethereum keycloak solana storybook
#                         storybook-expo sui uxpin vocs
#   --mpo-version <range> range written for @repo/* deps
#                         (default: ^<version of packages/cli in the source tree>)
#   --keep <dir>          keep a pruned top-level path (repeatable):
#                         public agent-os .changeset docs deploy
#   --into                target may already hold files: a path that already
#                         exists there is skipped, listed, and pinned in
#                         .updateignore so `mpo update` never rewrites it
#   --source-url <url>    url recorded in .mpo.json when <source> is a path
#   --name <name>         root package.json name (default: the target's basename)

set -eu

usage() {
    sed -n '2,30p' "$0" | sed 's/^# \{0,1\}//'
}

die() {
    printf 'scaffold: %s\n' "$*" >&2
    exit 1
}

pascal_case() {
    printf '%s\n' "$1" | awk -F- '{ for (i = 1; i <= NF; i++) printf "%s%s", toupper(substr($i, 1, 1)), substr($i, 2); print "" }'
}

valid_name() {
    case "$1" in
    '' | *[!a-z0-9-]* | [!a-z]*) return 1 ;;
    esac
}

# The ls-tree lines on stdin whose path is a word of $1, printed without the
# directory prefix $2 (mktree input for that directory).
keep_entries() {
    while IFS="$TAB" read -r _meta _path; do
        case " $1 " in
        *" $_path "*) printf '%s\t%s\n' "$_meta" "${_path#"$2"}" ;;
        esac
    done
}

# Rewrite one file in place with a sed script ($2), atomically.
sed_file() {
    _tmp="$1.scaffold.tmp"
    sed "$2" "$1" >"$_tmp" && mv "$_tmp" "$1"
}

positional() {
    if [ -z "$SOURCE" ]; then
        SOURCE="$1"
    elif [ -z "$REF" ]; then
        REF="$1"
    elif [ -z "$TARGET" ]; then
        TARGET="$1"
    else
        die "unexpected argument $1 (see --help)"
    fi
}

# Text files under $1 that mention any of the patterns given after it.
grep_files() {
    _dir="$1"
    shift
    grep -rIl "$@" "$_dir" 2>/dev/null || true
}

APPS=""
SERVICES=""
KEEP=""
MPO_VERSION=""
INTO=0
SOURCE_URL=""
PROJECT_NAME=""
SOURCE=""
REF=""
TARGET=""
PRUNE="public agent-os .changeset docs deploy typedoc.json .gitlab-ci.yml"
TAB="$(printf '\t')"

while [ $# -gt 0 ]; do
    case "$1" in
    --app)
        [ $# -ge 2 ] || die "--app needs a name"
        valid_name "$2" || die "app name \"$2\" must be lowercase letters, digits and hyphens, starting with a letter"
        [ "$2" != one ] || die "the product app cannot be named one (that is the monorepo's One app)"
        APPS="$APPS $2"
        shift 2
        ;;
    --service)
        [ $# -ge 2 ] || die "--service needs a name"
        valid_name "$2" || die "service name \"$2\" must be lowercase letters, digits and hyphens"
        [ "$2" != one ] || die "one is the product app, not a service (use --app)"
        SERVICES="$SERVICES $2"
        shift 2
        ;;
    --mpo-version)
        [ $# -ge 2 ] || die "--mpo-version needs a range"
        MPO_VERSION="$2"
        shift 2
        ;;
    --keep)
        [ $# -ge 2 ] || die "--keep needs a path"
        KEEP="$KEEP $2"
        shift 2
        ;;
    --into)
        INTO=1
        shift
        ;;
    --source-url)
        [ $# -ge 2 ] || die "--source-url needs a url"
        SOURCE_URL="$2"
        shift 2
        ;;
    --name)
        [ $# -ge 2 ] || die "--name needs a name"
        PROJECT_NAME="$2"
        shift 2
        ;;
    -h | --help)
        usage
        exit 0
        ;;
    --)
        shift
        for _arg in "$@"; do positional "$_arg"; done
        break
        ;;
    -*)
        die "unknown option $1 (see --help)"
        ;;
    *)
        positional "$1"
        shift
        ;;
    esac
done

[ -n "$SOURCE" ] && [ -n "$REF" ] && [ -n "$TARGET" ] || {
    usage >&2
    exit 1
}
APPS="${APPS# }"
SERVICES="${SERVICES# }"
KEEP="${KEEP# }"
FIRST_APP="${APPS%% *}"

for _app in $APPS; do
    for _service in $SERVICES; do
        [ "$_app" != "$_service" ] || die "$_app is both an --app and a --service"
    done
done

command -v git >/dev/null 2>&1 || die "git is required"
command -v node >/dev/null 2>&1 || die "node is required (JSON edits)"

if [ -e "$TARGET" ]; then
    [ -d "$TARGET" ] || die "target $TARGET exists and is not a directory"
    if [ -n "$(ls -A "$TARGET")" ] && [ "$INTO" -eq 0 ]; then
        die "target $TARGET is not empty (pass --into to scaffold into an existing directory)"
    fi
fi

WORK="$(mktemp -d "${TMPDIR:-/tmp}/mpo-scaffold.XXXXXX")"
trap 'rm -rf "$WORK"' EXIT INT TERM

# ── 1. the repository and the commit ─────────────────────────────────────

if [ -d "$SOURCE" ]; then
    REPO="$(cd "$SOURCE" && pwd)"
    SHA="$(git -C "$REPO" rev-parse --verify --quiet "$REF^{commit}")" ||
        die "$REF is not a commit in $REPO"
    [ -n "$SOURCE_URL" ] || SOURCE_URL="$REPO"
else
    # A shallow, blobless fetch: commit and trees only. The blobs the project
    # keeps are fetched in one batch in step 2, so nothing under public/ or
    # docs/ crosses the wire (a server without filter support sends all).
    REPO="$WORK/clone"
    git init -q "$REPO"
    git -C "$REPO" remote add origin "$SOURCE"
    git -C "$REPO" fetch -q --depth 1 --filter=blob:none origin "$REF" ||
        die "could not fetch $REF from $SOURCE"
    SHA="$(git -C "$REPO" rev-parse --verify --quiet 'FETCH_HEAD^{commit}')" ||
        die "$REF at $SOURCE is not a commit"
    [ -n "$SOURCE_URL" ] || SOURCE_URL="$SOURCE"
fi

git -C "$REPO" rev-parse --verify --quiet "$SHA:apps/one/package.json" >/dev/null ||
    die "$SOURCE at $REF has no apps/one: not the universal-starter-kit monorepo"

if [ -z "$MPO_VERSION" ]; then
    MPO_VERSION="^$(git -C "$REPO" show "$SHA:packages/cli/package.json" | sed -n 's/^  "version": "\([^"]*\)".*/\1/p' | head -n 1)"
    [ "$MPO_VERSION" != "^" ] || die "could not read the CLI version from packages/cli/package.json at $SHA"
fi
CLI_VERSION="${MPO_VERSION#[~^]}"

# ── 2. take only what a consumer carries ─────────────────────────────────

# Top-level entries and apps/* at the commit decide what is archived; the
# pruned trees are never written, which is most of the wall time saved.
REMOVED=""
REMOVED_APPS=""
PATHS=""
for _entry in $(git -C "$REPO" ls-tree --name-only "$SHA"); do
    case "$_entry" in
    apps) continue ;;
    esac
    case " $PRUNE " in
    *" $_entry "*)
        case " $KEEP " in
        *" $_entry "*) ;;
        *)
            REMOVED="$REMOVED $_entry"
            printf 'removed: %s\n' "$_entry"
            continue
            ;;
        esac
        ;;
    esac
    PATHS="$PATHS $_entry"
done
for _entry in $(git -C "$REPO" ls-tree --name-only "$SHA" apps/); do
    _name="${_entry#apps/}"
    case " one $SERVICES " in
    *" $_name "*)
        PATHS="$PATHS $_entry"
        continue
        ;;
    esac
    REMOVED_APPS="$REMOVED_APPS $_name"
    REMOVED="$REMOVED $_entry"
    printf 'removed: %s\n' "$_entry"
done
REMOVED="${REMOVED# }"
REMOVED_APPS="${REMOVED_APPS# }"
for _service in $SERVICES; do
    case " $PATHS " in
    *" apps/$_service "*) ;;
    *) die "service $_service does not exist under apps/ at $SHA" ;;
    esac
done

if [ "$INTO" -eq 1 ]; then
    TREE="$WORK/tree"
else
    TREE="$TARGET"
fi
mkdir -p "$TREE"
if [ "$(git -C "$REPO" config --get remote.origin.promisor || true)" = true ]; then
    # git archive of a pathspec still reads blobs outside it, so a blobless
    # clone archives a tree holding only $PATHS, its blobs fetched in one go.
    _apps_tree="$(git -C "$REPO" ls-tree "$SHA" apps/ | keep_entries "$PATHS" apps/ | git -C "$REPO" mktree --missing)"
    _tree="$({
        git -C "$REPO" ls-tree "$SHA" | keep_entries "$PATHS" ""
        printf '040000 tree %s\tapps\n' "$_apps_tree"
    } | git -C "$REPO" mktree --missing)"
    git -C "$REPO" ls-tree -r "$_tree" | awk '$2 == "blob" { print $3 }' >"$WORK/blobs"
    # The same request git makes to fill a blobless clone: a "have" for a
    # fetched ref would tell the server the blobs are already here.
    if [ -s "$WORK/blobs" ]; then
        git -C "$REPO" -c fetch.negotiationAlgorithm=noop fetch -q --no-tags --no-write-fetch-head \
            --filter=blob:none --stdin origin <"$WORK/blobs" ||
            die "could not fetch the project's files from $SOURCE"
    fi
    git -C "$REPO" archive --format=tar "$_tree" | tar -xf - -C "$TREE"
else
    # shellcheck disable=SC2086
    git -C "$REPO" archive --format=tar "$SHA" $PATHS | tar -xf - -C "$TREE"
fi
rm -rf "$TREE/apps/storybook/.lostpixel/baseline" "$TREE/apps/storybook/.lostpixel/matrix-tier2/baseline"
# patches/public/ patches packages only the published packages' build
# installs; pnpm fails an install whose patch matches nothing.
case " $REMOVED " in
*" public "*) rm -rf "$TREE/patches/public" ;;
esac

# The root AGENTS.md documents the monorepo; a project gets the consumer copy
# at the same commit, so an mpo update merge base carries the copy its commit
# shipped (a commit before the copy existed keeps the monorepo file).
if git -C "$REPO" rev-parse --verify --quiet "$SHA:packages/cli/templates/AGENTS.md" >/dev/null; then
    git -C "$REPO" show "$SHA:packages/cli/templates/AGENTS.md" >"$TREE/AGENTS.md"
fi

# Commits from MPO-343 to MPO-289 shipped a pnpmfile mapping @repo
# to Pulp. The scaffold at one of them still carries it, so an mpo update whose
# merge base is such a commit sees the file leave and removes it.
if git -C "$REPO" rev-parse --verify --quiet "$SHA:packages/cli/templates/pnpmfile.cjs" >/dev/null; then
    git -C "$REPO" show "$SHA:packages/cli/templates/pnpmfile.cjs" >"$TREE/.pnpmfile.cjs"
fi
if [ -f "$TREE/.pnpmfile.cjs" ] && [ -f "$TREE/pnpm-lock.yaml" ]; then
    node - "$TREE/.pnpmfile.cjs" "$TREE/pnpm-lock.yaml" <<'NODE'
const crypto = require("node:crypto");
const fs = require("node:fs");
const [pnpmfile, lockfile] = process.argv.slice(2);
// pnpm re-resolves every dependency when the lockfile's pnpmfileChecksum does
// not match, and the shipped lockfile would pin nothing. Same hash as pnpm 10.
const content = fs.readFileSync(pnpmfile, "utf8").split("\r\n").join("\n");
const checksum = `sha256-${crypto.createHash("sha256").update(content).digest("base64")}`;
let lock = fs.readFileSync(lockfile, "utf8").replace(/^pnpmfileChecksum: .*\n\n/m, "");
const at = lock.search(/^(patchedDependencies|importers):/m);
if (at < 0) process.exit(0);
lock = `${lock.slice(0, at)}pnpmfileChecksum: ${checksum}\n\n${lock.slice(at)}`;
fs.writeFileSync(lockfile, lock);
NODE
fi

# Whatever names the One app outside it (docker-bake.hcl, comments in
# features/) points at the first product app; the root files that need more
# than a rename are handled below.
if [ -n "$FIRST_APP" ]; then
    for _file in $(grep_files "$TREE" -e '@platform/one' -e 'apps/one' -e 'features/one'); do
        case "$_file" in
        "$TREE/apps/one/"* | "$TREE/features/one/"* | "$TREE/.gitignore" | "$TREE/Makefile" | "$TREE/package.json" | "$TREE/.vscode/"*) continue ;;
        esac
        sed_file "$_file" "s|@platform/one|@app/$FIRST_APP|g
s|apps/one\\([^-a-zA-Z0-9_]\\)|apps/$FIRST_APP\\1|g
s|apps/one\$|apps/$FIRST_APP|g
s|features/one\\([^-a-zA-Z0-9_]\\)|features/$FIRST_APP\\1|g
s|features/one\$|features/$FIRST_APP|g"
    done
fi

# ── 3. apps/one becomes each product app ─────────────────────────────────

for _app in $APPS; do
    [ ! -e "$TREE/apps/$_app" ] || die "apps/$_app already exists in the source tree; pick another product name"
    cp -R "$TREE/apps/one" "$TREE/apps/$_app"
    # A feature module of that name already satisfies the app/features twin
    # (features/pokemon is the One app's own pokemon feature). The index
    # routes import features/<app>/screen, so a module without one gets
    # features/one's.
    if [ -d "$TREE/features/one" ]; then
        if [ ! -e "$TREE/features/$_app" ]; then
            cp -R "$TREE/features/one" "$TREE/features/$_app"
        elif [ ! -e "$TREE/features/$_app/screen.tsx" ]; then
            cp "$TREE/features/one/screen.tsx" "$TREE/features/$_app/screen.tsx"
        fi
    fi
    _pascal="$(pascal_case "$_app")"
    _appid="$(printf '%s' "$_app" | tr -d '-')"
    _script="s|@platform/one|@app/$_app|g
s|apps/one\\([^-a-zA-Z0-9_]\\)|apps/$_app\\1|g
s|apps/one\$|apps/$_app|g
s|features/one\\([^-a-zA-Z0-9_]\\)|features/$_app\\1|g
s|features/one\$|features/$_app|g
s|one\\.multiplatform\\.app|com.$_appid.app|g
s|multiplatform-one|$_app|g
s|Multiplatform One|$_pascal|g
s|\"multiplatform\\.one\"|\"$_app\"|g"
    for _dir in "$TREE/apps/$_app" "$TREE/features/$_app"; do
        [ -d "$_dir" ] || continue
        for _file in $(grep_files "$_dir" -e '@platform/one' -e 'apps/one' -e 'features/one' -e 'one\.multiplatform\.app' -e 'multiplatform-one' -e 'Multiplatform One' -e '"multiplatform\.one"'); do
            sed_file "$_file" "$_script"
        done
    done
done
rm -rf "$TREE/apps/one" "$TREE/features/one"

# ── 4. root wiring: Makefile, .gitignore, .env, .vscode, package.json ─────

if [ -f "$TREE/Makefile" ]; then
    awk -v apps="$APPS" -v removed="$REMOVED_APPS" '
    BEGIN {
        napps = split(apps, app, " ")
        nremoved = split(removed, gone, " ")
        for (i = 1; i <= nremoved; i++) dead[gone[i]] = 1
        dead["vscode"] = 1
        dead["webext"] = 1
    }
    # "name/%: configure FORCE" followed by its one recipe line.
    match($0, /^[a-z0-9-]+\/%: /) {
        name = substr($0, 1, RSTART + RLENGTH - 5)
        getline recipe
        if (name == "one") {
            for (i = 1; i <= napps; i++) {
                line = $0
                sub(/^one\//, app[i] "/", line)
                print line
                r = recipe
                gsub(/apps\/one/, "apps/" app[i], r)
                print r
            }
            next
        }
        if (name in dead) next
        print
        print recipe
        next
    }
    /^# vscode \+ webext are targets OF the One platform app/ { getline; next }
    /^\.PHONY: / && /one\/%/ {
        out = ".PHONY:"
        for (i = 2; i <= NF; i++) {
            word = $i
            base = word
            sub(/\/%$/, "", base)
            if (base == "one") {
                for (j = 1; j <= napps; j++) out = out " " app[j] "/%"
                continue
            }
            if (base in dead) continue
            out = out " " word
        }
        print out
        next
    }
    # Plain rule headers: drop prerequisites of removed apps (down: keycloak/down docker/down).
    /^[a-z][a-z0-9\/._-]*: / && !/%/ {
        out = $1
        for (i = 2; i <= NF; i++) {
            word = $i
            base = word
            sub(/\/.*$/, "", base)
            if (base in dead) continue
            out = out " " word
        }
        print out
        next
    }
    { print }
    ' "$TREE/Makefile" >"$TREE/Makefile.scaffold.tmp" && mv "$TREE/Makefile.scaffold.tmp" "$TREE/Makefile"
fi

if [ -f "$TREE/.gitignore" ]; then
    awk -v apps="$APPS" '
    BEGIN { napps = split(apps, app, " ") }
    /apps\/one(\/|$| )/ {
        for (i = 1; i <= napps; i++) {
            line = $0
            gsub(/apps\/one/, "apps/" app[i], line)
            print line
        }
        next
    }
    { print }
    ' "$TREE/.gitignore" >"$TREE/.gitignore.scaffold.tmp" && mv "$TREE/.gitignore.scaffold.tmp" "$TREE/.gitignore"
fi

# .env.example sections are headed "# <app>"; a removed app takes its section
# (header through the next blank line) with it. keycloak also owns postgres.
ENV_SECTIONS="$REMOVED_APPS"
[ -z "$APPS" ] && [ -d "$TREE/apps" ] && ENV_SECTIONS="$ENV_SECTIONS one"
case " $REMOVED_APPS " in
*" keycloak "*) ENV_SECTIONS="$ENV_SECTIONS postgres" ;;
esac
for _envfile in "$TREE/.env.example" "$TREE/.env"; do
    [ -f "$_envfile" ] || continue
    awk -v sections="$ENV_SECTIONS" '
    BEGIN { n = split(sections, s, " "); for (i = 1; i <= n; i++) drop["# " s[i]] = 1 }
    skipping && /^$/ { skipping = 0; next }
    skipping { next }
    ($0 in drop) { skipping = 1; next }
    { print }
    ' "$_envfile" >"$_envfile.scaffold.tmp" && mv "$_envfile.scaffold.tmp" "$_envfile"
done
if [ -f "$TREE/.env.example" ] && [ ! -f "$TREE/.env" ]; then
    cp "$TREE/.env.example" "$TREE/.env"
fi

# Docker wiring that backs a pruned app goes with it. A compose service goes
# when one of its profiles is named after the app (keycloak: its postgres),
# when it bind-mounts from under apps/<app>, or when it depends on a service
# that went, and so do the named volumes only those services used. With no
# service left the file is `services: {}`, which compose still reads, and
# `pnpm backend` goes with the services it started. A bake target building
# from apps/<app> and a `# <app>-block` of docker/Makefile go too. Nothing is
# rewritten while every app they name is kept.
if [ -n "$REMOVED_APPS" ] && [ -f "$TREE/docker/compose.yaml" ]; then
    awk -v removed="$REMOVED_APPS" '
    function record(svc, section, value, name) {
        name = value
        sub(/:.*/, "", name)
        gsub(/[" \047]/, "", name)
        if (section == "profiles" && (name in gone)) dead[svc] = 1
        if (section == "depends_on" && name != "") needs[svc, ++nneeds[svc]] = name
        if (section == "volumes" && name ~ /^[A-Za-z0-9_-]+$/ && value ~ /:/) uses[svc, ++nuses[svc]] = name
    }
    BEGIN {
        nremoved = split(removed, list, " ")
        for (i = 1; i <= nremoved; i++) gone[list[i]] = 1
    }
    { line[++n] = $0 }
    END {
        for (i = 1; i <= n; i++) {
            l = line[i]
            if (l ~ /^[^ #]/) {
                npending = 0
                top = l
                sub(/:.*/, "", top)
                cur = ""
                vol = ""
                if (top == "services") services_at = i
                if (top == "volumes") volumes_at = i
                continue
            }
            if (top == "volumes") {
                if (l ~ /^  [A-Za-z0-9_.-]+:/) {
                    vol = l
                    sub(/^  /, "", vol)
                    sub(/:.*/, "", vol)
                }
                if (vol != "") vowner[i] = vol
                continue
            }
            if (top != "services") continue
            if (l ~ /^  #/ || (npending && l ~ /^[ ]*$/)) {
                pending[++npending] = i
                continue
            }
            if (l ~ /^  [A-Za-z0-9_.-]+:/) {
                cur = l
                sub(/^  /, "", cur)
                sub(/:.*/, "", cur)
                order[++nservices] = cur
                for (j = 1; j <= npending; j++) owner[pending[j]] = cur
                npending = 0
                section = ""
                owner[i] = cur
                continue
            }
            if (cur == "") continue
            owner[i] = cur
            if (l ~ /^[ ]*#/) continue
            for (app in gone) if (index(l, "../apps/" app "/")) dead[cur] = 1
            if (l ~ /^    [A-Za-z_]+:/) {
                section = l
                sub(/^    /, "", section)
                sub(/:.*/, "", section)
                rest = l
                sub(/^    [A-Za-z_]+:[ ]*/, "", rest)
                if (rest ~ /^\[/) {
                    gsub(/[][]/, "", rest)
                    nparts = split(rest, parts, ",")
                    for (j = 1; j <= nparts; j++) record(cur, section, parts[j])
                }
                continue
            }
            if (l ~ /^      - / || l ~ /^      [A-Za-z0-9_.-]+:/) {
                value = l
                sub(/^      (- )?/, "", value)
                record(cur, section, value)
            }
        }
        do {
            changed = 0
            for (s = 1; s <= nservices; s++) {
                svc = order[s]
                if (svc in dead) continue
                for (k = 1; k <= nneeds[svc]; k++) {
                    if (needs[svc, k] in dead) {
                        dead[svc] = 1
                        changed = 1
                    }
                }
            }
        } while (changed)
        live = 0
        for (s = 1; s <= nservices; s++) {
            svc = order[s]
            if (!(svc in dead)) live++
            for (k = 1; k <= nuses[svc]; k++) {
                if (svc in dead) dead_use[uses[svc, k]] = 1
                else live_use[uses[svc, k]] = 1
            }
        }
        if (live == nservices) {
            for (i = 1; i <= n; i++) print line[i]
            exit
        }
        volumes_kept = 0
        for (i in vowner) {
            name = vowner[i]
            if ((name in dead_use) && !(name in live_use)) vdrop[name] = 1
            else volumes_kept = 1
        }
        m = 0
        for (i = 1; i <= n; i++) {
            if ((i in owner) && (owner[i] in dead)) continue
            if ((i in vowner) && (vowner[i] in vdrop)) continue
            if (i == volumes_at && !volumes_kept) continue
            out[++m] = (i == services_at && !live) ? "services: {}" : line[i]
        }
        while (m > 0 && out[m] ~ /^[ ]*$/) m--
        for (i = 1; i <= m; i++) print out[i]
    }
    ' "$TREE/docker/compose.yaml" >"$TREE/docker/compose.yaml.scaffold.tmp" &&
        mv "$TREE/docker/compose.yaml.scaffold.tmp" "$TREE/docker/compose.yaml"
    if grep -q '^services: {}$' "$TREE/docker/compose.yaml"; then
        node - "$TREE/package.json" <<'NODE'
const fs = require("node:fs");
const file = process.argv[2];
const pkg = JSON.parse(fs.readFileSync(file, "utf8"));
if (pkg.scripts?.backend?.includes("docker/compose.yaml")) {
  delete pkg.scripts.backend;
  fs.writeFileSync(file, `${JSON.stringify(pkg, null, 2)}\n`);
}
NODE
    fi
fi
if [ -n "$REMOVED_APPS" ] && [ -f "$TREE/docker/docker-bake.hcl" ]; then
    awk -v removed="$REMOVED_APPS" '
    BEGIN { nremoved = split(removed, gone, " ") }
    { line[++n] = $0 }
    END {
        for (i = 1; i <= n; i++) {
            if (line[i] !~ /^target "[^"]*" \{/) continue
            name = line[i]
            sub(/^target "/, "", name)
            sub(/".*/, "", name)
            for (end = i; end < n && line[end] != "}"; end++) continue
            drop = 0
            for (j = 1; j <= nremoved; j++) {
                if (name == gone[j]) drop = 1
                for (k = i; k <= end; k++)
                    if (line[k] ~ /^[ ]*dockerfile[ ]*=/ && index(line[k], "\"apps/" gone[j] "/")) drop = 1
            }
            if (drop) {
                start = i
                while (start > 1 && line[start - 1] ~ /^#/) start--
                if (start > 1 && line[start - 1] == "") start--
                for (k = start; k <= end; k++) skip[k] = 1
            }
            i = end
        }
        for (i = 1; i <= n; i++) if (!(i in skip)) print line[i]
    }
    ' "$TREE/docker/docker-bake.hcl" >"$TREE/docker/docker-bake.hcl.scaffold.tmp" &&
        mv "$TREE/docker/docker-bake.hcl.scaffold.tmp" "$TREE/docker/docker-bake.hcl"
fi
if [ -n "$REMOVED_APPS" ] && [ -f "$TREE/docker/Makefile" ]; then
    awk -v removed=" $REMOVED_APPS " '
    /^# [a-z0-9-]+-block$/ {
        name = $2
        sub(/-block$/, "", name)
        skipping = index(removed, " " name " ") > 0
    }
    !skipping
    ' "$TREE/docker/Makefile" >"$TREE/docker/Makefile.scaffold.tmp" &&
        mv "$TREE/docker/Makefile.scaffold.tmp" "$TREE/docker/Makefile"
fi

# The root README documents the monorepo; a project gets the consumer copy at
# the same commit. A block between <!-- service:<app> --> and its closing
# <!-- /service:<app> --> stays only when that service was kept, and a
# no-service block only when it was not.
if git -C "$REPO" rev-parse --verify --quiet "$SHA:packages/cli/templates/README.md" >/dev/null; then
    git -C "$REPO" show "$SHA:packages/cli/templates/README.md" | awk -v kept=" $SERVICES " '
    /^<!-- \/(no-)?service:[a-z0-9-]+ -->$/ {
        skipping = 0
        next
    }
    /^<!-- (no-)?service:[a-z0-9-]+ -->$/ {
        name = $2
        negate = sub(/^no-/, "", name)
        sub(/^service:/, "", name)
        present = index(kept, " " name " ") > 0
        skipping = negate ? present : !present
        next
    }
    skipping { next }
    /^$/ && blank { next }
    { blank = ($0 == ""); print }
    ' >"$TREE/README.md"
fi

APPS_CSV="$(printf '%s' "$APPS" | tr ' ' ',')"
REMOVED_CSV="$(printf '%s' "$REMOVED_APPS" | tr ' ' ',')"
for _vsfile in "$TREE/.vscode/launch.json" "$TREE/.vscode/tasks.json"; do
    [ -f "$_vsfile" ] || continue
    node - "$_vsfile" "$APPS_CSV" "$REMOVED_CSV" <<'NODE'
const fs = require("node:fs");
const [file, appsCsv, removedCsv] = process.argv.slice(2);
const apps = appsCsv ? appsCsv.split(",") : [];
const removed = removedCsv ? removedCsv.split(",") : [];
const json = JSON.parse(fs.readFileSync(file, "utf8"));
const mentions = (value, name) => {
  const text = JSON.stringify(value);
  return [`/apps/${name}/`, `/apps/${name}"`, `}/${name}/`, `}/${name}"`].some((needle) =>
    text.includes(needle),
  );
};
const forApp = (value, name) =>
  JSON.parse(
    JSON.stringify(value)
      .split("/apps/one/").join(`/apps/${name}/`)
      .split('/apps/one"').join(`/apps/${name}"`)
      .split('"one dev"').join(`"${name} dev"`),
  );
const multiply = (items) =>
  items.flatMap((item) => {
    if (removed.some((name) => mentions(item, name))) return [];
    if (!mentions(item, "one")) return [item];
    return apps.map((name) => {
      const copy = forApp(item, name);
      if (apps.length > 1 && copy.name && !copy.name.startsWith(`${name} `)) {
        copy.name = `${name} ${copy.name}`;
      }
      return copy;
    });
  });
if (Array.isArray(json.configurations)) {
  json.configurations = multiply(json.configurations);
  const names = new Set(json.configurations.map((item) => item.name));
  if (Array.isArray(json.compounds)) {
    json.compounds = json.compounds
      .map((compound) => ({
        ...compound,
        configurations: (compound.configurations ?? []).flatMap((name) =>
          name === "one dev" ? apps.map((app) => `${app} dev`) : [name],
        ).filter((name) => names.has(name)),
      }))
      .filter((compound) => compound.configurations.length > 0);
    if (!json.compounds.length) delete json.compounds;
  }
}
if (Array.isArray(json.tasks)) json.tasks = multiply(json.tasks);
fs.writeFileSync(file, `${JSON.stringify(json, null, 2)}\n`);
NODE
done

[ -n "$PROJECT_NAME" ] || PROJECT_NAME="$(basename "$(cd "$TARGET" 2>/dev/null && pwd || printf '%s' "$TARGET")")"
node - "$TREE/package.json" "$PROJECT_NAME" "$APPS_CSV" "$REMOVED_CSV" "$(printf '%s' "$REMOVED" | tr ' ' ',')" <<'NODE'
const fs = require("node:fs");
const [file, projectName, appsCsv, removedCsv, prunedCsv] = process.argv.slice(2);
const apps = appsCsv ? appsCsv.split(",") : [];
const removed = removedCsv ? removedCsv.split(",") : [];
const pruned = prunedCsv ? prunedCsv.split(",") : [];
const pkg = JSON.parse(fs.readFileSync(file, "utf8"));
pkg.name = projectName;
// A root patch can name a package a project never installs. Every versioned
// patch is pinned by an exact override, so an unused one cannot hide drift.
if (pkg.pnpm?.patchedDependencies) {
  pkg.pnpm = Object.fromEntries(
    Object.entries(pkg.pnpm).flatMap((entry) =>
      entry[0] === "patchedDependencies" ? [entry, ["allowUnusedPatches", true]] : [entry],
    ),
  );
}
// A script whose command lives in a removed tree goes with it; a chained
// script keeps the segments that still resolve, minus ignore patterns that
// named removed trees.
const removedTree = /^(node|tsx|sh|bash)\s+(public|docs|deploy|agent-os|\.changeset)\//;
const dropSegment = (segment) =>
  removedTree.test(segment) ||
  /^(changeset|typedoc)(\s|$)/.test(segment) ||
  segment.includes("generate-tamagui-workspace-paths");
const namesPruned = (pattern) =>
  pruned.some((tree) => pattern.startsWith(`${tree}/`) || pattern.includes(`/${tree}/`));
const cleanSegment = (segment) =>
  segment.replace(/\s--ignore-pattern\s+'([^']*)'/g, (whole, pattern) =>
    namesPruned(pattern) ? "" : whole,
  );
const scripts = {};
for (const [name, value] of Object.entries(pkg.scripts ?? {})) {
  if (/^(docs|docs:watch|changeset|changeset:publish|generate:tamagui-paths|prepare)$/.test(name)) continue;
  // verify:lc audits the catalog in public/ against the rulebook in docs/.
  if (name === "verify:lc" && (pruned.includes("public") || pruned.includes("docs"))) continue;
  const kept = value.split(" && ").filter((segment) => !dropSegment(segment)).map(cleanSegment);
  if (!kept.length) continue;
  scripts[name] = kept.join(" && ");
}
// Chains that ran a script dropped above lose that call too.
for (const [name, value] of Object.entries(scripts)) {
  const kept = value
    .split(" && ")
    .filter((segment) => {
      const match = segment.match(/^pnpm\s+([\w:.-]+)$/);
      return !match || match[1] in scripts;
    });
  if (kept.length) scripts[name] = kept.join(" && ");
  else delete scripts[name];
}
if (typeof scripts.dev === "string" && /--filter=one\b/.test(scripts.dev)) {
  if (!apps.length) {
    delete scripts.dev;
  } else {
    scripts.dev = `pnpm --filter @app/${apps[0]} dev`;
    if (apps.length > 1) for (const app of apps) scripts[`dev:${app}`] = `pnpm --filter @app/${app} dev`;
  }
}
for (const name of Object.keys(scripts)) {
  if (removed.some((app) => scripts[name].includes(`apps/${app}`) || scripts[name].includes(`@platform/${app}`))) {
    delete scripts[name];
  }
}
pkg.scripts = scripts;
if (pruned.includes("public") && pkg.pnpm?.patchedDependencies) {
  for (const [name, patch] of Object.entries(pkg.pnpm.patchedDependencies)) {
    if (patch.startsWith("patches/public/")) delete pkg.pnpm.patchedDependencies[name];
  }
}
fs.writeFileSync(file, `${JSON.stringify(pkg, null, 2)}\n`);
NODE

# From MPO-367 (pnpm 11) the patches live in pnpm-workspace.yaml, which gets
# the same two edits the package.json `pnpm` field gets above.
if [ -f "$TREE/pnpm-workspace.yaml" ]; then
    node - "$TREE/pnpm-workspace.yaml" "$(printf '%s' "$REMOVED" | tr ' ' ',')" <<'NODE'
const fs = require("node:fs");
const [file, prunedCsv] = process.argv.slice(2);
const pruned = prunedCsv ? prunedCsv.split(",") : [];
const lines = fs.readFileSync(file, "utf8").split("\n");
const start = lines.findIndex((line) => /^patchedDependencies:\s*$/.test(line));
if (start < 0) process.exit(0);
let end = start + 1;
while (end < lines.length && /^\s+\S/.test(lines[end])) end++;
const entries = lines
  .slice(start + 1, end)
  .filter((line) => !(pruned.includes("public") && /:\s*["']?patches\/public\//.test(line)));
const block = entries.length ? ["patchedDependencies:", ...entries] : [];
if (!lines.some((line) => /^allowUnusedPatches:/.test(line))) block.unshift("allowUnusedPatches: true");
lines.splice(start, end - start, ...block);
fs.writeFileSync(file, lines.join("\n"));
NODE
fi

# ── 5. the published packages come from the registry now ─────────────────

# workspace:* / workspace:^ / workspace:~ on @repo/* become the
# semver range; @package/* and other private workspace deps stay workspace:.
for _file in $(grep_files "$TREE" -e '"@multiplatform\.one/[^"]*": *"workspace:' --include=package.json); do
    sed_file "$_file" "s|\\(\"@multiplatform\\.one/[^\"]*\": *\"\\)workspace:\\*\"|\\1$MPO_VERSION\"|
s|\\(\"@multiplatform\\.one/[^\"]*\": *\"\\)workspace:^\"|\\1^$CLI_VERSION\"|
s|\\(\"@multiplatform\\.one/[^\"]*\": *\"\\)workspace:~\"|\\1~$CLI_VERSION\"|"
done

if [ -f "$TREE/pnpm-workspace.yaml" ]; then
    _ws='/^[[:space:]]*-[[:space:]]*["'"'"']\{0,1\}public\/\*["'"'"']\{0,1\}[[:space:]]*$/d'
    if [ ! -d "$TREE/apps" ] || [ -z "$(ls -A "$TREE/apps")" ]; then
        _ws="$_ws
/^[[:space:]]*-[[:space:]]*[\"']\\{0,1\\}apps\\/\\*[\"']\\{0,1\\}[[:space:]]*\$/d"
    fi
    if [ ! -d "$TREE/packages" ] || [ -z "$(ls -A "$TREE/packages")" ]; then
        _ws="$_ws
/^[[:space:]]*-[[:space:]]*[\"']\\{0,1\\}packages\\/\\*[\"']\\{0,1\\}[[:space:]]*\$/d"
    fi
    sed_file "$TREE/pnpm-workspace.yaml" "$_ws"
fi

# tsconfig project references into public/ and the tsconfig.base.json that
# extended public/config directly: the published @repo/config
# ships the same tsconfig/base.json.
for _file in $(grep_files "$TREE" -e '"path": *"\./public/' -e '"path": *"\.\./public/' -e '"path": *"\.\./\.\./public/' --include='tsconfig*.json'); do
    node - "$_file" <<'NODE'
const fs = require("node:fs");
const [file] = process.argv.slice(2);
const raw = fs.readFileSync(file, "utf8");
// tsconfig files carry full-line comments; a "//" inside a string (the
// $schema url) is not one, so only whole comment lines are stripped.
const json = JSON.parse(raw.replace(/^\s*\/\/[^\n]*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, ""));
if (Array.isArray(json.references)) {
  json.references = json.references.filter((ref) => !/(^|\/)public\//.test(ref.path));
}
fs.writeFileSync(file, `${JSON.stringify(json, null, 2)}\n`);
NODE
done
if [ -f "$TREE/tsconfig.base.json" ] && grep -q 'public/config/tsconfig' "$TREE/tsconfig.base.json"; then
    node - "$TREE/tsconfig.base.json" <<'NODE'
const fs = require("node:fs");
const [file] = process.argv.slice(2);
const raw = fs.readFileSync(file, "utf8");
// tsconfig files carry full-line comments; a "//" inside a string (the
// $schema url) is not one, so only whole comment lines are stripped.
const json = JSON.parse(raw.replace(/^\s*\/\/[^\n]*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, ""));
const extendsList = Array.isArray(json.extends) ? json.extends : json.extends ? [json.extends] : [];
json.extends = extendsList
  .filter((entry) => !entry.includes("tamagui-workspace-paths.generated"))
  .map((entry) => entry.replace(/^\.\/public\/config\/tsconfig\//, "@repo/config/tsconfig/"));
if (json.extends.length === 1) json.extends = json.extends[0];
fs.writeFileSync(file, `${JSON.stringify(json, null, 2)}\n`);
NODE
fi

# Stories are apps/storybook's input and import its framework, which only
# apps/storybook declares; without it the features program leaves them out.
case " $REMOVED_APPS " in
*" storybook "*)
    if [ -f "$TREE/features/tsconfig.json" ]; then
        sed_file "$TREE/features/tsconfig.json" 's|"exclude": \["node_modules"\]|"exclude": ["node_modules", "**/*.stories.tsx"]|'
    fi
    ;;
esac

# ── 6. provenance ────────────────────────────────────────────────────────

node - "$TREE/.mpo.json" "$CLI_VERSION" "$SHA" "$SOURCE_URL" "$APPS_CSV" "$(printf '%s' "$SERVICES" | tr ' ' ',')" <<'NODE'
const fs = require("node:fs");
const [file, cliVersion, sha, url, appsCsv, servicesCsv] = process.argv.slice(2);
const provenance = {
  cliVersion,
  source: url ? { sha, url } : { sha },
  apps: appsCsv ? appsCsv.split(",") : [],
  services: servicesCsv ? servicesCsv.split(",").sort() : [],
  pieces: [],
};
fs.writeFileSync(file, `${JSON.stringify(provenance, null, 2)}\n`);
NODE

# ── 7. --into: lay the tree over an existing directory ───────────────────

SKIPPED=""
if [ "$INTO" -eq 1 ]; then
    mkdir -p "$TARGET"
    _list="$WORK/files"
    (cd "$TREE" && find . -type f -o -type l) | sed 's|^\./||' | sort >"$_list"
    while IFS= read -r _rel; do
        if [ -e "$TARGET/$_rel" ] || [ -L "$TARGET/$_rel" ]; then
            SKIPPED="$SKIPPED $_rel"
            printf 'skipped (exists): %s\n' "$_rel"
            continue
        fi
        mkdir -p "$(dirname "$TARGET/$_rel")"
        cp -P "$TREE/$_rel" "$TARGET/$_rel"
    done <"$_list"
    if [ -n "$SKIPPED" ]; then
        {
            [ -f "$TARGET/.updateignore" ] && [ -n "$(tail -c 1 "$TARGET/.updateignore")" ] && printf '\n'
            printf '# scaffold --into: these paths existed before the scaffold and are yours\n'
            for _rel in $SKIPPED; do printf '%s\n' "$_rel"; done
        } >>"$TARGET/.updateignore"
    fi
fi

# ── 8. report ────────────────────────────────────────────────────────────

printf 'scaffold: %s\n' "$TARGET"
printf '  source    %s @ %s\n' "$SOURCE" "$SHA"
printf '  apps      %s\n' "${APPS:-(none)}"
printf '  services  %s\n' "${SERVICES:-(none)}"
printf '  packages  @repo/* %s\n' "$MPO_VERSION"
printf '  removed   %s\n' "${REMOVED# }"
if [ -n "$SKIPPED" ]; then
    printf '  skipped   %s (pinned in .updateignore)\n' "$(printf '%s' "${SKIPPED# }" | wc -w | tr -d ' ') existing paths"
fi
