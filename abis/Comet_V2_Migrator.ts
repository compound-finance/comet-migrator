export default [
  {
    "inputs": [
      {
        "internalType": "contract Comet",
        "name": "comet_",
        "type": "address"
      },
      {
        "internalType": "contract CErc20",
        "name": "borrowCToken_",
        "type": "address"
      },
      {
        "internalType": "contract CTokenLike",
        "name": "cETH_",
        "type": "address"
      },
      {
        "internalType": "contract IWETH9",
        "name": "weth_",
        "type": "address"
      },
      {
        "internalType": "contract IUniswapV3Pool",
        "name": "uniswapLiquidityPool_",
        "type": "address"
      },
      {
        "internalType": "address payable",
        "name": "sweepee_",
        "type": "address"
      }
    ],
    "stateMutability": "payable",
    "type": "constructor"
  },
  {
    "inputs": [],
    "name": "CTokenTransferFailure",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "loc",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "code",
        "type": "uint256"
      }
    ],
    "name": "CompoundV2Error",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "loc",
        "type": "uint256"
      }
    ],
    "name": "Reentrancy",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "loc",
        "type": "uint256"
      }
    ],
    "name": "SweepFailure",
    "type": "error"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "user",
        "type": "address"
      },
      {
        "components": [
          {
            "internalType": "contract CTokenLike",
            "name": "cToken",
            "type": "address"
          },
          {
            "internalType": "uint256",
            "name": "amount",
            "type": "uint256"
          }
        ],
        "indexed": false,
        "internalType": "struct Comet_V2_Migrator.Collateral[]",
        "name": "collateral",
        "type": "tuple[]"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "repayAmount",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "borrowAmountWithFee",
        "type": "uint256"
      }
    ],
    "name": "Migrated",
    "type": "event"
  },
  {
    "inputs": [],
    "name": "borrowCToken",
    "outputs": [
      {
        "internalType": "contract CErc20",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "borrowToken",
    "outputs": [
      {
        "internalType": "contract IERC20",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "cETH",
    "outputs": [
      {
        "internalType": "contract CTokenLike",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "name": "collateralTokens",
    "outputs": [
      {
        "internalType": "contract IERC20",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "comet",
    "outputs": [
      {
        "internalType": "contract Comet",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "inMigration",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "components": [
          {
            "internalType": "contract CTokenLike",
            "name": "cToken",
            "type": "address"
          },
          {
            "internalType": "uint256",
            "name": "amount",
            "type": "uint256"
          }
        ],
        "internalType": "struct Comet_V2_Migrator.Collateral[]",
        "name": "collateral",
        "type": "tuple[]"
      },
      {
        "internalType": "uint256",
        "name": "borrowAmount",
        "type": "uint256"
      }
    ],
    "name": "migrate",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "contract IERC20",
        "name": "token",
        "type": "address"
      }
    ],
    "name": "sweep",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "sweepee",
    "outputs": [
      {
        "internalType": "address payable",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "uniswapLiquidityPool",
    "outputs": [
      {
        "internalType": "contract IUniswapV3Pool",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "uniswapLiquidityPoolFee",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "uniswapLiquidityPoolToken0",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "fee0",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "fee1",
        "type": "uint256"
      },
      {
        "internalType": "bytes",
        "name": "data",
        "type": "bytes"
      }
    ],
    "name": "uniswapV3FlashCallback",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "weth",
    "outputs": [
      {
        "internalType": "contract IWETH9",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "stateMutability": "payable",
    "type": "receive"
  }
] as const;