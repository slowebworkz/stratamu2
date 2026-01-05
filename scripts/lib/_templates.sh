#!/usr/bin/env bash

# -----------------------------------------------------------------------------
# Template Utility Functions for Workspace/Package Generation
# -----------------------------------------------------------------------------
# Requires: _validation.sh (validate, error, etc.), _helpers.sh (path utils)
source "$(dirname "$0")/lib/_validation.sh"
source "$(dirname "$0")/lib/_helpers.sh"

# -----------------------------------------------------------------------------
# Package.json Helper Functions
# -----------------------------------------------------------------------------

# Add basic metadata to JSON
add_pkg_metadata() {
  local json="$1"
  local pkg_id="$2"
  echo "$json" | jq --arg name "$pkg_id" '
    . + {
      "name": $name,
      "version": "0.1.0",
      "type": "module"
    }
  '
}

# Add main and types fields
add_pkg_entry_points() {
  local json="$1"
  local build_dir="$2"
  local main_ext="$3"
  local types_ext="$4"
  echo "$json" | jq --arg main "${build_dir}index${main_ext}" \
                      --arg types "${build_dir}index${types_ext}" '
    . + {
      "main": $main,
      "types": $types
    }
  '
}

# Add exports field
add_pkg_exports() {
  local json="$1"
  local build_dir="$2"
  local main_ext="$3"
  local types_ext="$4"
  echo "$json" | jq --arg import "${build_dir}index${main_ext}" \
                      --arg types "${build_dir}index${types_ext}" '
    . + {
      "exports": {
        ".": {
          "import": $import,
          "default": $import,
          "types": $types
        }
      }
    }
  '
}

# Add base scripts
add_pkg_scripts() {
  local json="$1"
  local biome_config="../biome-config/biome.json"
  local biome_cmd="pnpm exec biome check . --config-path $biome_config"
  local tsc_cmd="tsc --project tsconfig.json"

  echo "$json" | jq --arg build_cmd "$tsc_cmd" \
                      --arg lint_cmd "$biome_cmd" \
                      --arg lint_fix_cmd "$biome_cmd --apply" \
                      --arg format_cmd "pnpm exec biome format . --config-path $biome_config --write" '
    . + {
      "scripts": {
        "build": $build_cmd,
        "clean": "rm -rf dist",
        "lint": $lint_cmd,
        "lint:fix": $lint_fix_cmd,
        "format": $format_cmd
      }
    }
  '
}

# Add devDependencies
add_pkg_dev_deps() {
  local json="$1"
  local ts_version="$2"
  local fest_version="$3"
  echo "$json" | jq --arg ts_version "$ts_version" \
                      --arg fest_version "$fest_version" '
    . + {
      "devDependencies": {
        "typescript": $ts_version,
        "type-fest": $fest_version
      }
    }
  '
}

# Add test and bench scripts (for non-types packages)
add_pkg_test_scripts() {
  local json="$1"
  local tsc_cmd="tsc --project tsconfig.json"
  local bench_build="$tsc_cmd --outDir dist && mkdir -p dist/bench || true"
  local vitest_cmd="vitest run --config ./tsconfig.test.json"

  echo "$json" | jq --arg test_cmd "$vitest_cmd" \
                      --arg bench_build "$bench_build" '
    .scripts.test = $test_cmd
    | .scripts["bench:build"] = $bench_build
    | .scripts["bench:run"] = "pnpm run bench:build && node ./dist/bench/run-bench.js"
    | .scripts["bench:check"] = "pnpm run bench:build && node ./dist/bench/check-regression.js"
    | .devDependencies.vitest = "^3.2.4"
  '
}

# -----------------------------------------------------------------------------
# Type-Only Detection
# -----------------------------------------------------------------------------
# Returns true if the package is types-only (by name convention).
is_types_only() {
  local pkg_id="$1"
  # Customize detection logic as needed
  [[ "$pkg_id" == *types* ]]
}

# -----------------------------------------------------------------------------
# Test Directory Generation
# -----------------------------------------------------------------------------
# Creates src/test/ for non-types-only packages.
create_test_dir_if_needed() {
  local pkg_dir="$1"
  local pkg_id="$2"
  if ! is_types_only "$pkg_id"; then
    mkdir -p "$pkg_dir/src/test"
  fi
}

