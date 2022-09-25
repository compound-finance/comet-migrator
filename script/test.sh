#!/bin/bash

. "${0%/*}/constants.sh"
set_constants

set -exo pipefail

forge test --fork-url "$fork_url" --fork-block-number "$fork_block" --etherscan-api-key "$ETHERSCAN_API_KEY" $@
