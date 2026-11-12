#!/bin/sh
set -u
cd "$(dirname "$0")"
compose="docker compose -f docker-compose.yml"
fake_rtpengine="udp:172.30.0.50:22222"
bad_rtpengine="tcp:172.30.0.50:22222"

logged() {
    tries=0
    until $compose logs --no-log-prefix "$1" 2>/dev/null | grep -qF "$2"; do
        tries=$((tries + 1))
        if [ "$tries" -ge 20 ]; then echo "$MODE: $1 never logged: $2"; return 1; fi
        sleep 1
    done
}

rtpengine_used() {
    if [ "${RTPENGINE_SOCK:-}" = "$fake_rtpengine" ]; then
        logged rtpengine "ng ping from 172.30.0.10" && logged rtpengine "ng delete from 172.30.0.10" || return 1
        if $compose logs --no-log-prefix kamailio 2>/dev/null | grep -q "proxy did not respond to ping"; then echo "$MODE: kamailio did not reach the fake rtpengine"; return 1; fi
    else
        if [ "${RTPENGINE_SOCK:-}" = "$bad_rtpengine" ]; then logged kamailio "RTPENGINE_SOCK=$bad_rtpengine is not udp:<ip>:<port>" || return 1; fi
        logged kamailio "RTPEngine <udp:172.28.0.1:22222>"
    fi
}

run_mode() {
    export MODE="$1" CARRIER_SCENARIO="$2"
    services="cabinet kamailio carrier"
    if [ "$MODE" = "rtpengine" ]; then
        export RTPENGINE_SOCK="$fake_rtpengine"
        services="$services rtpengine"
    elif [ "$MODE" = "badsock" ]; then
        export RTPENGINE_SOCK="$bad_rtpengine"
    else
        unset RTPENGINE_SOCK
    fi
    $compose down -v --remove-orphans >/dev/null 2>&1
    $compose up -d $services >/dev/null
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
    rtpengine_used
    rtp=$?
    [ "${KEEP:-}" = "1" ] || $compose down -v --remove-orphans >/dev/null 2>&1
    echo "$1: platform exit=$uac carrier exit=$carrier rtpengine check=$rtp"
    [ "$uac" = "0" ] && [ "$carrier" = "0" ] && [ "$rtp" = "0" ]
}

status=0
for mode in ${MODES:-ipauth digest rtpengine badsock}; do
    case "$mode" in
        digest) run_mode digest uas-digest.xml || status=1 ;;
        rtpengine) run_mode rtpengine uas.xml || status=1 ;;
        badsock) run_mode badsock uas.xml || status=1 ;;
        *) run_mode ipauth uas.xml || status=1 ;;
    esac
done
exit $status
