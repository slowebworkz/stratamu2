#!/usr/bin/env bash

set -euo pipefail

###############################################################################
# CONFIGURATION
###############################################################################

BASE_DIR="$(cd "$(dirname "$0")/.." && pwd)"
VALID_AREAS=("packages" "apps")

###############################################################################
# HELPERS
###############################################################################


usage() {
  echo "Usage: $0 <name> <area: packages|apps> <namespace>" >&2
  echo "Example: ./scripts/create-workspace.sh my-lib packages repo" >&2
  exit 1
}

# Extract typescript version from root package.json
get_typescript_version() {
  jq -r '.devDependencies.typescript' "$1"
}

# Add TypeScript devDependency to package.json
add_typescript_dev_dependency() {
  local pkg_json="$1"
  local ts_version="$2"
  jq --arg ts_version "$ts_version" '.devDependencies.typescript = $ts_version' "$pkg_json" > "$pkg_json.tmp" && mv "$pkg_json.tmp" "$pkg_json"
}

# Given a package directory, find the relative path to typescript-config/base.json
get_tsconfig_base_relative_path() {
  local pkg_dir="$1"
  node -p "require('path').relative('$pkg_dir', '$BASE_DIR/packages/typescript-config/base.json')"
}

###############################################################################
# ERROR HANDLING
###############################################################################

error() {
  local condition="$1"
  local message="$2"

  if eval "$condition"; then
    echo "Error: $message" >&2
    exit 1
  fi
}

###############################################################################
# VALIDATION
###############################################################################

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
  validate "[[ ! \" ${VALID_AREAS[*]} \" =~ \" $1 \" ]]" "area must be one of: ${VALID_AREAS[*]}"
}

validate_dir() {
  validate "[ -d \"$1\" ]" "directory already exists: $1"
}

###############################################################################
# PACKAGE.JSON TEMPLATE
###############################################################################

create_package_json() {
  # Error if $1 or $2 is missing
  validate "[[ -z \"${1:-}\" || -z \"${2:-}\" ]]" "Missing required arguments. Usage: $0 <name> <area: packages|apps> <namespace>"

  local pkg_dir="$1"
  local pkg_json="$pkg_dir/package.json"

  # Error if package.json already exists
  validate "[ -f \"$pkg_json\" ]" "package.json already exists at $pkg_json"

  local ts_version
  ts_version="$(jq -r '.devDependencies.typescript' "$BASE_DIR/package.json")"
  local fest_version
  fest_version="$(jq -r '.devDependencies["type-fest"]' "$BASE_DIR/package.json")"

  jq -n --arg pkg_id "$2" --arg ts_version "$ts_version" --arg fest_version "$fest_version" '
  {
    "name": $pkg_id,
    "version": "0.1.0",
    "type": "module",
    "main": "./dist/index.js",
    "types": "./dist/index.d.ts",
    "exports": {
      ".": {
        "import": "./dist/index.js",
        "default": "./dist/index.js",
        "types": "./dist/index.d.ts"
      }
    },
    "scripts": {
      "build": "tsc --project tsconfig.json"
    },
    "devDependencies": {
      "typescript": $ts_version,
      "type-fest": $fest_version
    }
  }
  ' > "$pkg_json"
}


# Create a tsconfig.json for a new package
create_tsconfig_json() {
  # Error if $1 is missing
  validate "[[ -z \"${1:-}\" ]]" "Missing required argument: package directory."

  local pkg_dir="$1"
  local tsconfig_path="$pkg_dir/tsconfig.json"

  # Error if tsconfig.json already exists
  validate "[ -f \"$tsconfig_path\" ]" "tsconfig.json already exists at $tsconfig_path"

  # Build initial JSON without extends
  cat > "$tsconfig_path" <<EOF
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  },
  "include": ["index.ts"],
  "exclude": ["node_modules", "dist"]
}
EOF

  # Inject extends field using jq
  local extends_path
  extends_path=$(get_tsconfig_base_relative_path "$pkg_dir")
  jq --arg extends "$extends_path" '.extends = $extends' "$tsconfig_path" > "$tsconfig_path.tmp" && mv "$tsconfig_path.tmp" "$tsconfig_path"
}

###############################################################################
# MAIN
###############################################################################

main() {
  validate_args "$@"

  local package_name="$1"
  local target_area="$2"
  local target_namespace="$3"

  validate_area "$target_area"

  local pkg_id="@${target_namespace}/${package_name}"
  local pkg_dir="${BASE_DIR}/${target_area}/${package_name}"

  echo "Creating workspace: $pkg_id at $pkg_dir"
  validate_dir "$pkg_dir"
  mkdir -p "$pkg_dir/src"
  touch "$pkg_dir/index.ts"

  create_tsconfig_json "$pkg_dir"
  create_package_json "$pkg_dir" "$pkg_id"

  echo "Workspace/package creation completed successfully."
}

main "$@"
