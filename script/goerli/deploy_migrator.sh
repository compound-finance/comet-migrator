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
# Comet_V2_Migrator::constructor(
#   comet_ :: The Comet Ethereum mainnet USDC contract.
#   borrowCToken_ :: The Compound II market for the borrowed token (e.g. `cUSDC`).
#   cETH_ :: The address of the `cETH` token.
#   weth_ :: The address of the `WETH9` token.
#   uniswapLiquidityPool_ :: The Uniswap pool used by this contract to source liquidity (i.e. flash loans).
#   sweepee_ :: Sweep excess tokens to this address.
# )
#
comet="0x"
borrowCToken="0x"
cETH="0x"
weth="0x"
uniswapLiquidityPool="0x"
sweepee="0x"

forge create \
  $rpc_args \
  $etherscan_args \
  $wallet_args \
  $@ \
  src/Comet_V2_Migrator.sol:Comet_V2_Migrator \
  --constructor-args \
    "$comet" \
    "$borrowCToken" \
    "$cETH" \
    "$weth" \
    "$uniswapLiquidityPool" \
    "$sweepee"
