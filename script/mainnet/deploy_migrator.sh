#!/bin/bash

set -exo pipefail

if [ -n "$ETHEREUM_PK" ]; then
  wallet_args="--private-key $ETHEREUM_PK"
else
  wallet_args="--unlocked"
fi

if [ -n "$RPC_URL" ]; then
  rpc_args="--rpc-url $RPC_URL"
else
  rpc_args=""
fi

if [ -n "$ETHERSCAN_API_KEY" ]; then
  etherscan_args="--verify --etherscan-api-key $ETHERSCAN_API_KEY"
else
  etherscan_args=""
fi

# Constructor Variables from
#
# Comet_V2_Migrator::constructor(
#   Comet comet_,
#   CErc20 borrowCToken_,
#   IUniswapV3Pool uniswapLiquidityPool_,
#   IERC20[] memory collateralTokens_,
#   address sweepee_,
#   address _factory, // TODO
#   address _WETH9 // TODO
# )
#
comet="0x"
borrowCToken="0x"
uniswapLiquidityPool="0x"
collateralTokens="[]"
sweepee="0x"
factory="0x"
weth9="0x"

echo forge create \
  $rpc_args \
  $etherscan_args \
  $wallet_args \
  $@ \
  src/Comet_V2_Migrator.sol:Comet_V2_Migrator \
  --constructor-args \
    "$comet" \
    "$borrowCToken" \
    "$uniswapLiquidityPool" \
    "$collateralTokens" \
    "$sweepee" \
    "$factory" \
    "$weth9"
