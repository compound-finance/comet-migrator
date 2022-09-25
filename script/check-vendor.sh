#!/bin/bash

. "${0%/*}/constants.sh"
set_constants

set -exo pipefail

yarn global add vendoza
vendoza src/vendor/manifest.json
