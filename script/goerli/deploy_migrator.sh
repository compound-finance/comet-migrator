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
comet="0x38371Dc317aa0E48c819716B72345a5c5a8D3aFA"
borrowCToken="0x73506770799Eb04befb5AaE4734e58C2C624F493"
cETH="0x64078a6189Bf45f80091c6Ff2fCEe1B15Ac8dbde"
weth="0x42a71137C09AE83D8d05974960fd607d40033499"
uniswapLiquidityPool="0x9288451589Bfd7d6bEAd87d9D6689FB8Dec7ddAa"
sweepee="0xbBFE34E868343E6F4f5E8B5308de980d7bd88c46"

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
