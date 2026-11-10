#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# ics-timesheet backend — API smoke test (curl + python3, no extra packages)
#
# Usage:
#   ./scripts/smoke_test.sh
#   BASE_URL=http://127.0.0.1:8080 \
#     ADMIN_NO=MG-0001 ADMIN_PASSWORD='ChangeMe123!' \
#     EMP_NO=MG-0002 EMP_PASSWORD='ChangeMe123!' ./scripts/smoke_test.sh
#
# Env knobs: BASE_URL, ADMIN_NO, ADMIN_PASSWORD, EMP_NO, EMP_PASSWORD, VERBOSE=1
#
# Covers: health, 401 on anonymous /auth/me, admin+employee login, /auth/me,
# /config, save today's 8h, read back day, month list, negative hours (400),
# single entry > 24h (400), daily total > 24h (400), admin user list, employee
# blocked from admin endpoints (403), xlsx export, anonymous feedback (201),
# admin feedback list, employee blocked from feedback list (403).
#
# Side effects (through the public API only): overwrites today's timesheet for
# EMP_NO with 8 hours and inserts one feedback row. The database is never
# touched directly.
# ---------------------------------------------------------------------------
set -uo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1:8080}"
BASE_URL="${BASE_URL%/}"
ADMIN_NO="${ADMIN_NO:-MG-0001}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-ChangeMe123!}"
EMP_NO="${EMP_NO:-MG-0002}"
EMP_PASSWORD="${EMP_PASSWORD:-ChangeMe123!}"

command -v curl >/dev/null 2>&1 || { printf 'curl is required\n' >&2; exit 1; }
command -v python3 >/dev/null 2>&1 || { printf 'python3 is required\n' >&2; exit 1; }

TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/ics-timesheet-smoke.XXXXXX")" || exit 1
trap 'rm -rf "$TMP_DIR"' EXIT

VERIFY="$TMP_DIR/verify.py"
cat >"$VERIFY" <<'PY'
# JSON / xlsx assertion helper used by smoke_test.sh.
import json
import sys

SAFE_BUILTINS = {
    "abs": abs, "all": all, "any": any, "bool": bool, "dict": dict,
    "float": float, "int": int, "isinstance": isinstance, "len": len,
    "list": list, "max": max, "min": min, "round": round, "str": str,
    "sum": sum, "tuple": tuple,
}


def fail(message, path=None):
    sys.stderr.write("%s\n" % message)
    if path:
        try:
            with open(path, "r", encoding="utf-8", errors="replace") as handle:
                sys.stderr.write(handle.read() + "\n")
        except OSError:
            pass
    sys.exit(1)


def load_json(path):
    try:
        with open(path, "r", encoding="utf-8", errors="replace") as handle:
            raw = handle.read()
    except OSError as exc:
        fail("cannot read response body %s: %s" % (path, exc))
    try:
        return json.loads(raw)
    except ValueError as exc:
        fail("response is not valid JSON: %s" % exc, path)


def evaluate(expr, data):
    # `data` lives in globals so generator expressions inside assertions resolve it.
    return eval(expr, {"__builtins__": SAFE_BUILTINS, "data": data})


