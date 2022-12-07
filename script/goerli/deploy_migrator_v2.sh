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
comet="0x3EE77595A8459e93C2888b13aDB354017B198188"
baseToken="0x07865c6E87B9F70255377e024ace6630C1Eaa37F"
cETH="0x64078a6189Bf45f80091c6Ff2fCEe1B15Ac8dbde"
weth="0x42a71137C09AE83D8d05974960fd607d40033499"
aaveV2LendingPool="0x4bd5643ac6f66a5237E18bfA7d47cF22f1c9F210"
uniswapLiquidityPool="0x9288451589Bfd7d6bEAd87d9D6689FB8Dec7ddAa"
swapRouter="0xE592427A0AEce92De3Edee1F18E0157C05861564"
sweepee="0xbBFE34E868343E6F4f5E8B5308de980d7bd88c46"

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
