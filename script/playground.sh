#!/bin/bash

set -exo pipefail

[ -f ".env" ] && source .env
[ -f ".env.local" ] && source .env.local

export ETH_RPC_URL=http://localhost:8745
export ETH_PRIVATE_KEY="0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
export fork_url="${ETHEREUM_REMOTE_NODE_MAINNET:-https://mainnet-eth.compound.finance/}"

# Start Anvil fork
anvil --fork-url "$fork_url" --port 8745 &
anvil_pid="$!"

while ! nc -z localhost 8745; do
  sleep 0.1
done

function cleanup {
  kill "$anvil_pid"
}

trap cleanup EXIT



echo "Running playground script..."
forge script script/Playground.s.sol --rpc-url "$ETH_RPC_URL" --private-key "$ETH_PRIVATE_KEY" --broadcast --verify --etherscan-api-key "$ETHERSCAN_KEY" -vvvv
echo "Pitter patter."

fg "$anvil_pid"
