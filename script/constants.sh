#!/bin/bash

function set_constants() {
  export ETH_RPC_URL=http://localhost:8545
  export ETH_PRIVATE_KEY="0x10f211fde09d6878860bafdbc9ddb2fbd676d489c07eb2c89618dc588ec6bf68"
  export fork_url="${ETHEREUM_REMOTE_NODE_MAINNET:-https://mainnet-eth.compound.finance/}"
  export mnemonic="panel capable wet impulse ozone asset forget stamp stand long nose talk"
  export fork_block="15542274"

  [ -f ".env" ] && source .env
  [ -f ".env.local" ] && source .env.local
}
