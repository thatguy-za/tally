#!/usr/bin/env bash
#
# Delete container versions in GHCR that nothing points at any more.
#
# Why this exists rather than actions/delete-package-versions:
#
#   Every build publishes an OCI *index* carrying the tags, plus two untagged
#   children — the image manifest and its provenance attestation. Those
#   children are load-bearing: delete them and the tagged image stops pulling.
#   `delete-only-untagged-versions: true` deletes exactly those, because it
#   only asks whether a version has tags, never whether something references
#   it. Pointed at this package it would break `latest`.
#
#   So this resolves every tagged index against the registry first, collects
#   the digests they reference, and only considers a version disposable when
#   it is untagged *and* unreferenced. Those only appear after a tagged
#   version is deleted, which is why there is no scheduled job: normal
#   releases never produce one.
#
# Needs: gh (authenticated with read:packages + delete:packages), jq, curl.
# Dry run by default; pass --delete to actually remove anything.
#
set -euo pipefail

OWNER="${OWNER:-thatguy-za}"
PKG="${PKG:-tally}"
DELETE=false
[ "${1:-}" = "--delete" ] && DELETE=true

command -v gh >/dev/null || { echo "gh is required" >&2; exit 1; }
command -v jq >/dev/null || { echo "jq is required" >&2; exit 1; }

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

bearer=$(curl -fsS -u "$OWNER:$(gh auth token)" \
  "https://ghcr.io/token?scope=repository:$OWNER/$PKG:pull&service=ghcr.io" | jq -r .token)

# every version, paginated
: > "$tmp/all.json"
for page in $(seq 1 20); do
  gh api "/user/packages/container/$PKG/versions?per_page=100&page=$page" > "$tmp/page.json"
  [ "$(jq length "$tmp/page.json")" = "0" ] && break
  jq -c '.[]' "$tmp/page.json" >> "$tmp/all.json"
done
echo "versions: $(wc -l < "$tmp/all.json" | tr -d ' ')"

# digests referenced as a child by anything still tagged — these must survive
: > "$tmp/referenced.txt"
while read -r digest; do
  curl -fsS -H "Authorization: Bearer $bearer" \
    -H "Accept: application/vnd.oci.image.index.v1+json,application/vnd.docker.distribution.manifest.list.v2+json" \
    "https://ghcr.io/v2/$OWNER/$PKG/manifests/$digest" \
    | jq -r '.manifests[]?.digest // empty' >> "$tmp/referenced.txt" || true
done < <(jq -r 'select(.metadata.container.tags | length > 0) | .name' "$tmp/all.json")
sort -u "$tmp/referenced.txt" -o "$tmp/referenced.txt"
echo "referenced by a tagged image: $(wc -l < "$tmp/referenced.txt" | tr -d ' ')"

jq -r 'select(.metadata.container.tags | length == 0) | "\(.id) \(.name)"' "$tmp/all.json" \
  | while read -r id digest; do
      grep -qx "$digest" "$tmp/referenced.txt" || echo "$id $digest"
    done > "$tmp/orphans.txt"

count=$(wc -l < "$tmp/orphans.txt" | tr -d ' ')
echo "orphans (untagged and unreferenced): $count"
[ "$count" = "0" ] && exit 0

if [ "$DELETE" != true ]; then
  cat "$tmp/orphans.txt"
  echo
  echo "dry run — re-run with --delete to remove these"
  exit 0
fi

while read -r id _; do
  gh api -X DELETE "/user/packages/container/$PKG/versions/$id" >/dev/null
  echo "deleted $id"
done < "$tmp/orphans.txt"
