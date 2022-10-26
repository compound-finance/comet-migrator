// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import "../src/vendor/@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../src/CometMigratorV2.sol";

contract LazyToken is CTokenLike {
  function totalSupply() external pure returns (uint256) {
    return 0;
  }

  function balanceOf(address) external pure returns (uint256) {
    return 0;
  }

  function borrow(uint256) external pure returns (uint256) {
    return 0;
  }

  function transfer(address, uint256) external pure returns (bool) {
    return false;
  }

  function allowance(address, address) external pure returns (uint256) {
    return 0;
  }

  function approve(address, uint256) external pure returns (bool) {
    return false;
  }

  function transferFrom(address, address, uint256) external virtual returns (bool) {
    return false;
  }

  function redeem(uint) external virtual returns (uint) {
    return 0;
  }

  function borrowBalanceCurrent(address) external virtual returns (uint) {
    return 0;
  }

  function exchangeRateCurrent() external virtual returns (uint) {
    return 0;
  }
}

contract NoRedeemToken is LazyToken {
  function transferFrom(address, address, uint256) external pure override returns (bool) {
    return true;
  }

  function redeem(uint) external pure override returns (uint) {
    return 10;
  }
}

contract ReentrantToken is LazyToken {
  CometMigratorV2 public migrator;

  constructor(CometMigratorV2 migrator_) {
    migrator = migrator_;
  }

  function transferFrom(address, address, uint256) external override returns (bool) {
    CometMigratorV2.CompoundV2Position memory compoundV2Position;
    CometMigratorV2.AaveV2Position memory aaveV2Position;
    CometMigratorV2.CDPPosition[] memory cdpPositions;
    migrator.migrate(compoundV2Position, aaveV2Position, cdpPositions, 0e6);
    return false;
  }
}

contract ReentrantCallbackToken is LazyToken {
  CometMigratorV2 public migrator;

  constructor(CometMigratorV2 migrator_) {
    migrator = migrator_;
  }

  function transferFrom(address, address, uint256) external override returns (bool) {
    migrator.uniswapV3FlashCallback(0, 0, "");
    return false;
  }
}

contract ReentrantSweepToken is LazyToken {
  CometMigratorV2 public migrator;

  constructor(CometMigratorV2 migrator_) {
    migrator = migrator_;
  }

  function transferFrom(address, address, uint256) external override returns (bool) {
    migrator.sweep(IERC20NonStandard(0x0000000000000000000000000000000000000000));
    return false;
  }
}