# -----------------------------------------------------------------------------
# Vite Config Generation
# -----------------------------------------------------------------------------
# Creates a blank vite.config.ts for non-types-only packages.
create_vite_config_if_needed() {
  local pkg_dir="$1"
  local pkg_id="$2"
  if ! is_types_only "$pkg_id"; then
    cat >"$pkg_dir/vite.config.ts" <<EOF
// Vite config for $pkg_id
export default {}
EOF
  fi
}

# -----------------------------------------------------------------------------
# package.json Generation
# -----------------------------------------------------------------------------
# Creates a package.json file with build/lint scripts and devDependencies.
# Adds test script and vitest only for non-types-only packages.
# Args: pkg_dir, pkg_id, use_build (true/false)
create_package_json() {
  # Validate arguments
  validate "[[ -z \"${1:-}\" || -z \"${2:-}\" ]]" "Missing required arguments. Usage: $0 <pkg_dir> <pkg_id> <use_build>"

  local pkg_dir="$1"
  local pkg_id="$2"
  local use_build="${3:-true}"
  local pkg_json="$pkg_dir/package.json"

  validate "[ -f \"$pkg_json\" ]" "package.json already exists at $pkg_json"

  # Extract dependency versions from root
  local ts_version
  ts_version="$(jq -r '.devDependencies.typescript' "$BASE_DIR/package.json")"

  local fest_version
  fest_version="$(jq -r '.devDependencies["type-fest"]' "$BASE_DIR/package.json")"

  # Set paths and extensions based on build flag
  local build_dir main_ext types_ext
  if [[ "$use_build" == "true" ]]; then
    build_dir="./dist/"
    main_ext=".js"
    types_ext=".d.ts"
  else
    build_dir="./"
    main_ext=".ts"
    types_ext=".ts"
  fi

  # Build package.json using helper functions
  local json_data
  json_data=$(jq -n '{}')
  json_data=$(add_pkg_metadata "$json_data" "$pkg_id")
  json_data=$(add_pkg_entry_points "$json_data" "$build_dir" "$main_ext" "$types_ext")
  json_data=$(add_pkg_exports "$json_data" "$build_dir" "$main_ext" "$types_ext")
  json_data=$(add_pkg_scripts "$json_data")
  json_data=$(add_pkg_dev_deps "$json_data" "$ts_version" "$fest_version")

  # Add test scripts for non-types-only packages
  if ! is_types_only "$pkg_id"; then
    json_data=$(add_pkg_test_scripts "$json_data")
  fi

  # Write to file
  echo "$json_data" > "$pkg_json"
}

# -----------------------------------------------------------------------------
# tsconfig.json Generation
# -----------------------------------------------------------------------------
# Creates a tsconfig.json file with base config and extends injected.
create_tsconfig_json() {
  validate "[[ -z \"${1:-}\" ]]" "Missing required argument: package directory."

  local pkg_dir="$1"
  local tsconfig_path="$pkg_dir/tsconfig.paths.json"

  validate "[ -f \"$tsconfig_path\" ]" "tsconfig.json already exists at $tsconfig_path"

  # Write base tsconfig.json
  cat >"$tsconfig_path" <<EOF
{
  "compilerOptions": {
    "paths": {
      "@/*": ["src/*"]
    }
  }
}
EOF

  # Inject extends field using jq
  local extends_path
  extends_path=$(get_tsconfig_base_relative_path "$pkg_dir")

  jq --arg extends "$extends_path" '.extends = $extends' "$tsconfig_path" >"$tsconfig_path.tmp" && mv "$tsconfig_path.tmp" "$tsconfig_path"

  local tsconfig_path="$pkg_dir/tsconfig.json"

  validate "[ -f \"$tsconfig_path\" ]" "tsconfig.json already exists at $tsconfig_path"

  # Write base tsconfig.json
  cat >"$tsconfig_path" <<EOF
{
  "extends": "./tsconfig.paths.json",
  "compilerOptions": {
    "baseUrl": ".",
  },
  "include": ["**/*.ts"],
  "exclude": ["node_modules", "dist"]
}
EOF
}

# -----------------------------------------------------------------------------
# README.md Generation
# -----------------------------------------------------------------------------
# Creates a basic README.md for the package.
create_readme() {
  local pkg_dir="$1"
  local pkg_id="$2"
  cat >"$pkg_dir/README.md" <<EOF
# $pkg_id

This is the $pkg_id package generated by the workspace script.
EOF
}
