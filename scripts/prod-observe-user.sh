#!/usr/bin/env bash

set -Eeuo pipefail

fail() {
  printf 'prod-observe-user: %s\n' "$1" >&2
  exit 1
}

command -v docker >/dev/null 2>&1 || fail "Docker is required"

users_file=${DOZZLE_USERS_FILE:-./.secrets/dozzle-users.yml}
username=${DOZZLE_ADMIN_USERNAME:-}
display_name=${DOZZLE_ADMIN_NAME:-}
email=${DOZZLE_ADMIN_EMAIL:-}
password=${DOZZLE_ADMIN_PASSWORD:-}

if [ -z "$username" ]; then
  read -r -p "Log administrator username [admin]: " username
  username=${username:-admin}
fi
if [ -z "$display_name" ]; then
  read -r -p "Display name [Tokyo Tester Admin]: " display_name
  display_name=${display_name:-Tokyo Tester Admin}
fi
if [ -z "$email" ]; then
  read -r -p "Email (optional): " email
fi
if [ -z "$password" ]; then
  read -r -s -p "Password: " password
  printf '\n'
  read -r -s -p "Confirm password: " password_confirmation
  printf '\n'
  [ "$password" = "$password_confirmation" ] || fail "passwords do not match"
fi

[ "${#password}" -ge 12 ] || fail "password must contain at least 12 characters"

if [ -e "$users_file" ]; then
  read -r -p "$users_file already exists. Replace it? [y/N]: " replace
  case "$replace" in
    y | Y | yes | YES) ;;
    *) fail "existing user file was left unchanged" ;;
  esac
fi

users_dir=$(dirname "$users_file")
mkdir -p "$users_dir"
temporary_file=$(mktemp "$users_dir/.dozzle-users.XXXXXX")
cleanup() {
  rm -f "$temporary_file"
}
trap cleanup EXIT

generate=(docker run --rm amir20/dozzle:v10.6.2 generate "$username" --password "$password" --name "$display_name")
if [ -n "$email" ]; then
  generate+=(--email "$email")
fi
"${generate[@]}" >"$temporary_file"
chmod 600 "$temporary_file"
mv "$temporary_file" "$users_file"
trap - EXIT

printf 'prod-observe-user: wrote bcrypt credentials to %s\n' "$users_file"
printf 'prod-observe-user: run make prod to apply the login configuration\n'
