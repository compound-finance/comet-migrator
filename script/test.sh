#!/bin/bash

set -exo pipefail

[ -f ".env" ] && source .env
[ -f ".env.local" ] && source .env.local

export fork_url="${ETHEREUM_REMOTE_NODE_MAINNET:-https://mainnet-eth.compound.finance/}"

mnemonic="test test test test test test test test test test test junk"
fork_block="15525659"
forge test --mnemonic "$mnemonic" --fork-url "$fork_url" --fork-block-number "$fork_block" --etherscan-api-key "$ETHERSCAN_API_KEY" $@
