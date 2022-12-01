export default [
  {
    inputs: [
      {
        internalType: 'contract Comet',
        name: 'comet_',
        type: 'address'
      },
      {
        internalType: 'contract IERC20NonStandard',
        name: 'baseToken_',
        type: 'address'
      },
      {
        internalType: 'contract CTokenLike',
        name: 'cETH_',
        type: 'address'
      },
      {
        internalType: 'contract IWETH9',
        name: 'weth_',
        type: 'address'
      },
      {
        internalType: 'contract ILendingPool',
        name: 'aaveV2LendingPool_',
        type: 'address'
      },
      {
        internalType: 'contract IUniswapV3Pool',
        name: 'uniswapLiquidityPool_',
        type: 'address'
      },
      {
        internalType: 'contract ISwapRouter',
        name: 'swapRouter_',
        type: 'address'
      },
      {
        internalType: 'address payable',
        name: 'sweepee_',
        type: 'address'
      }
    ],
    stateMutability: 'nonpayable',
    type: 'constructor'
  },
  {
    inputs: [],
    name: 'CTokenTransferFailure',
    type: 'error'
  },
  {
    inputs: [
      {
        internalType: 'uint256',
        name: 'loc',
        type: 'uint256'
      },
      {
        internalType: 'uint256',
        name: 'code',
        type: 'uint256'
      }
    ],
    name: 'CompoundV2Error',
    type: 'error'
  },
  {
    inputs: [
      {
        internalType: 'uint256',
        name: 'loc',
        type: 'uint256'
      }
    ],
    name: 'ERC20TransferFailure',
    type: 'error'
  },
  {
    inputs: [
      {
        internalType: 'uint256',
        name: 'loc',
        type: 'uint256'
      }
    ],
    name: 'InvalidCallback',
    type: 'error'
  },
  {
    inputs: [
      {
        internalType: 'uint256',
        name: 'loc',
        type: 'uint256'
      }
    ],
    name: 'InvalidConfiguration',
    type: 'error'
  },
  {
    inputs: [
      {
        internalType: 'uint256',
        name: 'loc',
        type: 'uint256'
      }
    ],
    name: 'InvalidInputs',
    type: 'error'
  },
  {
    inputs: [
      {
        internalType: 'uint256',
        name: 'loc',
        type: 'uint256'
      }
    ],
    name: 'Reentrancy',
    type: 'error'
  },
  {
    inputs: [
      {
        internalType: 'uint256',
        name: 'loc',
        type: 'uint256'
      }
    ],
    name: 'SweepFailure',
    type: 'error'
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: 'address',
        name: 'user',
        type: 'address'
      },
      {
        components: [
          {
            components: [
              {
                internalType: 'contract CTokenLike',
                name: 'cToken',
                type: 'address'
              },
              {
                internalType: 'uint256',
                name: 'amount',
                type: 'uint256'
              }
            ],
            internalType: 'struct CometMigratorV2.CompoundV2Collateral[]',
            name: 'collateral',
            type: 'tuple[]'
          },
          {
            components: [
              {
                internalType: 'contract CTokenLike',
                name: 'cToken',
                type: 'address'
              },
              {
                internalType: 'uint256',
                name: 'amount',
                type: 'uint256'
              }
            ],
            internalType: 'struct CometMigratorV2.CompoundV2Borrow[]',
            name: 'borrows',
            type: 'tuple[]'
          },
          {
            components: [
              {
                internalType: 'bytes',
                name: 'path',
                type: 'bytes'
              },
              {
                internalType: 'uint256',
                name: 'amountInMaximum',
                type: 'uint256'
              }
            ],
            internalType: 'struct CometMigratorV2.Swap[]',
            name: 'swaps',
            type: 'tuple[]'
          }
        ],
        indexed: false,
        internalType: 'struct CometMigratorV2.CompoundV2Position',
        name: 'compoundV2Position',
        type: 'tuple'
      },
      {
        components: [
          {
            components: [
              {
                internalType: 'contract ATokenLike',
                name: 'aToken',
                type: 'address'
              },
              {
                internalType: 'uint256',
                name: 'amount',
                type: 'uint256'
              }
            ],
            internalType: 'struct CometMigratorV2.AaveV2Collateral[]',
            name: 'collateral',
            type: 'tuple[]'
          },
          {
            components: [
              {
                internalType: 'contract ADebtTokenLike',
                name: 'aDebtToken',
                type: 'address'
              },
              {
                internalType: 'uint256',
                name: 'amount',
                type: 'uint256'
              }
            ],
            internalType: 'struct CometMigratorV2.AaveV2Borrow[]',
            name: 'borrows',
            type: 'tuple[]'
          },
          {
            components: [
              {
                internalType: 'bytes',
                name: 'path',
                type: 'bytes'
              },
              {
                internalType: 'uint256',
                name: 'amountInMaximum',
                type: 'uint256'
              }
            ],
            internalType: 'struct CometMigratorV2.Swap[]',
            name: 'swaps',
            type: 'tuple[]'
          }
        ],
        indexed: false,
        internalType: 'struct CometMigratorV2.AaveV2Position',
        name: 'aaveV2Position',
        type: 'tuple'
      },
      {
        indexed: false,
        internalType: 'uint256',
        name: 'flashAmount',
        type: 'uint256'
      },
      {
        indexed: false,
        internalType: 'uint256',
        name: 'flashAmountWithFee',
        type: 'uint256'
      }
    ],
    name: 'Migrated',
    type: 'event'
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: 'address',
        name: 'sweeper',
        type: 'address'
      },
      {
        indexed: true,
        internalType: 'address',
        name: 'recipient',
        type: 'address'
      },
      {
        indexed: true,
        internalType: 'address',
        name: 'asset',
        type: 'address'
      },
      {
        indexed: false,
        internalType: 'uint256',
        name: 'amount',
        type: 'uint256'
      }
    ],
    name: 'Sweep',
    type: 'event'
  },
  {
    inputs: [],
    name: 'aaveV2LendingPool',
    outputs: [
      {
        internalType: 'contract ILendingPool',
        name: '',
        type: 'address'
      }
    ],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [],
    name: 'baseToken',
    outputs: [
      {
        internalType: 'contract IERC20NonStandard',
        name: '',
        type: 'address'
      }
    ],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [],
    name: 'cETH',
    outputs: [
      {
        internalType: 'contract CTokenLike',
        name: '',
        type: 'address'
      }
    ],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [],
    name: 'comet',
    outputs: [
      {
        internalType: 'contract Comet',
        name: '',
        type: 'address'
      }
    ],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [],
    name: 'inMigration',
    outputs: [
      {
        internalType: 'uint256',
        name: '',
        type: 'uint256'
      }
    ],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [],
    name: 'isUniswapLiquidityPoolToken0',
    outputs: [
      {
        internalType: 'bool',
        name: '',
        type: 'bool'
      }
    ],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [
      {
        components: [
          {
            components: [
              {
                internalType: 'contract CTokenLike',
                name: 'cToken',
                type: 'address'
              },
              {
                internalType: 'uint256',
                name: 'amount',
                type: 'uint256'
              }
            ],
            internalType: 'struct CometMigratorV2.CompoundV2Collateral[]',
            name: 'collateral',
            type: 'tuple[]'
          },
          {
            components: [
              {
                internalType: 'contract CTokenLike',
                name: 'cToken',
                type: 'address'
              },
              {
                internalType: 'uint256',
                name: 'amount',
                type: 'uint256'
              }
            ],
            internalType: 'struct CometMigratorV2.CompoundV2Borrow[]',
            name: 'borrows',
            type: 'tuple[]'
          },
          {
            components: [
              {
                internalType: 'bytes',
                name: 'path',
                type: 'bytes'
              },
              {
                internalType: 'uint256',
                name: 'amountInMaximum',
                type: 'uint256'
              }
            ],
            internalType: 'struct CometMigratorV2.Swap[]',
            name: 'swaps',
            type: 'tuple[]'
          }
        ],
        internalType: 'struct CometMigratorV2.CompoundV2Position',
        name: 'compoundV2Position',
        type: 'tuple'
      },
      {
        components: [
          {
            components: [
              {
                internalType: 'contract ATokenLike',
                name: 'aToken',
                type: 'address'
              },
              {
                internalType: 'uint256',
                name: 'amount',
                type: 'uint256'
              }
            ],
            internalType: 'struct CometMigratorV2.AaveV2Collateral[]',
            name: 'collateral',
            type: 'tuple[]'
          },
          {
            components: [
              {
                internalType: 'contract ADebtTokenLike',
                name: 'aDebtToken',
                type: 'address'
              },
              {
                internalType: 'uint256',
                name: 'amount',
                type: 'uint256'
              }
            ],
            internalType: 'struct CometMigratorV2.AaveV2Borrow[]',
            name: 'borrows',
            type: 'tuple[]'
          },
          {
            components: [
              {
                internalType: 'bytes',
                name: 'path',
                type: 'bytes'
              },
              {
                internalType: 'uint256',
                name: 'amountInMaximum',
                type: 'uint256'
              }
            ],
            internalType: 'struct CometMigratorV2.Swap[]',
            name: 'swaps',
            type: 'tuple[]'
          }
        ],
        internalType: 'struct CometMigratorV2.AaveV2Position',
        name: 'aaveV2Position',
        type: 'tuple'
      },
      {
        internalType: 'uint256',
        name: 'flashAmount',
        type: 'uint256'
      }
    ],
    name: 'migrate',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    inputs: [],
    name: 'swapRouter',
    outputs: [
      {
        internalType: 'contract ISwapRouter',
        name: '',
        type: 'address'
      }
    ],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [
      {
        internalType: 'contract IERC20NonStandard',
        name: 'token',
        type: 'address'
      }
    ],
    name: 'sweep',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    inputs: [],
    name: 'sweepee',
    outputs: [
      {
        internalType: 'address payable',
        name: '',
        type: 'address'
      }
    ],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [],
    name: 'uniswapLiquidityPool',
    outputs: [
      {
        internalType: 'contract IUniswapV3Pool',
        name: '',
        type: 'address'
      }
    ],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [
      {
        internalType: 'uint256',
        name: 'fee0',
        type: 'uint256'
      },
      {
        internalType: 'uint256',
        name: 'fee1',
        type: 'uint256'
      },
      {
        internalType: 'bytes',
        name: 'data',
        type: 'bytes'
      }
    ],
    name: 'uniswapV3FlashCallback',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    inputs: [],
    name: 'weth',
    outputs: [
      {
        internalType: 'contract IWETH9',
        name: '',
        type: 'address'
      }
    ],
    stateMutability: 'view',
    type: 'function'
  },
  {
    stateMutability: 'payable',
    type: 'receive'
  }
];
