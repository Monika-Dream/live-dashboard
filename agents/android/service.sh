#!/system/bin/sh
# Live Dashboard Agent — Magisk service script
# Runs as root at boot via Magisk's service.d mechanism

MODDIR="${0%/*}"
LOG="$MODDIR/agent.log"
CONFIG="$MODDIR/config.sh"

# ---------------------------------------------------------------------------
# Logging (auto-rotate at 100KB)
# ---------------------------------------------------------------------------
log() {
    local ts
    ts=$(date '+%Y-%m-%d %H:%M:%S')
    echo "[$ts] $1" >> "$LOG"
    # Rotate if > 100KB
    local size
    size=$(stat -c%s "$LOG" 2>/dev/null || echo 0)
    if [ "$size" -gt 102400 ] 2>/dev/null; then
        tail -n 200 "$LOG" > "$LOG.tmp"
        mv "$LOG.tmp" "$LOG"
    fi
}

# ---------------------------------------------------------------------------
# Load & validate config
# ---------------------------------------------------------------------------
if [ ! -f "$CONFIG" ]; then
    log "ERROR: config.sh not found at $CONFIG"
    exit 1
fi
. "$CONFIG"

if [ -z "$SERVER_URL" ] || [ -z "$TOKEN" ] || [ "$TOKEN" = "YOUR_TOKEN_HERE" ]; then
    log "ERROR: SERVER_URL or TOKEN not configured"
    exit 1
fi

# Validate URL scheme
case "$SERVER_URL" in
    http://*|https://*) ;;
    *) log "ERROR: SERVER_URL must start with http:// or https:// (got $SERVER_URL)"; exit 1 ;;
esac

# Validate numeric fields (returns validated value via stdout)
validated_int() {
    local val="$1" name="$2" lo="$3" hi="$4" default="$5"
    case "$val" in
        ''|*[!0-9]*) log "WARN: $name invalid ($val), using $default"; echo "$default"; return ;;
    esac
    if [ "$val" -lt "$lo" ] || [ "$val" -gt "$hi" ]; then
        log "WARN: $name out of range ($val), using $default"
        echo "$default"
    else
        echo "$val"
    fi
}
INTERVAL=$(validated_int "$INTERVAL" "INTERVAL" 1 300 5)
HEARTBEAT=$(validated_int "$HEARTBEAT" "HEARTBEAT" 10 600 60)

ENDPOINT="${SERVER_URL%/}/api/report"

# ---------------------------------------------------------------------------
# Wait for boot to complete
# ---------------------------------------------------------------------------
while [ "$(getprop sys.boot_completed)" != "1" ]; do
    sleep 2
done
sleep 10  # extra settle time
log "Agent started — interval=${INTERVAL}s heartbeat=${HEARTBEAT}s"

# ---------------------------------------------------------------------------
# Helper: get foreground app package name
# ---------------------------------------------------------------------------
get_foreground_app() {
    dumpsys activity activities 2>/dev/null \
        | grep -m1 'mResumedActivity' \
        | sed 's/.*u0 \(.*\)\/.*/\1/' \
        | sed 's/.*{[^ ]* [^ ]* \([^ ]*\)\/.*/\1/' \
        | head -1
}

# ---------------------------------------------------------------------------
# Helper: get current media title (e.g. video/music playing)
# ---------------------------------------------------------------------------
get_media_title() {
    dumpsys media_session 2>/dev/null \
        | grep -A1 'metadata:' \
        | grep 'description=' \
        | head -1 \
        | sed 's/.*description=\(.*\)/\1/' \
        | sed 's/,.*$//' \
        | head -c 256
}

# ---------------------------------------------------------------------------
# Helper: check if screen is on
# ---------------------------------------------------------------------------
is_screen_on() {
    local state
    state=$(dumpsys display 2>/dev/null | grep 'mScreenState' | head -1)
    case "$state" in
        *ON*) return 0 ;;
        *) return 1 ;;
    esac
}

# ---------------------------------------------------------------------------
# Helper: escape a string for safe JSON embedding
# Strips control characters, escapes backslash and quote.
# Truncation happens before escaping to avoid cutting mid-sequence.
# ---------------------------------------------------------------------------
json_escape() {
    printf '%s' "$1" \
        | tr -d '\000-\037' \
        | cut -c1-256 \
        | sed 's/\\/\\\\/g; s/"/\\"/g'
}

# ---------------------------------------------------------------------------
# Helper: send report
# ---------------------------------------------------------------------------
send_report() {
    local app_id title ts body http_code
    app_id=$(json_escape "$1")
    title=$(json_escape "$2")
    ts=$(date +%s)000
    body="{\"app_id\":\"$app_id\",\"window_title\":\"$title\",\"timestamp\":$ts}"

    local http_code
    http_code=$(curl -s -o /dev/null -w '%{http_code}' \
        -X POST \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer $TOKEN" \
        --max-time 10 \
        -d "$body" \
        "$ENDPOINT" 2>/dev/null)

    case "$http_code" in
        200|201|409) return 0 ;;
        *) log "WARN: report failed (HTTP $http_code) for $app_id"; return 1 ;;
    esac
}

# ---------------------------------------------------------------------------
# Main loop
# ---------------------------------------------------------------------------
prev_app=""
prev_title=""
last_report=0

while true; do
    # Skip reporting when screen is off (save battery)
    if ! is_screen_on; then
        sleep "$INTERVAL"
        continue
    fi

    app_id=$(get_foreground_app)
    if [ -z "$app_id" ]; then
        sleep "$INTERVAL"
        continue
    fi

    media_title=$(get_media_title)
    # Use media title if available, otherwise just the package name
    if [ -n "$media_title" ]; then
        title="$media_title"
    else
        title="$app_id"
    fi

    now=$(date +%s)
    changed=0
    if [ "$app_id" != "$prev_app" ] || [ "$title" != "$prev_title" ]; then
        changed=1
    fi

    heartbeat_due=0
    elapsed=$((now - last_report))
    if [ "$elapsed" -ge "$HEARTBEAT" ]; then
        heartbeat_due=1
    fi

    if [ "$changed" -eq 1 ] || [ "$heartbeat_due" -eq 1 ]; then
        if send_report "$app_id" "$title"; then
            prev_app="$app_id"
            prev_title="$title"
            last_report=$now
            if [ "$changed" -eq 1 ]; then
                log "Reported: $app_id — $(echo "$title" | head -c 80)"
            fi
        fi
    fi

    sleep "$INTERVAL"
done
