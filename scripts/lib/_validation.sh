#!/usr/bin/env bash

error() {
  local condition="$1"
  local message="$2"
  if eval "$condition"; then
    echo "Error: $message" >&2
    exit 1
  fi
}

validate() {
  local condition="$1"
  local message="$2"
  if eval "$condition"; then
    error "true" "$message"
  fi
}

validate_args() {
  if [[ $# -lt 3 ]]; then
    usage
  fi
}

validate_area() {
  local VALID_AREAS=("packages" "apps")
  validate "[[ ! \" ${VALID_AREAS[*]} \" =~ \" $1 \" ]]" "area must be one of: ${VALID_AREAS[*]}"
}

validate_dir() {
  validate "[ -d \"$1\" ]" "directory already exists: $1"
}
