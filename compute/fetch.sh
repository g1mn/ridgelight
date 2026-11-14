#!/usr/bin/env bash
# Download the public data listed in manifest.json into $LW_DATA (default ~/nasa-lunar-data).
#   bash fetch.sh <group> [<group> ...]   groups: naif lola_dem lola_illum lroc_ill lroc_movie_south
#   bash fetch.sh sums                    write SHA256SUMS (relative paths) for every file under $LW_DATA
# Rules: only fetch_default files; skip if size already matches; curl resume; any size mismatch = exit 1;
# md5 from the official LROC labels is checked where the manifest has one.
set -euo pipefail
cd "$(dirname "$0")"
ROOT="${LW_DATA:-$HOME/nasa-lunar-data}"
mkdir -p "$ROOT"
if [ "${1:-}" = "sums" ]; then
  cd "$ROOT"
  find . -type f ! -name 'SHA256SUMS*' | sed 's|^\./||' | sort | xargs -d '\n' sha256sum > SHA256SUMS.tmp
  mv SHA256SUMS.tmp SHA256SUMS
  echo "SHA256SUMS lines: $(wc -l < SHA256SUMS)"
  sha256sum -c SHA256SUMS | grep -vc ': OK$' || true
  exit 0
fi
[ $# -ge 1 ] || { echo "usage: fetch.sh <group>... | sums" >&2; exit 64; }
python3 -I - "$@" > .fetch-list.tsv <<'PY'
import json, sys
m = json.load(open("manifest.json"))
g = set(sys.argv[1:])
for f in m["files"]:
    if f["group"] in g and f.get("fetch_default"):
        print(f["server_path"].replace("~/nasa-lunar-data/", ""), f["bytes"], f["url"], f.get("md5_from_label") or "-", sep="\t")
PY
n=0; got=0
while IFS=$'\t' read -r rel bytes url md5; do
  n=$((n+1)); dst="$ROOT/$rel"; mkdir -p "$(dirname "$dst")"
  if [ -f "$dst" ] && [ "$(stat -c %s "$dst")" = "$bytes" ]; then :; else
    curl --fail -sS -L --retry 3 --retry-delay 5 --connect-timeout 30 -C - -o "$dst" "$url"
    got=$((got+1))
  fi
  sz=$(stat -c %s "$dst")
  if [ "$sz" != "$bytes" ]; then echo "SIZE MISMATCH $rel: got $sz expected $bytes" >&2; exit 1; fi
  if [ "$md5" != "-" ]; then
    h=$(md5sum "$dst" | cut -d' ' -f1)
    if [ "$h" != "$md5" ]; then echo "MD5 MISMATCH $rel: got $h expected $md5" >&2; exit 1; fi
  fi
done < .fetch-list.tsv
echo "groups $* : $n files listed, $got downloaded now, all sizes match"
