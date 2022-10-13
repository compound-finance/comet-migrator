#!/bin/bash

. "${0%/*}/constants.sh"
set_constants

set -exo pipefail

cmd="test"
rest=()

while test $# -gt 0
do
  case "$1" in
    --coverage) echo "coverage"
      cmd="coverage"
      ;;
    *) echo "argument $1"
      rest+=("$1")
      ;;
  esac
  shift
done

forge "$cmd" ${args[*]} --fork-url "$fork_url" --fork-block-number "$fork_block" ${rest[*]}