def main(argv):
    if len(argv) < 2:
        fail("usage: verify.py <check|get|header|xlsx> ...")
    command = argv[1]

    if command == "check":
        path, want, got, expr = argv[2], argv[3], argv[4], argv[5]
        if got != want:
            fail("expected HTTP %s but got %s" % (want, got), path)
        if expr == "-":
            return 0
        payload = load_json(path)
        try:
            ok = evaluate(expr, payload)
        except Exception as exc:  # noqa: BLE001 - report any assertion error
            fail("cannot evaluate assertion %s: %s" % (expr, exc), path)
        if not ok:
            fail("assertion failed: %s" % expr, path)
        return 0

    if command == "get":
        path, expr = argv[2], argv[3]
        payload = load_json(path)
        try:
            value = evaluate(expr, payload)
        except Exception as exc:  # noqa: BLE001
            fail("cannot evaluate %s: %s" % (expr, exc), path)
        if not isinstance(value, (str, int, float, bool)):
            fail("value of %s is not a scalar" % expr, path)
        sys.stdout.write(str(value))
        return 0

    if command == "header":
        path, name, needle = argv[2], argv[3].lower(), argv[4].lower()
        try:
            with open(path, "r", encoding="utf-8", errors="replace") as handle:
                for line in handle:
                    if line.lower().startswith(name + ":"):
                        if needle in line.lower():
                            return 0
                        fail("header %s does not contain %r: %s" % (name, needle, line.strip()))
        except OSError as exc:
            fail("cannot read response headers %s: %s" % (path, exc))
        fail("response is missing the %s header" % name)

    if command == "xlsx":
        path, minimum = argv[2], int(argv[3])
        try:
            with open(path, "rb") as handle:
                raw = handle.read()
        except OSError as exc:
            fail("cannot read response body %s: %s" % (path, exc))
        if len(raw) < minimum:
            fail("xlsx response is only %d bytes (expected at least %d)" % (len(raw), minimum))
        if not raw.startswith(b"PK"):
            fail("xlsx response is missing the PK zip signature")
        return 0

    fail("unknown command: %s" % command)


if __name__ == "__main__":
    sys.exit(main(sys.argv))
PY

if [ -t 1 ]; then
  C_PASS=$'\033[32m'; C_FAIL=$'\033[31m'; C_DIM=$'\033[2m'; C_OFF=$'\033[0m'
else
  C_PASS=""; C_FAIL=""; C_DIM=""; C_OFF=""
fi

PASS_COUNT=0
REQ_SEQ=0
LAST_BODY=""
LAST_HEADERS=""
HTTP_STATUS=""
LAST_REQUEST=""
# Current backend deserializes LoginRequest as snake_case; keep camelCase as a
# fallback so the script survives either spelling.
LOGIN_FIELD="employee_no"

# --- helpers ---------------------------------------------------------------

jstr() {
  python3 -c 'import json,sys; sys.stdout.write(json.dumps(sys.argv[1], ensure_ascii=False))' "$1"
}

# payload key=<json literal> [key=<json literal> ...] -> JSON object on stdout
payload() {
  python3 - "$@" <<'PY'
import json
import sys

body = {}
for item in sys.argv[1:]:
    key, _, raw = item.partition("=")
    body[key] = json.loads(raw)
sys.stdout.write(json.dumps(body, ensure_ascii=False))
PY
}

pass() {
  PASS_COUNT=$((PASS_COUNT + 1))
  printf '%sPASS%s  %s\n' "$C_PASS" "$C_OFF" "$1"
}

report_fail() {
  {
    printf '\n%sFAIL%s  %s\n' "$C_FAIL" "$C_OFF" "$1"
    printf 'request: %s\n' "${LAST_REQUEST:-<none>}"
    printf 'status:  %s\n' "${HTTP_STATUS:-<none>}"
    if [ -n "$LAST_BODY" ] && [ -f "$LAST_BODY" ]; then
      printf -- '--- response body ---\n'
      if [ ! -s "$LAST_BODY" ]; then
        printf '(empty)\n'
      elif LC_ALL=C grep -Iq . "$LAST_BODY" 2>/dev/null; then
        cat "$LAST_BODY"
        printf '\n'
      else
        printf '(binary response, %s bytes)\n' "$(wc -c <"$LAST_BODY" | tr -d ' ')"
      fi
      printf -- '---------------------\n'
    fi
  } >&2
  exit 1
}

