#!/bin/bash

set -exo pipefail

[ -f ".env" ] && source .env
[ -f ".env.local" ] && source .env.local

export fork_url="${ETHEREUM_REMOTE_NODE_MAINNET:-https://mainnet-eth.compound.finance/}"

forge test --fork-url "$fork_url" --fork-block-number 15525659 --etherscan-api-key "$ETHERSCAN_API_KEY" $@
