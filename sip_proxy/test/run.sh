#!/bin/sh
set -u
cd "$(dirname "$0")"
compose="docker compose -f docker-compose.yml"

run_mode() {
    export MODE="$1" CARRIER_SCENARIO="$2"
    $compose down -v --remove-orphans >/dev/null 2>&1
    $compose up -d cabinet kamailio carrier >/dev/null
    tries=0
    until $compose logs kamailio 2>/dev/null | grep -q "SO_SNDBUF is finally"; do
        tries=$((tries + 1))
        if [ "$tries" -ge 30 ]; then echo "$1: kamailio did not start"; $compose down -v --remove-orphans >/dev/null 2>&1; return 1; fi
        sleep 1
    done
    $compose run --rm platform >/dev/null 2>&1
    uac=$?
    $compose wait carrier >/dev/null 2>&1
    carrier=$($compose ps -a --format "{{.ExitCode}}" carrier)
    $compose logs --no-log-prefix carrier | grep -o -E "Failed regexp match: looking in '[^']*'" | head -3
    [ "${KEEP:-}" = "1" ] || $compose down -v --remove-orphans >/dev/null 2>&1
    echo "$1: platform exit=$uac carrier exit=$carrier"
    [ "$uac" = "0" ] && [ "$carrier" = "0" ]
}

status=0
for mode in ${MODES:-ipauth digest}; do
    case "$mode" in
        digest) run_mode digest uas-digest.xml || status=1 ;;
        *) run_mode ipauth uas.xml || status=1 ;;
    esac
done
exit $status
