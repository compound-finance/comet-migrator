// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import "forge-std/Script.sol";
import "../src/CometMigratorV2.sol";
import "forge-std/Test.sol";
import "./MainnetConstants.t.sol";
import "./PositorV2.t.sol";
import "./Tokens.t.sol";

contract CometMigratorV2Test is PositorV2 {
    event Migrated(
        address indexed user,
        CometMigratorV2.CompoundV2Position compoundV2Position,
        uint256 flashAmount,
        uint256 flashAmountWithFee);

    address public constant borrower = address(0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266);

    function testMigrateUniPosition_allUsdcDebt() public {
        // Posit
        CometMigratorV2.CompoundV2Collateral[] memory initialCollateral = new CometMigratorV2.CompoundV2Collateral[](1);
        initialCollateral[0] = CometMigratorV2.CompoundV2Collateral({
            cToken: cUNI,
            amount: 300e18 // ~ $5 * 300 = ~$1500 75% collateral factor = $1,000
        });
        CometMigratorV2.CompoundV2Borrow[] memory initialBorrows = new CometMigratorV2.CompoundV2Borrow[](1);
        initialBorrows[0] = CometMigratorV2.CompoundV2Borrow({
            cToken: cUSDC,
            amount: 350e6
        });
        posit(Posit({
            borrower: borrower,
            collateral: initialCollateral,
            borrows: initialBorrows
        }));

        uint256 cUNIPre = cUNI.balanceOf(borrower);
        preflightChecks();

        // Migrate
        CometMigratorV2.CompoundV2Collateral[] memory collateralToMigrate = new CometMigratorV2.CompoundV2Collateral[](1);
        uint256 migrateAmount = amountToTokens(199e18, cUNI);
        collateralToMigrate[0] = CometMigratorV2.CompoundV2Collateral({
            cToken: cUNI,
            amount: migrateAmount
        });
        bytes[] memory paths = new bytes[](1);
        paths[0] = "";

        vm.startPrank(borrower);
        cUNI.approve(address(migrator), type(uint256).max);
        comet.allow(address(migrator), true);

        // XXX
        // Check event
        // vm.expectEmit(true, false, false, true);
        // CometMigratorV2.TokenRepaid[] memory tokensRepaid = new CometMigratorV2.TokenRepaid[](1);
        // tokensRepaid[0] = CometMigratorV2.TokenRepaid({
        //     borrowToken: address(dai),
        //     repayAmount: 350e18
        // });
        // emit Migrated(borrower, collateral, tokensRepaid, 350e6 * 1.0001);

        CometMigratorV2.CompoundV2Position memory compoundV2Position = CometMigratorV2.CompoundV2Position({
            collateral: collateralToMigrate,
            borrows: initialBorrows,
            paths: paths
        });
        uint256 flashEstimate = 360e6;
        migrator.migrate(compoundV2Position, flashEstimate);

        // Check v2 balances
        assertEq(cUNI.balanceOf(borrower), cUNIPre - migrateAmount, "Amount of cUNI should have been migrated");
        assertEq(cUSDC.borrowBalanceCurrent(borrower), 0e6, "Remainder of tokens");

        // Check v3 balances
        assertApproxEqRel(comet.collateralBalanceOf(borrower, address(uni)), 199e18, 0.01e18, "v3 collateral balance");
        // Approximate assertion because of slippage from DAI to USDC
        assertApproxEqRel(comet.borrowBalanceOf(borrower), 350e6 * 1.0001, 0.01e18, "v3 borrow balance");
    }

    function testMigrateUniPosition_allDaiDebt() public {
        // Posit
        CometMigratorV2.CompoundV2Collateral[] memory initialCollateral = new CometMigratorV2.CompoundV2Collateral[](1);
        initialCollateral[0] = CometMigratorV2.CompoundV2Collateral({
            cToken: cUNI,
            amount: 300e18 // ~ $5 * 300 = ~$1500 75% collateral factor = $1,000
        });
        CometMigratorV2.CompoundV2Borrow[] memory initialBorrows = new CometMigratorV2.CompoundV2Borrow[](1);
        initialBorrows[0] = CometMigratorV2.CompoundV2Borrow({
            cToken: cDAI,
            amount: 350e18
        });
        posit(Posit({
            borrower: borrower,
            collateral: initialCollateral,
            borrows: initialBorrows
        }));

        uint256 cUNIPre = cUNI.balanceOf(borrower);
        preflightChecks();

        // Migrate
        CometMigratorV2.CompoundV2Collateral[] memory collateralToMigrate = new CometMigratorV2.CompoundV2Collateral[](1);
        uint256 migrateAmount = amountToTokens(199e18, cUNI);
        collateralToMigrate[0] = CometMigratorV2.CompoundV2Collateral({
            cToken: cUNI,
            amount: migrateAmount
        });
        bytes[] memory paths = new bytes[](1);
        uint24 poolFee = 500;
        // Path is reversed (DAI -> USDC) because we are using exact output instead of exact input
        bytes memory swapPath = abi.encodePacked(
            address(dai), poolFee, address(usdc)
        );
        paths[0] = swapPath;

        vm.startPrank(borrower);
        cUNI.approve(address(migrator), type(uint256).max);
        comet.allow(address(migrator), true);

        // XXX
        // Check event
        // vm.expectEmit(true, false, false, true);
        // CometMigratorV2.TokenRepaid[] memory tokensRepaid = new CometMigratorV2.TokenRepaid[](1);
        // tokensRepaid[0] = CometMigratorV2.TokenRepaid({
        //     borrowToken: address(dai),
        //     repayAmount: 350e18
        // });
        // emit Migrated(borrower, collateral, tokensRepaid, 350e6 * 1.0001);

        CometMigratorV2.CompoundV2Position memory compoundV2Position = CometMigratorV2.CompoundV2Position({
            collateral: collateralToMigrate,
            borrows: initialBorrows,
            paths: paths
        });
        uint256 flashEstimate = 400e6;
        migrator.migrate(compoundV2Position, flashEstimate);

        // Check v2 balances
        assertEq(cUNI.balanceOf(borrower), cUNIPre - migrateAmount, "Amount of cUNI should have been migrated");
        assertEq(cDAI.borrowBalanceCurrent(borrower), 0e18, "Remainder of tokens");

        // Check v3 balances
        assertApproxEqRel(comet.collateralBalanceOf(borrower, address(uni)), 199e18, 0.01e18, "v3 collateral balance");
        // Approximate assertion because of slippage from DAI to USDC
        assertApproxEqRel(comet.borrowBalanceOf(borrower), 350e6 * 1.0001, 0.01e18, "v3 borrow balance");
    }

    function preflightChecks() internal {
        require(comet.collateralBalanceOf(borrower, address(uni)) == 0, "no starting uni collateral balance");
        require(comet.collateralBalanceOf(borrower, address(weth)) == 0, "no starting weth collateral balance");
        require(comet.borrowBalanceOf(borrower) == 0, "no starting v3 borrow balance");
        migrator.sweep(IERC20(0x0000000000000000000000000000000000000000));
        require(address(migrator).balance == 0, "no starting v3 eth");
    }
}