request() {
  local method="$1" path="$2" token="${3:-}" body="${4:-}"
  local curl_err
  REQ_SEQ=$((REQ_SEQ + 1))
  LAST_BODY="$TMP_DIR/body.$REQ_SEQ"
  LAST_HEADERS="$TMP_DIR/headers.$REQ_SEQ"
  curl_err="$TMP_DIR/curl.$REQ_SEQ"
  LAST_REQUEST="$method $path"
  local args=(-sS -o "$LAST_BODY" -D "$LAST_HEADERS" -X "$method" --max-time 20 -w '%{http_code}')
  if [ -n "$token" ]; then
    args+=(-H "Authorization: Bearer $token")
  fi
  if [ -n "$body" ]; then
    args+=(-H 'Content-Type: application/json' --data-binary "$body")
  fi
  if [ "${VERBOSE:-0}" = "1" ]; then
    printf '%s> %s %s%s\n' "$C_DIM" "$method" "$path" "$C_OFF" >&2
  fi
  if ! HTTP_STATUS=$(curl "${args[@]}" "$BASE_URL$path" 2>"$curl_err"); then
    HTTP_STATUS="000"
    printf '\n%sFAIL%s  %s — curl could not reach %s (is the API running?)\n' \
      "$C_FAIL" "$C_OFF" "$method $path" "$BASE_URL" >&2
    cat "$curl_err" >&2
    exit 1
  fi
}

check() {
  local desc="$1" want="$2" expr="${3:--}"
  if ! python3 "$VERIFY" check "$LAST_BODY" "$want" "$HTTP_STATUS" "$expr"; then
    report_fail "$desc"
  fi
  pass "$desc"
}

extract() {
  python3 "$VERIFY" get "$LAST_BODY" "$1"
}

# login <employeeNo> <password> — tries LOGIN_FIELD first; only retries the other
# spelling when the payload shape is rejected (400/422). A 401/403 means the
# field was understood, so it fails fast with the API's own error body.
login() {
  local no="$1" pw="$2" alt primary_status
  if [ "$LOGIN_FIELD" = "employee_no" ]; then
    alt="employeeNo"
  else
    alt="employee_no"
  fi

  request POST /api/auth/login "" "$(payload "$LOGIN_FIELD=$(jstr "$no")" "password=$(jstr "$pw")")"
  if [ "$HTTP_STATUS" = "200" ]; then
    return 0
  fi
  primary_status="$HTTP_STATUS"

  case "$primary_status" in
    400|422)
      request POST /api/auth/login "" "$(payload "$alt=$(jstr "$no")" "password=$(jstr "$pw")")"
      if [ "$HTTP_STATUS" = "200" ]; then
        printf '%snote: /api/auth/login accepts the "%s" payload field%s\n' "$C_DIM" "$alt" "$C_OFF"
        LOGIN_FIELD="$alt"
        return 0
      fi
      {
        printf '\n%sFAIL%s  login as %s (payload rejected with both field spellings)\n' "$C_FAIL" "$C_OFF" "$no"
        printf '  payload field "%s": HTTP %s\n' "$LOGIN_FIELD" "$primary_status"
        printf '  payload field "%s": HTTP %s\n' "$alt" "$HTTP_STATUS"
        printf -- '--- last response body ---\n'
        cat "$LAST_BODY"
        printf '\n'
      } >&2
      exit 1
      ;;
    *)
      report_fail "login as $no"
      ;;
  esac
}

# --- setup -----------------------------------------------------------------

