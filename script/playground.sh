#!/bin/bash

. "${0%/*}/constants.sh"
set_constants

set -exo pipefail

case "$1" in
  mainnet)
    export redeploy=false
    playground_script=script/PlaygroundV1.s.sol

    if [ $(($fork_block < $v1_mainnet_deploy_block)) ]
    then
      echo "Fork block too early, overwriting with block number $v1_mainnet_deploy_block"
      fork_block=$v1_mainnet_deploy_block
    fi
    ;;
  v1)
    export redeploy=true
    playground_script=script/PlaygroundV1.s.sol
    ;;

  v2)
    export redeploy=true
    playground_script=script/PlaygroundV2.s.sol
    ;;

  *)
    echo "run script/playground.sh {mainnet,v1,v2}"
    exit 1
    ;;
esac

anvil --mnemonic "$mnemonic" --fork-url "$fork_url" --fork-block-number 15928025 --chain-id 1 --port 8545 &
anvil_pid="$!"
sleep 3

if kill -0 "$anvil_pid"; then
  echo "anvil running"
else
  echo "anvil failed"
  wait "$anvil_pid"
fi

while ! nc -z localhost 8545; do
  sleep 3
done

function cleanup {
  kill "$anvil_pid"
}

trap cleanup EXIT

echo "Running playground script..."
REDEPLOY="$redeploy" forge script "$playground_script" --rpc-url "$ETH_RPC_URL" --private-key "$ETH_PRIVATE_KEY" --broadcast --etherscan-api-key "$ETHERSCAN_KEY" -vvvv $@
echo "Pitter patter."

yarn web:dev --mode playground
