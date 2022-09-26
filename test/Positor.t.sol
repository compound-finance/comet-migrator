// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import "forge-std/Script.sol";
import "../src/CometMigrator.sol";
import "forge-std/Test.sol";
import "./MainnetConstants.t.sol";

contract Positor is Test, MainnetConstants {
    struct Position {
        CTokenLike collateral;
        uint256 amount;
    }

    struct BorrowPosition {
        CErc20 borrowCToken;
        uint256 amount;
    }

    struct Posit {
        address borrower;
        Position[] positions;
        uint256 borrow;
    }

    struct Posit2 {
        address borrower;
        Position[] positions;
        BorrowPosition[] borrows;
    }

    mapping (CTokenLike => address) holders;
    CometMigrator public immutable migrator;

    constructor() {
        holders[cUNI] = cHolderUni;
        holders[cETH] = cHolderEth;

        console.log("Deploying Comet Migrator");
        migrator = deployCometMigrator();
        console.log("Deployed Comet Migrator", address(migrator));
    }

    function posit(Posit memory posit_) public {
        setupMigratorBorrow(posit_.borrower, posit_.positions, posit_.borrow);
    }

    function setupMigratorBorrow(address borrower, Position[] memory positions, uint256 borrowAmount) internal returns (CometMigrator) {
        for (uint8 i = 0; i < positions.length; i++) {
            setupV2Borrows(borrower, positions[i].collateral, positions[i].amount);
        }

        vm.prank(borrower);
        require(cUSDC.borrow(borrowAmount) == 0, "failed to borrow"); // 100 USDC
        require(usdc.balanceOf(borrower) == borrowAmount, "incorrect borrow");
        require(cUSDC.borrowBalanceCurrent(borrower) >= borrowAmount, "incorrect borrow");

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

    function posit2(Posit2 memory posit_) public {
        setupMigratorBorrow(posit_.borrower, posit_.positions, posit_.borrows);
    }

    function setupMigratorBorrow(address borrower, Position[] memory supplyPositions, BorrowPosition[] memory borrowPositions) internal returns (Comet_V2_Migrator) {
        for (uint8 i = 0; i < supplyPositions.length; i++) {
            setupV2Borrows(borrower, supplyPositions[i].collateral, supplyPositions[i].amount);
        }

        for (uint8 i = 0; i < borrowPositions.length; i++) {
            CErc20 cToken = borrowPositions[i].borrowCToken;
            IERC20 underlying = cToken.underlying(); // XXX doesn't work for cETH
            uint256 borrowAmount = borrowPositions[i].amount;
            vm.prank(borrower);
            require(cToken.borrow(borrowAmount) == 0, "failed to borrow"); // 100 USDC
            require(underlying.balanceOf(borrower) == borrowAmount, "incorrect borrow");
            require(cToken.borrowBalanceCurrent(borrower) >= borrowAmount, "incorrect borrow");
        }

        return migrator;
    }

    function deployCometMigrator() internal returns (CometMigrator) {
        return new CometMigrator(
            comet,
            cETH,
            weth,
            sweepee
        );
    }

    function amountToTokens(uint256 amount, CTokenLike cToken) internal returns (uint256) {
        return ( 1e18 * amount ) / cToken.exchangeRateCurrent();
    }
}
