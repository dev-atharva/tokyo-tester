#!/usr/bin/env bash

set -Eeuo pipefail

root_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
source_dir="$root_dir/.agents/skills/tokyo-tester"
output_dir="$root_dir/ui-v2/public/downloads"
output_file="$output_dir/tokyo-tester-skill.tar.gz"

[ -f "$source_dir/SKILL.md" ] || {
  printf 'package-skill: missing %s/SKILL.md\n' "$source_dir" >&2
  exit 1
}

python3 "$source_dir/scripts/test_inspect_repository.py"

mkdir -p "$output_dir"
temporary_file=$(mktemp "$output_dir/.tokyo-tester-skill.XXXXXX")
cleanup() {
  rm -f "$temporary_file"
}
trap cleanup EXIT

tar -czf "$temporary_file" -C "$(dirname "$source_dir")" "$(basename "$source_dir")"
mv "$temporary_file" "$output_file"
trap - EXIT
printf 'package-skill: wrote %s\n' "$output_file"
