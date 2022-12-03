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
# CometMigratorV2::constructor(
#   comet_ :: The Comet Ethereum mainnet USDC contract.
#   baseToken_ :: The base token of the Compound III market (e.g. `USDC`).
#   cETH_ :: The address of the `cETH` token.
#   weth_ :: The address of the `WETH9` token.
#   aaveV2LendingPool_ :: The address of the Aave v2 LendingPool contract. This is the contract that all `withdraw` and `repay` transactions go through.
#   uniswapLiquidityPool_ :: The Uniswap pool used by this contract to source liquidity (i.e. flash loans).
#   swapRouter_ :: The Uniswap router for facilitating token swaps.
#   sweepee_ :: Sweep excess tokens to this address.
# )
#
comet="0xc3d688B66703497DAA19211EEdff47f25384cdc3"
baseToken="0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"
cETH="0x4Ddc2D193948926D02f9B1fE9e1daa0718270ED5"
weth="0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"
aaveV2LendingPool="0x7d2768dE32b0b80b7a3454c06BdAc94A69DDc7A9"
uniswapLiquidityPool="0x88e6A0c2dDD26FEEb64F039a2c41296FcB3f5640" # WETH-USDC 0.05% pool
swapRouter="0xE592427A0AEce92De3Edee1F18E0157C05861564"
sweepee="0x6d903f6003cca6255D85CcA4D3B5E5146dC33925"

forge create \
  $rpc_args \
  $etherscan_args \
  $wallet_args \
  $@ \
  src/CometMigratorV2.sol:CometMigratorV2 \
  --constructor-args \
    "$comet" \
    "$baseToken" \
    "$cETH" \
    "$weth" \
    "$aaveV2LendingPool" \
    "$uniswapLiquidityPool" \
    "$swapRouter" \
    "$sweepee"
