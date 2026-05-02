#!/usr/bin/env bash

###############################################################################
# CLI ARGUMENT PARSING AND HELP
###############################################################################

usage() {
  cat << EOF
Usage: $0 [OPTIONS] PACKAGE_NAME

Create a new workspace package with the specified name.

Arguments:
  PACKAGE_NAME          Name of the package to create

Options:
  --dir DIR             Target directory (default: packages)
                        Valid values: packages, apps
  --prefix PREFIX       Package namespace prefix (default: repo)
                        Creates package as @PREFIX/PACKAGE_NAME
  --build               Configure package to use dist/ folder with build step
                        (default: points directly to src/ without build)
  -h, --help           Show this help message

Examples:
  # Create @repo/events pointing to src/ (no build needed)
  $0 events

  # Create @repo/events with build configuration (uses dist/)
  $0 events --build

  # Create @repo/events explicitly
  $0 events --prefix repo --dir packages

  # Create @myapp/auth in apps/ directory with build
  $0 auth --dir apps --prefix myapp --build

EOF
  exit 0
}

parse_args() {
  package_name=""
  target_area="packages"
  target_namespace="repo"
  run_build=false

  # Parse arguments
  while [[ $# -gt 0 ]]; do
    case $1 in
      -h|--help)
        usage
        ;;
      --dir)
        target_area="$2"
        shift 2
        ;;
      --prefix)
        target_namespace="$2"
        shift 2
        ;;
      --build)
        run_build=true
        shift
        ;;
      -*)
        echo "Error: Unknown option: $1" >&2
        echo "Use --help for usage information" >&2
        exit 1
        ;;
      *)
        if [[ -z "$package_name" ]]; then
          package_name="$1"
          shift
        else
          echo "Error: Unexpected argument: $1" >&2
          echo "Use --help for usage information" >&2
          exit 1
        fi
        ;;
    esac
  done

  # Validate package name provided
  if [[ -z "$package_name" ]]; then
    echo "Error: PACKAGE_NAME is required" >&2
    echo "Use --help for usage information" >&2
    exit 1
  fi
}
