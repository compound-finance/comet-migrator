// SPDX-License-Identifier: MIT
pragma solidity 0.8.16;

interface IERC20NonStandard {
    function approve(address spender, uint256 amount) external;
    function transfer(address to, uint256 value) external;
    function transferFrom(address from, address to, uint256 value) external;
    function balanceOf(address account) external view returns (uint256);
}
