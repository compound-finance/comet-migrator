#!/bin/bash

. "${0%/*}/constants.sh"
set_constants

set -exo pipefail

mainnet_deploy_block=15749484

if [ $(($fork_block < $mainnet_deploy_block)) ]
then
  echo "Fork block too early, overwriting with block number $mainnet_deploy_block"
  fork_block=$mainnet_deploy_block
fi

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

yarn web:dev --mode playground
