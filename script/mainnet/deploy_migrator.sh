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

# Constructor Variables
#
# CometMigrator::constructor(
#   comet_ :: The Comet Ethereum mainnet USDC contract.
#   borrowCToken_ :: The Compound II market for the borrowed token (e.g. `cUSDC`).
#   cETH_ :: The address of the `cETH` token.
#   weth_ :: The address of the `WETH9` token.
#   uniswapLiquidityPool_ :: The Uniswap pool used by this contract to source liquidity (i.e. flash loans).
#   sweepee_ :: Sweep excess tokens to this address.
# )
#
comet="0xc3d688B66703497DAA19211EEdff47f25384cdc3"
borrowCToken="0x39AA39c021dfbaE8faC545936693aC917d5E7563"
cETH="0x4Ddc2D193948926D02f9B1fE9e1daa0718270ED5"
weth="0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"
uniswapLiquidityPool="0x5777d92f208679DB4b9778590Fa3CAB3aC9e2168"
sweepee="0x6d903f6003cca6255D85CcA4D3B5E5146dC33925"

forge create \
  $rpc_args \
  $etherscan_args \
  $wallet_args \
  $@ \
  src/CometMigrator.sol:CometMigrator \
  --constructor-args \
    "$comet" \
    "$borrowCToken" \
    "$cETH" \
    "$weth" \
    "$uniswapLiquidityPool" \
    "$sweepee"
