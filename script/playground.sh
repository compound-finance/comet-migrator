#!/bin/bash

set -exo pipefail

[ -f ".env" ] && source .env
[ -f ".env.local" ] && source .env.local

export ETH_RPC_URL=http://localhost:8545
export ETH_PRIVATE_KEY="0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
export fork_url="${ETHEREUM_REMOTE_NODE_MAINNET:-https://mainnet-eth.compound.finance/}"

# Start Anvil fork
mnemonic="test test test test test test test test test test test junk"
fork_block="15542274"
anvil --mnemonic "$mnemonic" --fork-url "$fork_url" --fork-block-number "$fork_block" --chain-id 1 --port 8545 &
anvil_pid="$!"

while ! nc -z localhost 8545; do
  sleep 3
done

function cleanup {
  kill "$anvil_pid"
}

trap cleanup EXIT

echo "Running playground script..."
forge script script/Playground.s.sol --rpc-url "$ETH_RPC_URL" --private-key "$ETH_PRIVATE_KEY" --broadcast --etherscan-api-key "$ETHERSCAN_KEY" -vvvv $@
echo "Pitter patter."

wait "$anvil_pid"
