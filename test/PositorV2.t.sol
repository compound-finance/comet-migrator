// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import "forge-std/Script.sol";
import "../src/CometMigratorV2.sol";
import "forge-std/Test.sol";
import "./MainnetConstants.t.sol";

contract Positor is Test, MainnetConstants {
    struct Posit {
        address borrower;
        CometMigratorV2.CompoundV2Collateral[] collateral;
        CometMigratorV2.CompoundV2Borrow[] borrows;
    }

    mapping (CTokenLike => address) holders;
    CometMigratorV2 public immutable migrator;

    constructor() {
        holders[cUNI] = cHolderUni;
        holders[cETH] = cHolderEth;

        console.log("Deploying Comet Migrator");
        migrator = deployCometMigrator();
        console.log("Deployed Comet Migrator", address(migrator));
    }

    function posit(Posit memory posit_) public {
        setupMigratorBorrow(posit_.borrower, posit_.collateral, posit_.borrows);
    }

    function setupMigratorBorrow(address borrower, CometMigratorV2.CompoundV2Collateral[] memory collateral, CometMigratorV2.CompoundV2Borrow[] memory borrows) internal returns (CometMigratorV2) {
        for (uint8 i = 0; i < collateral.length; i++) {
            setupV2Borrows(borrower, collateral[i].cToken, collateral[i].amount);
        }

        for (uint8 i = 0; i < borrows.length; i++) {
            CErc20 cToken = borrows[i].cToken;
            IERC20 underlying = cToken.underlying(); // XXX doesn't work for cETH
            uint256 borrowAmount = borrows[i].amount;
            vm.prank(borrower);
            require(cToken.borrow(borrowAmount) == 0, "failed to borrow"); // 100 USDC
            require(underlying.balanceOf(borrower) == borrowAmount, "incorrect borrow");
            require(cToken.borrowBalanceCurrent(borrower) >= borrowAmount, "incorrect borrow");
        }

        return migrator;
    }

    function setupV2Borrows(address borrower, CTokenLike cToken, uint256 amount) internal {
        // Next, let's transfer in some of the cToken to ourselves
        uint256 tokens = amountToTokens(amount, cToken);
        console.log(address(cToken), tokens);
        vm.prank(holders[cToken]);
        cToken.transfer(borrower, tokens);

        require(cToken.balanceOf(borrower) == tokens, "invalid cToken balance");

        // Next, we need to enter this market
        vm.prank(borrower);
        address[] memory markets = new address[](1);
        markets[0] = address(cToken);
        comptroller.enterMarkets(markets);
    }

    function deployCometMigrator() internal returns (CometMigratorV2) {
        return new CometMigratorV2(
            comet,
            usdc,
            cETH,
            weth,
            aaveV2LendingPool,
            pool_DAI_USDC,
            swapRouter,
            sweepee
        );
    }

    function amountToTokens(uint256 amount, CTokenLike cToken) internal returns (uint256) {
        return ( 1e18 * amount ) / cToken.exchangeRateCurrent();
    }
}
