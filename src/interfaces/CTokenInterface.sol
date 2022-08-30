// SPDX-License-Identifier: MIT
pragma solidity 0.8.15;

import "../vendor/@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface CTokenLike {
  function redeem(uint redeemTokens) external returns (uint);
}

interface CErc20 is CTokenLike {
  function underlying() external returns (IERC20);
}
