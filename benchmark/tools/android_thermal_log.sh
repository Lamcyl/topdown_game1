#!/usr/bin/env bash
# Logs an Android phone's temperatures and battery over adb into a CSV while a benchmark runs.
# Neither Godot nor the browser can read phone temperature, so this is how heat gets measured
# for both builds the same way.
#
# Usage: ./android_thermal_log.sh [out.csv]      (INTERVAL=10 by default, Ctrl+C to stop)
# Use wireless debugging so a USB cable isn't charging (and warming) the phone during the test.
set -euo pipefail

OUT="${1:-thermal_$(date +%Y%m%d_%H%M%S).csv}"
INTERVAL="${INTERVAL:-10}"

adb get-state >/dev/null || { echo "No device found: check 'adb devices'." >&2; exit 1; }

# Highest value among HAL temperatures of one type (0=CPU, 1=GPU, 3=SKIN), or empty.
hal_max() {
  awk -v want="$2" '
    /Current temperatures from HAL/ { inside = 1; next }
    inside && /^[^ \t]/ { inside = 0 }
    inside && /Temperature\{/ {
      if (!match($0, /mType=[0-9]+/)) next
      type = substr($0, RSTART + 6, RLENGTH - 6)
      if (type != want || !match($0, /mValue=[-0-9.]+/)) next
      v = substr($0, RSTART + 7, RLENGTH - 7) + 0
      if (!seen || v > max) { max = v; seen = 1 }
    }
    END { if (seen) printf "%.1f", max }
  ' <<<"$1"
}

echo "time_s,battery_temp_c,battery_pct,current_ua,thermal_status,skin_c,cpu_max_c,gpu_max_c" | tee "$OUT"
start=$(date +%s)
while true; do
  t=$(( $(date +%s) - start ))
  batt=$(adb shell dumpsys battery | tr -d '\r')
  thermal=$(adb shell dumpsys thermalservice | tr -d '\r')
  temp=$(awk -F': ' '/^ *temperature:/ { printf "%.1f", $2 / 10 }' <<<"$batt")
  level=$(awk -F': ' '/^ *level:/ { print $2 }' <<<"$batt")
  # Not readable on every phone; left blank when it isn't.
  current=$(adb shell cat /sys/class/power_supply/battery/current_now 2>/dev/null | tr -d '\r' | grep -E '^-?[0-9]+$' || true)
  status=$(awk -F': ' '/Thermal Status:/ { print $2; exit }' <<<"$thermal")
  line="$t,$temp,$level,$current,$status,$(hal_max "$thermal" 3),$(hal_max "$thermal" 0),$(hal_max "$thermal" 1)"
  echo "$line" | tee -a "$OUT"
  sleep "$INTERVAL"
done
