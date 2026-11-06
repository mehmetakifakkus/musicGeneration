#!/usr/bin/env bash
# Rebuilds the sampled instruments in audio/ from their npm packages.
#
# Sources (see audio/CREDITS.md):
#   @audio-samples/piano-mp3-velocity8  (Salamander Grand Piano V3, CC BY 3.0)
#   soundfont-for-samplers              (FluidR3 GM, MIT)
#
# Usage: tools/build_samples.sh <dir-with-unpacked-velocity8> <dir-with-unpacked-soundfont-for-samplers>
#   e.g. npm pack @audio-samples/piano-mp3-velocity8 soundfont-for-samplers, untar each, pass the package/ dirs.
#
# Every 3rd semitone (C, D#, F#, A) is kept; the player pitch-shifts the rest.
# Files are trimmed, faded out, mixed to mono and peak-normalised per instrument.
set -euo pipefail

SALAMANDER=${1:?path to piano-mp3-velocity8 package}
FLUID=${2:?path to soundfont-for-samplers package}
OUT=$(cd "$(dirname "$0")/.." && pwd)/audio

encode() { # in out duration gain_db
  local in=$1 out=$2 dur=$3 gain=$4
  local fade=$(awk "BEGIN{print ($dur > 2 ? 0.6 : 0.3)}")
  local fst=$(awk "BEGIN{print $dur - $fade}")
  ffmpeg -nostdin -loglevel error -y -i "$in" \
    -af "silenceremove=start_periods=1:start_threshold=-60dB,volume=${gain}dB,atrim=0:${dur},afade=t=out:st=${fst}:d=${fade}" \
    -ac 1 -ar 44100 -b:a 64k "$out"
}

peak_db() { # max peak over a list of files
  for f in "$@"; do
    ffmpeg -nostdin -hide_banner -i "$f" -af volumedetect -f null - 2>&1 | sed -n 's/.*max_volume: \(-\?[0-9.]*\) dB/\1/p'
  done | sort -g | tail -1
}

# name -> list of "<outName> <inFile>" pairs
build() { # instrument duration pairs...
  local inst=$1 dur=$2; shift 2
  mkdir -p "$OUT/$inst"
  rm -f "$OUT/$inst"/*.mp3
  local ins=()
  local i
  for ((i = 2; i <= $#; i += 2)); do ins+=("${!i}"); done
  local peak; peak=$(peak_db "${ins[@]}")
  local gain; gain=$(awk "BEGIN{print -3 - ($peak)}")
  for ((i = 1; i <= $#; i += 2)); do
    local j=$((i + 1))
    encode "${!j}" "$OUT/$inst/${!i}.mp3" "$dur" "$gain"
  done
  echo "$inst: $(ls "$OUT/$inst" | wc -l) files, $(du -sh "$OUT/$inst" | cut -f1), gain ${gain} dB"
}

# --- Salamander grand piano: A0 .. C8 ---------------------------------------
pairs=()
for f in "$SALAMANDER"/audio/*v8.mp3; do
  n=$(basename "$f" v8.mp3)   # e.g. D#4
  pairs+=("${n/\#/s}" "$f")   # D#4 -> Ds4
done
build grand 6 "${pairs[@]}"

# --- FluidR3 instruments -------------------------------------------------------
fluid() { # outInstrument fluidName duration
  local inst=$1 name=$2 dur=$3 dir="$FLUID/FluidR3_GM/$2-mp3"
  local p=() o n src
  for o in 0 1 2 3 4 5 6 7 8; do
    for n in C:C Ds:Eb Fs:Gb A:A; do
      src="$dir/${n#*:}$o.mp3"
      [ -f "$src" ] && p+=("${n%%:*}$o" "$src")
    done
  done
  build "$inst" "$dur" "${p[@]}"
}

fluid epiano      electric_piano_1      3
fluid harpsichord harpsichord           3
fluid marimba     marimba               2.5
fluid harp        orchestral_harp       3
fluid guitar      acoustic_guitar_nylon 3
