# -----------------------------------------------------------------------------
# Helper Utility Functions for Workspace/Package Generation
# -----------------------------------------------------------------------------
#!/usr/bin/env bash

usage() {
  echo "Usage: $0 <name> <area: packages|apps> <namespace>" >&2
  echo "Example: ./scripts/create-workspace.sh my-lib packages repo" >&2
  exit 1
}

# -----------------------------------------------------------------------------
# TypeScript Version Extraction
# -----------------------------------------------------------------------------
# Returns the TypeScript version from the given package.json file.
get_typescript_version() {
  jq -r '.devDependencies.typescript' "$1"
}

# -----------------------------------------------------------------------------
# Add TypeScript DevDependency
# -----------------------------------------------------------------------------
# Adds/updates the TypeScript version in the devDependencies of package.json.
add_typescript_dev_dependency() {
  local pkg_json="$1"
  local ts_version="$2"

  jq --arg ts_version "$ts_version" '.devDependencies.typescript = $ts_version' "$pkg_json" >"$pkg_json.tmp" && mv "$pkg_json.tmp" "$pkg_json"
}

# -----------------------------------------------------------------------------
# Relative Path to Base tsconfig
# -----------------------------------------------------------------------------
# Returns the relative path from a package directory to the base tsconfig.json.
get_tsconfig_base_relative_path() {
  local pkg_dir="$1"

  node -p "require('path').relative('$pkg_dir', '$BASE_DIR/packages/typescript-config/base.json')"
}
