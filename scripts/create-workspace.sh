#!/usr/bin/env bash

set -euo pipefail

###############################################################################
# CONFIGURATION
###############################################################################

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BASE_DIR="$SCRIPT_DIR/.."
VALID_AREAS=("packages" "apps")

# Source utility scripts
source "$SCRIPT_DIR/lib/_validation.sh"
source "$SCRIPT_DIR/lib/_templates.sh"

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
  create_readme "$pkg_dir" "$pkg_id"
  create_test_dir_if_needed "$pkg_dir" "$pkg_id"
  create_vite_config_if_needed "$pkg_dir" "$pkg_id"

  echo "Workspace/package creation completed successfully."
}

main "$@"