TODAY=$(python3 - <<'PY'
from datetime import datetime, timedelta, timezone

now = datetime.now(timezone(timedelta(hours=8)))
print(now.strftime("%Y-%m-%d"))
PY
)
YEAR="${TODAY%%-*}"
MONTH="${TODAY#*-}"
MONTH="${MONTH%%-*}"
MONTH=$((10#$MONTH))

printf '%sics-timesheet API smoke test%s\n' "$C_DIM" "$C_OFF"
printf '  base:  %s\n' "$BASE_URL"
printf '  admin: %s\n' "$ADMIN_NO"
printf '  user:  %s\n' "$EMP_NO"
printf '  date:  %s (Asia/Shanghai)\n\n' "$TODAY"

# --- 1. health / auth guards ----------------------------------------------

request GET /api/health
check "health endpoint reports ok" 200 \
  'data.get("status") == "ok" and data.get("service") == "ics-timesheet-api"'

request GET /api/auth/me
check "anonymous /api/auth/me is rejected (401)" 401 \
  'data.get("code") == "UNAUTHORIZED"'

# --- 2. login + profile ----------------------------------------------------

login "$ADMIN_NO" "$ADMIN_PASSWORD"
check "admin login returns a token and SUPER_ADMIN user (field: $LOGIN_FIELD)" 200 \
  'isinstance(data.get("token"), str) and len(data["token"]) > 20 and data.get("user", {}).get("role") == "SUPER_ADMIN" and data["user"].get("active") is True'
ADMIN_TOKEN=$(extract 'data["token"]') || report_fail "admin login: read token"
ADMIN_EMPNO=$(extract 'data["user"]["employeeNo"]') || report_fail "admin login: read employeeNo"

request GET /api/auth/me "$ADMIN_TOKEN"
check "/api/auth/me returns the admin profile" 200 \
  'data.get("employeeNo") == '"$(jstr "$ADMIN_EMPNO")"' and data.get("role") == "SUPER_ADMIN"'

# --- 3. config -------------------------------------------------------------

request GET /api/config "$ADMIN_TOKEN"
check "/api/config exposes dimensions and locations" 200 \
  'all(isinstance(data.get(k), list) and len(data[k]) > 0 for k in ("businessLines", "products", "stages", "locations")) and all(isinstance(loc.get("code"), str) and loc["code"] for loc in data["locations"])'
LOCATION=$(extract 'data["locations"][0]["code"]') || report_fail "/api/config: read location code"
ACTIVITY=$(extract '"%s-%s-%s" % (data["businessLines"][0], data["products"][0], data["stages"][0])') \
  || report_fail "/api/config: build activity code"

login "$EMP_NO" "$EMP_PASSWORD"
check "employee login returns a token (field: $LOGIN_FIELD)" 200 \
  'isinstance(data.get("token"), str) and len(data["token"]) > 20 and isinstance(data.get("user", {}).get("role"), str)'
EMP_TOKEN=$(extract 'data["token"]') || report_fail "employee login: read token"
EMP_ROLE=$(extract 'data["user"]["role"]') || report_fail "employee login: read role"
if [ "$EMP_ROLE" = "SUPER_ADMIN" ]; then
  printf '%sFAIL%s  EMP_NO=%s is a SUPER_ADMIN; permission checks need a normal user\n' \
    "$C_FAIL" "$C_OFF" "$EMP_NO" >&2
  exit 1
fi

# --- 4. save today's 8 hours ----------------------------------------------

SAVE_ENTRIES=$(printf '[{"activityCode": %s, "hours": 6, "remark": %s}, {"activityCode": %s, "hours": 2, "remark": %s}]' \
  "$(jstr "$ACTIVITY")" "$(jstr "smoke-test")" "$(jstr "$ACTIVITY")" "$(jstr "smoke-test")")
SAVE_BODY=$(payload "location=$(jstr "$LOCATION")" "targetHours=8" "entries=$SAVE_ENTRIES")
request PUT "/api/timesheets/$TODAY" "$EMP_TOKEN" "$SAVE_BODY"
check "save 8 hours for today ($TODAY)" 200 \
  'abs(data["totalHours"] - 8) < 1e-6 and data.get("status") == "complete" and data.get("date") == '"$(jstr "$TODAY")"' and len(data.get("entries", [])) == 2 and abs(sum(e["hours"] for e in data["entries"]) - 8) < 1e-6 and all(e.get("remark") == "smoke-test" for e in data["entries"])'

request GET "/api/timesheets/$TODAY" "$EMP_TOKEN"
check "read back today's timesheet" 200 \
  'abs(data["totalHours"] - 8) < 1e-6 and data.get("location") == '"$(jstr "$LOCATION")"' and len(data.get("entries", [])) == 2'

request GET "/api/timesheets?year=$YEAR&month=$MONTH" "$EMP_TOKEN"
check "month list ($YEAR-$MONTH) contains today" 200 \
  'data.get("year") == '"$YEAR"' and data.get("month") == '"$MONTH"' and any(d.get("date") == '"$(jstr "$TODAY")"' for d in data.get("days", []))'

# --- 5. validation rejects ------------------------------------------------

NEG_BODY=$(payload "location=$(jstr "$LOCATION")" "targetHours=8" \
  "entries=$(printf '[{"activityCode": %s, "hours": -1}]' "$(jstr "$ACTIVITY")")")
request PUT "/api/timesheets/$TODAY" "$EMP_TOKEN" "$NEG_BODY"
check "negative hours rejected (400)" 400 \
  'data.get("code") == "BAD_REQUEST"'

HUGE_BODY=$(payload "location=$(jstr "$LOCATION")" "targetHours=8" \
  "entries=$(printf '[{"activityCode": %s, "hours": 25}]' "$(jstr "$ACTIVITY")")")
request PUT "/api/timesheets/$TODAY" "$EMP_TOKEN" "$HUGE_BODY"
check "single entry above 24h rejected (400)" 400 \
  'data.get("code") == "BAD_REQUEST"'

OVER_BODY=$(payload "location=$(jstr "$LOCATION")" "targetHours=8" \
  "entries=$(printf '[{"activityCode": %s, "hours": 20}, {"activityCode": %s, "hours": 6}]' "$(jstr "$ACTIVITY")" "$(jstr "$ACTIVITY")")")
request PUT "/api/timesheets/$TODAY" "$EMP_TOKEN" "$OVER_BODY"
check "daily total above 24h rejected (400)" 400 \
  'data.get("code") == "BAD_REQUEST" and "24" in data.get("message", "")'

# --- 6. admin permissions -------------------------------------------------

request GET /api/admin/users "$ADMIN_TOKEN"
check "admin can list users" 200 \
  'isinstance(data, list) and any(u.get("employeeNo") == '"$(jstr "$ADMIN_EMPNO")"' for u in data)'

request GET /api/admin/users "$EMP_TOKEN"
check "employee blocked from /api/admin/users (403)" 403 \
  'data.get("code") == "FORBIDDEN"'

# --- 7. xlsx export -------------------------------------------------------

request GET "/api/admin/export?year=$YEAR&month=$MONTH" "$ADMIN_TOKEN"
python3 "$VERIFY" check "$LAST_BODY" "200" "$HTTP_STATUS" "-" || report_fail "admin export failed"
python3 "$VERIFY" header "$LAST_HEADERS" "content-type" "spreadsheetml.sheet" \
  || report_fail "export content-type is not xlsx"
python3 "$VERIFY" xlsx "$LAST_BODY" 1000 || report_fail "export body is not a non-empty xlsx"
pass "admin export is a non-empty xlsx ($(wc -c <"$LAST_BODY" | tr -d ' ') bytes)"

# --- 8. anonymous feedback ------------------------------------------------

FEEDBACK_TEXT="smoke-test feedback $(date '+%Y-%m-%d %H:%M:%S') pid=$$"
FB_BODY=$(payload "content=$(jstr "$FEEDBACK_TEXT")")
request POST /api/feedback "" "$FB_BODY"
check "anonymous feedback accepted (201)" 201 \
  'data.get("status") == "open" and data.get("content") == '"$(jstr "$FEEDBACK_TEXT")"' and isinstance(data.get("id"), str) and bool(data.get("createdAt"))'
FB_ID=$(extract 'data["id"]') || report_fail "feedback: read id"

request GET /api/admin/feedback "$ADMIN_TOKEN"
check "admin feedback list shows the new item" 200 \
  'isinstance(data, list) and any(item.get("id") == '"$(jstr "$FB_ID")"' for item in data)'

request GET /api/admin/feedback "$EMP_TOKEN"
check "employee blocked from /api/admin/feedback (403)" 403 \
  'data.get("code") == "FORBIDDEN"'

# --- summary --------------------------------------------------------------

printf '\n  wrote: timesheet %s = 8h for %s, feedback id %s\n' "$TODAY" "$EMP_NO" "$FB_ID"
printf '%sAll %d checks passed%s (base: %s)\n' "$C_PASS" "$PASS_COUNT" "$C_OFF" "$BASE_URL"
exit 0
