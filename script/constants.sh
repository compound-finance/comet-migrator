#!/bin/bash

function set_constants() {
  export ETH_RPC_URL=http://localhost:8545
  export ETH_PRIVATE_KEY="0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
  export fork_url="${ETHEREUM_REMOTE_NODE_MAINNET:-https://mainnet-eth.compound.finance/}"
  export mnemonic="test test test test test test test test test test test junk"
  export fork_block="15542274"

  [ -f ".env" ] && source .env
  [ -f ".env.local" ] && source .env.local
}
