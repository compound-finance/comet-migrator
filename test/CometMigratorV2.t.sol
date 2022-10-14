// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import "forge-std/Script.sol";
import "../src/CometMigratorV2.sol";
import "forge-std/Test.sol";
import "./MainnetConstants.t.sol";
import "./PositorV2.t.sol";
import "./TokensV2.t.sol";

contract CometMigratorV2Test is Positor {
    event Migrated(
        address indexed user,
        CometMigratorV2.CompoundV2Position compoundV2Position,
        uint256 flashAmount,
        uint256 flashAmountWithFee);

    address public constant borrower = address(0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266);

    /* ===== Migrator V1 Tests ===== */

    function testMigrateSimpleUniPosition() public {
        // Posit
        CometMigratorV2.CompoundV2Collateral[] memory initialCollateral = new CometMigratorV2.CompoundV2Collateral[](1);
        initialCollateral[0] = CometMigratorV2.CompoundV2Collateral({
            cToken: cUNI,
            amount: 300e18 // ~ $5 * 300 = ~$1500 75% collateral factor = $1,000
        });
        CometMigratorV2.CompoundV2Borrow[] memory initialBorrows = new CometMigratorV2.CompoundV2Borrow[](1);
        initialBorrows[0] = CometMigratorV2.CompoundV2Borrow({
            cToken: cUSDC,
            amount: 700e6
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
        CometMigratorV2.CompoundV2Borrow[] memory borrowsToMigrate = new CometMigratorV2.CompoundV2Borrow[](1);
        borrowsToMigrate[0] = CometMigratorV2.CompoundV2Borrow({
            cToken: cUSDC,
            amount: 600e6
        });
        bytes[] memory paths = new bytes[](1);
        paths[0] = "";
        CometMigratorV2.CompoundV2Position memory compoundV2Position = CometMigratorV2.CompoundV2Position({
            collateral: collateralToMigrate,
            borrows: borrowsToMigrate,
            paths: paths
        });

        // Check event
        vm.expectEmit(true, false, false, true);
        emit Migrated(borrower, compoundV2Position, 600e6, 600e6 * 1.0001);

        vm.startPrank(borrower);
        cUNI.approve(address(migrator), type(uint256).max);
        comet.allow(address(migrator), true);
        migrator.migrate(compoundV2Position, 600e6);

        // Check v2 balances
        assertEq(cUNI.balanceOf(borrower), cUNIPre - migrateAmount, "Amount of cUNI should have been migrated");
        assertEq(cUSDC.borrowBalanceCurrent(borrower), 100e6, "Remainder of tokens");

        // Check v3 balances
        assertApproxEqRel(comet.collateralBalanceOf(borrower, address(uni)), 199e18, 0.01e18, "v3 collateral balance");
        assertEq(comet.borrowBalanceOf(borrower), 600e6 * 1.0001, "v3 borrow balance");
    }

    function testMigrateSimpleEthPosition() public {
        // Posit
        CometMigratorV2.CompoundV2Collateral[] memory initialCollateral = new CometMigratorV2.CompoundV2Collateral[](1);
        initialCollateral[0] = CometMigratorV2.CompoundV2Collateral({
            cToken: cETH,
            amount: 1e18 // ~ $2000 * 1 = ~$2000 82-83% collateral factor = $1,600
        });
        CometMigratorV2.CompoundV2Borrow[] memory initialBorrows = new CometMigratorV2.CompoundV2Borrow[](1);
        initialBorrows[0] = CometMigratorV2.CompoundV2Borrow({
            cToken: cUSDC,
            amount: 700e6
        });
        posit(Posit({
            borrower: borrower,
            collateral: initialCollateral,
            borrows: initialBorrows
        }));

        uint256 cETHPre = cETH.balanceOf(borrower);
        preflightChecks();

        // Migrate
        CometMigratorV2.CompoundV2Collateral[] memory collateralToMigrate = new CometMigratorV2.CompoundV2Collateral[](1);
        uint256 migrateAmount = amountToTokens(0.6e18, cETH);
        collateralToMigrate[0] = CometMigratorV2.CompoundV2Collateral({
            cToken: cETH,
            amount: migrateAmount
        });
        CometMigratorV2.CompoundV2Borrow[] memory borrowsToMigrate = new CometMigratorV2.CompoundV2Borrow[](1);
        borrowsToMigrate[0] = CometMigratorV2.CompoundV2Borrow({
            cToken: cUSDC,
            amount: 600e6
        });
        bytes[] memory paths = new bytes[](1);
        paths[0] = "";
        CometMigratorV2.CompoundV2Position memory compoundV2Position = CometMigratorV2.CompoundV2Position({
            collateral: collateralToMigrate,
            borrows: borrowsToMigrate,
            paths: paths
        });

        // Check event
        vm.expectEmit(true, false, false, true);
        emit Migrated(borrower, compoundV2Position, 600e6, 600e6 * 1.0001);

        vm.startPrank(borrower);
        cETH.approve(address(migrator), type(uint256).max);
        comet.allow(address(migrator), true);
        migrator.migrate(compoundV2Position, 600e6);

        // Check v2 balances
        assertEq(cETH.balanceOf(borrower), cETHPre - migrateAmount, "Amount of cETH should have been migrated");
        assertEq(cUSDC.borrowBalanceCurrent(borrower), 100e6, "Remainder of tokens");

        // Check v3 balances
        assertApproxEqRel(comet.collateralBalanceOf(borrower, address(weth)), 0.6e18, 0.01e18, "v3 collateral balance");
        assertEq(comet.borrowBalanceOf(borrower), 600e6 * 1.0001, "v3 borrow balance");
    }

    function testMigrateSimpleUniPosition_SecondAsset() public {
        // Posit
        CometMigratorV2.CompoundV2Collateral[] memory initialCollateral = new CometMigratorV2.CompoundV2Collateral[](1);
        initialCollateral[0] = CometMigratorV2.CompoundV2Collateral({
            cToken: cUNI,
            amount: 300e18 // ~ $5 * 300 = ~$1500 75% collateral factor = $1,000
        });
        CometMigratorV2.CompoundV2Borrow[] memory initialBorrows = new CometMigratorV2.CompoundV2Borrow[](1);
        initialBorrows[0] = CometMigratorV2.CompoundV2Borrow({
            cToken: cUSDC,
            amount: 700e6
        });
        posit(Posit({
            borrower: borrower,
            collateral: initialCollateral,
            borrows: initialBorrows
        }));

        uint256 cUNIPre = cUNI.balanceOf(borrower);
        preflightChecks();

        // Migrate
        CometMigratorV2.CompoundV2Collateral[] memory collateralToMigrate = new CometMigratorV2.CompoundV2Collateral[](2);
        uint256 migrateAmount = amountToTokens(199e18, cUNI);
        collateralToMigrate[0] = CometMigratorV2.CompoundV2Collateral({
            cToken: cUNI,
            amount: 0
        });
        collateralToMigrate[1] = CometMigratorV2.CompoundV2Collateral({
            cToken: cUNI,
            amount: migrateAmount
        });
        CometMigratorV2.CompoundV2Borrow[] memory borrowsToMigrate = new CometMigratorV2.CompoundV2Borrow[](1);
        borrowsToMigrate[0] = CometMigratorV2.CompoundV2Borrow({
            cToken: cUSDC,
            amount: 600e6
        });
        bytes[] memory paths = new bytes[](1);
        paths[0] = "";
        CometMigratorV2.CompoundV2Position memory compoundV2Position = CometMigratorV2.CompoundV2Position({
            collateral: collateralToMigrate,
            borrows: borrowsToMigrate,
            paths: paths
        });

        // Check event
        vm.expectEmit(true, false, false, true);
        emit Migrated(borrower, compoundV2Position, 600e6, 600e6 * 1.0001);

        vm.startPrank(borrower);
        cUNI.approve(address(migrator), type(uint256).max);
        comet.allow(address(migrator), true);
        migrator.migrate(compoundV2Position, 600e6);

        // Check v2 balances
        assertEq(cUNI.balanceOf(borrower), cUNIPre - migrateAmount, "Amount of cUNI should have been migrated");
        assertEq(cUSDC.borrowBalanceCurrent(borrower), 100e6, "Remainder of tokens");

        // Check v3 balances
        assertApproxEqRel(comet.collateralBalanceOf(borrower, address(uni)), 199e18, 0.01e18, "v3 collateral balance");
        assertEq(comet.borrowBalanceOf(borrower), 600e6 * 1.0001, "v3 borrow balance");
    }

    function testMigrateSimpleUniPositionMaxCollateral() public {
        // Posit
        CometMigratorV2.CompoundV2Collateral[] memory initialCollateral = new CometMigratorV2.CompoundV2Collateral[](1);
        initialCollateral[0] = CometMigratorV2.CompoundV2Collateral({
            cToken: cUNI,
            amount: 300e18 // ~ $5 * 300 = ~$1500 75% collateral factor = $1,000
        });
        CometMigratorV2.CompoundV2Borrow[] memory initialBorrows = new CometMigratorV2.CompoundV2Borrow[](1);
        initialBorrows[0] = CometMigratorV2.CompoundV2Borrow({
            cToken: cUSDC,
            amount: 700e6
        });
        posit(Posit({
            borrower: borrower,
            collateral: initialCollateral,
            borrows: initialBorrows
        }));

        preflightChecks();

        // Migrate
        CometMigratorV2.CompoundV2Collateral[] memory collateralToMigrate = new CometMigratorV2.CompoundV2Collateral[](1);
        collateralToMigrate[0] = CometMigratorV2.CompoundV2Collateral({
            cToken: cUNI,
            amount: type(uint256).max
        });
        CometMigratorV2.CompoundV2Borrow[] memory borrowsToMigrate = new CometMigratorV2.CompoundV2Borrow[](1);
        borrowsToMigrate[0] = CometMigratorV2.CompoundV2Borrow({
            cToken: cUSDC,
            amount: 700e6
        });
        bytes[] memory paths = new bytes[](1);
        paths[0] = "";
        CometMigratorV2.CompoundV2Position memory compoundV2Position = CometMigratorV2.CompoundV2Position({
            collateral: collateralToMigrate,
            borrows: borrowsToMigrate,
            paths: paths
        });

        // Check event
        vm.expectEmit(true, false, false, true);
        emit Migrated(borrower, compoundV2Position, 700e6, 700e6 * 1.0001);

        vm.startPrank(borrower);
        cUNI.approve(address(migrator), type(uint256).max);
        comet.allow(address(migrator), true);
        migrator.migrate(compoundV2Position, 700e6);

        // Check v2 balances
        assertEq(cUNI.balanceOf(borrower), 0, "Amount of cUNI should have been migrated");
        assertEq(cUSDC.borrowBalanceCurrent(borrower), 0, "Remainder of tokens");

        // Check v3 balances
        assertApproxEqRel(comet.collateralBalanceOf(borrower, address(uni)), 300e18, 0.01e18, "v3 collateral balance");
        assertEq(comet.borrowBalanceOf(borrower), 700e6 * 1.0001, "v3 borrow balance");
    }

    function testMigrateSimpleUniPositionMaxCollateralMaxBorrow() public {
        // Posit
        CometMigratorV2.CompoundV2Collateral[] memory initialCollateral = new CometMigratorV2.CompoundV2Collateral[](1);
        initialCollateral[0] = CometMigratorV2.CompoundV2Collateral({
            cToken: cUNI,
            amount: 300e18 // ~ $5 * 300 = ~$1500 75% collateral factor = $1,000
        });
        CometMigratorV2.CompoundV2Borrow[] memory initialBorrows = new CometMigratorV2.CompoundV2Borrow[](1);
        initialBorrows[0] = CometMigratorV2.CompoundV2Borrow({
            cToken: cUSDC,
            amount: 700e6
        });
        posit(Posit({
            borrower: borrower,
            collateral: initialCollateral,
            borrows: initialBorrows
        }));

        preflightChecks();

        // Migrate
        CometMigratorV2.CompoundV2Collateral[] memory collateralToMigrate = new CometMigratorV2.CompoundV2Collateral[](1);
        collateralToMigrate[0] = CometMigratorV2.CompoundV2Collateral({
            cToken: cUNI,
            amount: type(uint256).max
        });
        CometMigratorV2.CompoundV2Borrow[] memory borrowsToMigrate = new CometMigratorV2.CompoundV2Borrow[](1);
        borrowsToMigrate[0] = CometMigratorV2.CompoundV2Borrow({
            cToken: cUSDC,
            amount: type(uint256).max
        });
        bytes[] memory paths = new bytes[](1);
        paths[0] = "";
        CometMigratorV2.CompoundV2Position memory compoundV2Position = CometMigratorV2.CompoundV2Position({
            collateral: collateralToMigrate,
            borrows: borrowsToMigrate,
            paths: paths
        });

        // Check event
        vm.expectEmit(true, false, false, true);
        emit Migrated(borrower, compoundV2Position, 700e6, 700e6 * 1.0001);

        vm.startPrank(borrower);
        cUNI.approve(address(migrator), type(uint256).max);
        comet.allow(address(migrator), true);
        migrator.migrate(compoundV2Position, 700e6);

        // Check v2 balances
        assertEq(cUNI.balanceOf(borrower), 0, "Amount of cUNI should have been migrated");
        assertEq(cUSDC.borrowBalanceCurrent(borrower), 0, "Remainder of tokens");

        // Check v3 balances
        assertApproxEqRel(comet.collateralBalanceOf(borrower, address(uni)), 300e18, 0.01e18, "v3 collateral balance");
        assertEq(comet.borrowBalanceOf(borrower), 700e6 * 1.0001, "v3 borrow balance");
    }

    function testMigrateSimpleDualPosition_OneAsset() public {
        // Posit
        CometMigratorV2.CompoundV2Collateral[] memory initialCollateral = new CometMigratorV2.CompoundV2Collateral[](2);
        initialCollateral[0] = CometMigratorV2.CompoundV2Collateral({
            cToken: cUNI,
            amount: 300e18 // ~ $5 * 300 = ~$1500 75% collateral factor = $1,000
        });
        initialCollateral[1] = CometMigratorV2.CompoundV2Collateral({
            cToken: cETH,
            amount: 1e18 // ~ $2000 * 1 = ~$2000 82-83% collateral factor = $1,600
        });
        CometMigratorV2.CompoundV2Borrow[] memory initialBorrows = new CometMigratorV2.CompoundV2Borrow[](1);
        initialBorrows[0] = CometMigratorV2.CompoundV2Borrow({
            cToken: cUSDC,
            amount: 1400e6
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
        CometMigratorV2.CompoundV2Borrow[] memory borrowsToMigrate = new CometMigratorV2.CompoundV2Borrow[](1);
        borrowsToMigrate[0] = CometMigratorV2.CompoundV2Borrow({
            cToken: cUSDC,
            amount: 600e6
        });
        bytes[] memory paths = new bytes[](1);
        paths[0] = "";
        CometMigratorV2.CompoundV2Position memory compoundV2Position = CometMigratorV2.CompoundV2Position({
            collateral: collateralToMigrate,
            borrows: borrowsToMigrate,
            paths: paths
        });

        // Check event
        vm.expectEmit(true, false, false, true);
        emit Migrated(borrower, compoundV2Position, 600e6, 600e6 * 1.0001);

        vm.startPrank(borrower);
        cUNI.approve(address(migrator), type(uint256).max);
        comet.allow(address(migrator), true);
        migrator.migrate(compoundV2Position, 600e6);

        // Check v2 balances
        assertEq(cUNI.balanceOf(borrower), cUNIPre - migrateAmount, "Amount of cUNI should have been migrated");
        assertEq(cUSDC.borrowBalanceCurrent(borrower), 800e6, "Remainder of tokens");

        // Check v3 balances
        assertApproxEqRel(comet.collateralBalanceOf(borrower, address(uni)), 199e18, 0.01e18, "v3 collateral balance");
        assertEq(comet.borrowBalanceOf(borrower), 600e6 * 1.0001, "v3 borrow balance");
    }

    function testMigrateSimpleDualPosition_BothAssets() public {
        // Posit
        CometMigratorV2.CompoundV2Collateral[] memory initialCollateral = new CometMigratorV2.CompoundV2Collateral[](2);
        initialCollateral[0] = CometMigratorV2.CompoundV2Collateral({
            cToken: cUNI,
            amount: 300e18 // ~ $5 * 300 = ~$1500 75% collateral factor = $1,000
        });
        initialCollateral[1] = CometMigratorV2.CompoundV2Collateral({
            cToken: cETH,
            amount: 1e18 // ~ $2000 * 1 = ~$2000 82-83% collateral factor = $1,600
        });
        CometMigratorV2.CompoundV2Borrow[] memory initialBorrows = new CometMigratorV2.CompoundV2Borrow[](1);
        initialBorrows[0] = CometMigratorV2.CompoundV2Borrow({
            cToken: cUSDC,
            amount: 1400e6
        });
        posit(Posit({
            borrower: borrower,
            collateral: initialCollateral,
            borrows: initialBorrows
        }));

        uint256 cUNIPre = cUNI.balanceOf(borrower);
        uint256 cETHPre = cETH.balanceOf(borrower);
        preflightChecks();

        // Migrate
        CometMigratorV2.CompoundV2Collateral[] memory collateralToMigrate = new CometMigratorV2.CompoundV2Collateral[](2);
        uint256 uniMigrateAmount = amountToTokens(199e18, cUNI);
        collateralToMigrate[0] = CometMigratorV2.CompoundV2Collateral({
            cToken: cUNI,
            amount: uniMigrateAmount
        });
        uint256 ethMigrateAmount = amountToTokens(0.6e18, cETH);
        collateralToMigrate[1] = CometMigratorV2.CompoundV2Collateral({
            cToken: cETH,
            amount: ethMigrateAmount
        });
        CometMigratorV2.CompoundV2Borrow[] memory borrowsToMigrate = new CometMigratorV2.CompoundV2Borrow[](1);
        borrowsToMigrate[0] = CometMigratorV2.CompoundV2Borrow({
            cToken: cUSDC,
            amount: 1200e6
        });
        bytes[] memory paths = new bytes[](1);
        paths[0] = "";
        CometMigratorV2.CompoundV2Position memory compoundV2Position = CometMigratorV2.CompoundV2Position({
            collateral: collateralToMigrate,
            borrows: borrowsToMigrate,
            paths: paths
        });

        // Check event
        vm.expectEmit(true, false, false, true);
        emit Migrated(borrower, compoundV2Position, 1200e6, 1200e6 * 1.0001);

        vm.startPrank(borrower);
        cUNI.approve(address(migrator), type(uint256).max);
        cETH.approve(address(migrator), type(uint256).max);
        comet.allow(address(migrator), true);
        migrator.migrate(compoundV2Position, 1200e6);

        // Check v2 balances
        assertEq(cUNI.balanceOf(borrower), cUNIPre - uniMigrateAmount, "Amount of cUNI should have been migrated");
        assertEq(cETH.balanceOf(borrower), cETHPre - ethMigrateAmount, "Amount of cETH should have been migrated");
        assertEq(cUSDC.borrowBalanceCurrent(borrower), 200e6, "Remainder of tokens");

        // Check v3 balances
        assertApproxEqRel(comet.collateralBalanceOf(borrower, address(uni)), 199e18, 0.01e18, "v3 collateral balance");
        assertApproxEqRel(comet.collateralBalanceOf(borrower, address(weth)), 0.6e18, 0.01e18, "v3 collateral balance");
        assertEq(comet.borrowBalanceOf(borrower), 1200e6 * 1.0001, "v3 borrow balance");
    }

    function testMigrateSimpleUniPosition_NoApproval() public {
        // Posit
        CometMigratorV2.CompoundV2Collateral[] memory initialCollateral = new CometMigratorV2.CompoundV2Collateral[](1);
        initialCollateral[0] = CometMigratorV2.CompoundV2Collateral({
            cToken: cUNI,
            amount: 300e18 // ~ $5 * 300 = ~$1500 75% collateral factor = $1,000
        });
        CometMigratorV2.CompoundV2Borrow[] memory initialBorrows = new CometMigratorV2.CompoundV2Borrow[](1);
        initialBorrows[0] = CometMigratorV2.CompoundV2Borrow({
            cToken: cUSDC,
            amount: 700e6
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
        CometMigratorV2.CompoundV2Borrow[] memory borrowsToMigrate = new CometMigratorV2.CompoundV2Borrow[](1);
        borrowsToMigrate[0] = CometMigratorV2.CompoundV2Borrow({
            cToken: cUSDC,
            amount: 600e6
        });
        bytes[] memory paths = new bytes[](1);
        paths[0] = "";
        CometMigratorV2.CompoundV2Position memory compoundV2Position = CometMigratorV2.CompoundV2Position({
            collateral: collateralToMigrate,
            borrows: borrowsToMigrate,
            paths: paths
        });
        vm.startPrank(borrower);
        cUNI.approve(address(migrator), 0);
        comet.allow(address(migrator), true);
        vm.expectRevert(stdError.arithmeticError);
        migrator.migrate(compoundV2Position, 600e6);

        // Check v2 balances
        assertEq(cUNI.balanceOf(borrower), cUNIPre, "Amount of cUNI should have been migrated");
        assertEq(cUSDC.borrowBalanceCurrent(borrower), 700e6, "Remainder of tokens");

        // Check v3 balances
        assertEq(comet.collateralBalanceOf(borrower, address(uni)), 0, "v3 collateral balance");
        assertEq(comet.borrowBalanceOf(borrower), 0, "v3 borrow balance");
    }

    function testMigrateSimpleEthPosition_NoApproval() public {
        // Posit
        CometMigratorV2.CompoundV2Collateral[] memory initialCollateral = new CometMigratorV2.CompoundV2Collateral[](1);
        initialCollateral[0] = CometMigratorV2.CompoundV2Collateral({
            cToken: cETH,
            amount: 1e18 // ~ $2000 * 1 = ~$2000 82-83% collateral factor = $1,600
        });
        CometMigratorV2.CompoundV2Borrow[] memory initialBorrows = new CometMigratorV2.CompoundV2Borrow[](1);
        initialBorrows[0] = CometMigratorV2.CompoundV2Borrow({
            cToken: cUSDC,
            amount: 700e6
        });
        posit(Posit({
            borrower: borrower,
            collateral: initialCollateral,
            borrows: initialBorrows
        }));

        uint256 cETHPre = cETH.balanceOf(borrower);
        preflightChecks();

        // Migrate
        CometMigratorV2.CompoundV2Collateral[] memory collateralToMigrate = new CometMigratorV2.CompoundV2Collateral[](1);
        uint256 migrateAmount = amountToTokens(0.6e18, cETH);
        collateralToMigrate[0] = CometMigratorV2.CompoundV2Collateral({
            cToken: cETH,
            amount: migrateAmount
        });
        CometMigratorV2.CompoundV2Borrow[] memory borrowsToMigrate = new CometMigratorV2.CompoundV2Borrow[](1);
        borrowsToMigrate[0] = CometMigratorV2.CompoundV2Borrow({
            cToken: cUSDC,
            amount: 600e6
        });
        bytes[] memory paths = new bytes[](1);
        paths[0] = "";
        CometMigratorV2.CompoundV2Position memory compoundV2Position = CometMigratorV2.CompoundV2Position({
            collateral: collateralToMigrate,
            borrows: borrowsToMigrate,
            paths: paths
        });
        vm.startPrank(borrower);
        cETH.approve(address(migrator), 0);
        comet.allow(address(migrator), true);
        vm.expectRevert(CometMigratorV2.CTokenTransferFailure.selector);
        migrator.migrate(compoundV2Position, 600e6);

        // Check v2 balances
        assertEq(cETH.balanceOf(borrower), cETHPre, "Amount of cETH should have been migrated");
        assertEq(cUSDC.borrowBalanceCurrent(borrower), 700e6, "Remainder of tokens");

        // Check v3 balances
        assertEq(comet.collateralBalanceOf(borrower, address(weth)), 0, "v3 collateral balance");
        assertEq(comet.borrowBalanceOf(borrower), 0, "v3 borrow balance");
    }

    function testMigrateSimpleUniPosition_InsufficientCollateral() public {
        // Posit
        CometMigratorV2.CompoundV2Collateral[] memory initialCollateral = new CometMigratorV2.CompoundV2Collateral[](1);
        initialCollateral[0] = CometMigratorV2.CompoundV2Collateral({
            cToken: cUNI,
            amount: 300e18 // ~ $5 * 300 = ~$1500 75% collateral factor = $1,000
        });
        CometMigratorV2.CompoundV2Borrow[] memory initialBorrows = new CometMigratorV2.CompoundV2Borrow[](1);
        initialBorrows[0] = CometMigratorV2.CompoundV2Borrow({
            cToken: cUSDC,
            amount: 700e6
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
        uint256 migrateAmount = amountToTokens(400e18, cUNI);
        collateralToMigrate[0] = CometMigratorV2.CompoundV2Collateral({
            cToken: cUNI,
            amount: migrateAmount
        });
        CometMigratorV2.CompoundV2Borrow[] memory borrowsToMigrate = new CometMigratorV2.CompoundV2Borrow[](1);
        borrowsToMigrate[0] = CometMigratorV2.CompoundV2Borrow({
            cToken: cUSDC,
            amount: 600e6
        });
        bytes[] memory paths = new bytes[](1);
        paths[0] = "";
        CometMigratorV2.CompoundV2Position memory compoundV2Position = CometMigratorV2.CompoundV2Position({
            collateral: collateralToMigrate,
            borrows: borrowsToMigrate,
            paths: paths
        });
        vm.startPrank(borrower);
        cUNI.approve(address(migrator), type(uint256).max);
        comet.allow(address(migrator), true);
        vm.expectRevert(abi.encodeWithSelector(CTokenLike.TransferComptrollerRejection.selector, 4));
        migrator.migrate(compoundV2Position, 600e6);

        // Check v2 balances
        assertEq(cUNI.balanceOf(borrower), cUNIPre, "Amount of cUNI should have been migrated");
        assertEq(cUSDC.borrowBalanceCurrent(borrower), 700e6, "Remainder of tokens");

        // Check v3 balances
        assertEq(comet.collateralBalanceOf(borrower, address(uni)), 0, "v3 collateral balance");
        assertEq(comet.borrowBalanceOf(borrower), 0, "v3 borrow balance");
    }

    function testMigrateSimpleEthPosition_InsufficientCollateral() public {
        // Posit
        CometMigratorV2.CompoundV2Collateral[] memory initialCollateral = new CometMigratorV2.CompoundV2Collateral[](1);
        initialCollateral[0] = CometMigratorV2.CompoundV2Collateral({
            cToken: cETH,
            amount: 1e18 // ~ $2000 * 1 = ~$2000 82-83% collateral factor = $1,600
        });
        CometMigratorV2.CompoundV2Borrow[] memory initialBorrows = new CometMigratorV2.CompoundV2Borrow[](1);
        initialBorrows[0] = CometMigratorV2.CompoundV2Borrow({
            cToken: cUSDC,
            amount: 700e6
        });
        posit(Posit({
            borrower: borrower,
            collateral: initialCollateral,
            borrows: initialBorrows
        }));

        uint256 cETHPre = cETH.balanceOf(borrower);
        preflightChecks();

        // Migrate
        CometMigratorV2.CompoundV2Collateral[] memory collateralToMigrate = new CometMigratorV2.CompoundV2Collateral[](1);
        uint256 migrateAmount = amountToTokens(200e18, cETH);
        collateralToMigrate[0] = CometMigratorV2.CompoundV2Collateral({
            cToken: cETH,
            amount: migrateAmount
        });
        CometMigratorV2.CompoundV2Borrow[] memory borrowsToMigrate = new CometMigratorV2.CompoundV2Borrow[](1);
        borrowsToMigrate[0] = CometMigratorV2.CompoundV2Borrow({
            cToken: cUSDC,
            amount: 600e6
        });
        bytes[] memory paths = new bytes[](1);
        paths[0] = "";
        CometMigratorV2.CompoundV2Position memory compoundV2Position = CometMigratorV2.CompoundV2Position({
            collateral: collateralToMigrate,
            borrows: borrowsToMigrate,
            paths: paths
        });
        vm.startPrank(borrower);
        cETH.approve(address(migrator), type(uint256).max);
        comet.allow(address(migrator), true);
        vm.expectRevert(CometMigratorV2.CTokenTransferFailure.selector);
        migrator.migrate(compoundV2Position, 600e6);

        // Check v2 balances
        assertEq(cETH.balanceOf(borrower), cETHPre, "Amount of cETH should have been migrated");
        assertEq(cUSDC.borrowBalanceCurrent(borrower), 700e6, "Remainder of tokens");

        // Check v3 balances
        assertEq(comet.collateralBalanceOf(borrower, address(weth)), 0, "v3 collateral balance");
        assertEq(comet.borrowBalanceOf(borrower), 0, "v3 borrow balance");
    }

    function testMigrateSimpleUniPosition_NoCometApproval() public {
        // Posit
        CometMigratorV2.CompoundV2Collateral[] memory initialCollateral = new CometMigratorV2.CompoundV2Collateral[](1);
        initialCollateral[0] = CometMigratorV2.CompoundV2Collateral({
            cToken: cUNI,
            amount: 300e18 // ~ $5 * 300 = ~$1500 75% collateral factor = $1,000
        });
        CometMigratorV2.CompoundV2Borrow[] memory initialBorrows = new CometMigratorV2.CompoundV2Borrow[](1);
        initialBorrows[0] = CometMigratorV2.CompoundV2Borrow({
            cToken: cUSDC,
            amount: 700e6
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
        uint256 migrateAmount = amountToTokens(200e18, cUNI);
        collateralToMigrate[0] = CometMigratorV2.CompoundV2Collateral({
            cToken: cUNI,
            amount: migrateAmount
        });
        CometMigratorV2.CompoundV2Borrow[] memory borrowsToMigrate = new CometMigratorV2.CompoundV2Borrow[](1);
        borrowsToMigrate[0] = CometMigratorV2.CompoundV2Borrow({
            cToken: cUSDC,
            amount: 600e6
        });
        bytes[] memory paths = new bytes[](1);
        paths[0] = "";
        CometMigratorV2.CompoundV2Position memory compoundV2Position = CometMigratorV2.CompoundV2Position({
            collateral: collateralToMigrate,
            borrows: borrowsToMigrate,
            paths: paths
        });
        vm.startPrank(borrower);
        cUNI.approve(address(migrator), type(uint256).max);
        vm.expectRevert(Comet.Unauthorized.selector);
        migrator.migrate(compoundV2Position, 600e6);

        // Check v2 balances
        assertEq(cUNI.balanceOf(borrower), cUNIPre, "Amount of cUNI should have been migrated");
        assertEq(cUSDC.borrowBalanceCurrent(borrower), 700e6, "Remainder of tokens");

        // Check v3 balances
        assertEq(comet.collateralBalanceOf(borrower, address(uni)), 0, "v3 collateral balance");
        assertEq(comet.borrowBalanceOf(borrower), 0, "v3 borrow balance");
    }

    function testMigrateSimpleUniPosition_InsufficientLiquidity() public {
        // Posit
        CometMigratorV2.CompoundV2Collateral[] memory initialCollateral = new CometMigratorV2.CompoundV2Collateral[](1);
        initialCollateral[0] = CometMigratorV2.CompoundV2Collateral({
            cToken: cUNI,
            amount: 300e18 // ~ $5 * 300 = ~$1500 75% collateral factor = $1,000
        });
        CometMigratorV2.CompoundV2Borrow[] memory initialBorrows = new CometMigratorV2.CompoundV2Borrow[](1);
        initialBorrows[0] = CometMigratorV2.CompoundV2Borrow({
            cToken: cUSDC,
            amount: 700e6
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
        uint256 migrateAmount = amountToTokens(200e18, cUNI);
        collateralToMigrate[0] = CometMigratorV2.CompoundV2Collateral({
            cToken: cUNI,
            amount: migrateAmount
        });
        CometMigratorV2.CompoundV2Borrow[] memory borrowsToMigrate = new CometMigratorV2.CompoundV2Borrow[](1);
        borrowsToMigrate[0] = CometMigratorV2.CompoundV2Borrow({
            cToken: cUSDC,
            amount: 0e6
        });
        bytes[] memory paths = new bytes[](1);
        paths[0] = "";
        CometMigratorV2.CompoundV2Position memory compoundV2Position = CometMigratorV2.CompoundV2Position({
            collateral: collateralToMigrate,
            borrows: borrowsToMigrate,
            paths: paths
        });
        vm.startPrank(borrower);
        cUNI.approve(address(migrator), type(uint256).max);
        comet.allow(address(migrator), true);
        vm.expectRevert(abi.encodeWithSelector(CTokenLike.TransferComptrollerRejection.selector, 4));
        migrator.migrate(compoundV2Position, 0e6);

        // Check v2 balances
        assertEq(cUNI.balanceOf(borrower), cUNIPre, "Amount of cUNI should have been migrated");
        assertEq(cUSDC.borrowBalanceCurrent(borrower), 700e6, "Remainder of tokens");

        // Check v3 balances
        assertEq(comet.collateralBalanceOf(borrower, address(uni)), 0, "v3 collateral balance");
        assertEq(comet.borrowBalanceOf(borrower), 0, "v3 borrow balance");
    }

    function testMigrateSimpleUniPosition_ExcessiveRepay() public {
        // Posit
        CometMigratorV2.CompoundV2Collateral[] memory initialCollateral = new CometMigratorV2.CompoundV2Collateral[](1);
        initialCollateral[0] = CometMigratorV2.CompoundV2Collateral({
            cToken: cUNI,
            amount: 300e18 // ~ $5 * 300 = ~$1500 75% collateral factor = $1,000
        });
        CometMigratorV2.CompoundV2Borrow[] memory initialBorrows = new CometMigratorV2.CompoundV2Borrow[](1);
        initialBorrows[0] = CometMigratorV2.CompoundV2Borrow({
            cToken: cUSDC,
            amount: 700e6
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
        uint256 migrateAmount = amountToTokens(200e18, cUNI);
        collateralToMigrate[0] = CometMigratorV2.CompoundV2Collateral({
            cToken: cUNI,
            amount: migrateAmount
        });
        CometMigratorV2.CompoundV2Borrow[] memory borrowsToMigrate = new CometMigratorV2.CompoundV2Borrow[](1);
        borrowsToMigrate[0] = CometMigratorV2.CompoundV2Borrow({
            cToken: cUSDC,
            amount: 800e6
        });
        bytes[] memory paths = new bytes[](1);
        paths[0] = "";
        CometMigratorV2.CompoundV2Position memory compoundV2Position = CometMigratorV2.CompoundV2Position({
            collateral: collateralToMigrate,
            borrows: borrowsToMigrate,
            paths: paths
        });
        vm.startPrank(borrower);
        cUNI.approve(address(migrator), type(uint256).max);
        comet.allow(address(migrator), true);
        vm.expectRevert(abi.encodeWithSelector(CometMigratorV2.CompoundV2Error.selector, 0, 9));
        migrator.migrate(compoundV2Position, 800e6);

        // Check v2 balances
        assertEq(cUNI.balanceOf(borrower), cUNIPre, "Amount of cUNI should have been migrated");
        assertEq(cUSDC.borrowBalanceCurrent(borrower), 700e6, "Remainder of tokens");

        // Check v3 balances
        assertEq(comet.collateralBalanceOf(borrower, address(uni)), 0, "v3 collateral balance");
        assertEq(comet.borrowBalanceOf(borrower), 0, "v3 borrow balance");
    }

    function testMigrateSimpleUniPosition_UnlistedCollateral() public {
        // Posit
        CometMigratorV2.CompoundV2Collateral[] memory initialCollateral = new CometMigratorV2.CompoundV2Collateral[](1);
        initialCollateral[0] = CometMigratorV2.CompoundV2Collateral({
            cToken: cUNI,
            amount: 300e18 // ~ $5 * 300 = ~$1500 75% collateral factor = $1,000
        });
        CometMigratorV2.CompoundV2Borrow[] memory initialBorrows = new CometMigratorV2.CompoundV2Borrow[](1);
        initialBorrows[0] = CometMigratorV2.CompoundV2Borrow({
            cToken: cUSDC,
            amount: 700e6
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
        collateralToMigrate[0] = CometMigratorV2.CompoundV2Collateral({
            cToken: CTokenLike(address(uni)),
            amount: 0
        });
        CometMigratorV2.CompoundV2Borrow[] memory borrowsToMigrate = new CometMigratorV2.CompoundV2Borrow[](1);
        borrowsToMigrate[0] = CometMigratorV2.CompoundV2Borrow({
            cToken: cUSDC,
            amount: 800e6
        });
        bytes[] memory paths = new bytes[](1);
        paths[0] = "";
        CometMigratorV2.CompoundV2Position memory compoundV2Position = CometMigratorV2.CompoundV2Position({
            collateral: collateralToMigrate,
            borrows: borrowsToMigrate,
            paths: paths
        });
        vm.startPrank(borrower);
        cUNI.approve(address(migrator), type(uint256).max);
        comet.allow(address(migrator), true);
        vm.expectRevert(abi.encodeWithSelector(CometMigratorV2.CompoundV2Error.selector, 0, 9));
        migrator.migrate(compoundV2Position, 800e6);

        // Check v2 balances
        assertEq(cUNI.balanceOf(borrower), cUNIPre, "Amount of cUNI should have been migrated");
        assertEq(cUSDC.borrowBalanceCurrent(borrower), 700e6, "Remainder of tokens");

        // Check v3 balances
        assertEq(comet.collateralBalanceOf(borrower, address(uni)), 0, "v3 collateral balance");
        assertEq(comet.borrowBalanceOf(borrower), 0, "v3 borrow balance");
    }

    function testMigrateSimpleUniPosition_NoTokenCollateral() public {
        // Posit
        CometMigratorV2.CompoundV2Collateral[] memory initialCollateral = new CometMigratorV2.CompoundV2Collateral[](1);
        initialCollateral[0] = CometMigratorV2.CompoundV2Collateral({
            cToken: cUNI,
            amount: 300e18 // ~ $5 * 300 = ~$1500 75% collateral factor = $1,000
        });
        CometMigratorV2.CompoundV2Borrow[] memory initialBorrows = new CometMigratorV2.CompoundV2Borrow[](1);
        initialBorrows[0] = CometMigratorV2.CompoundV2Borrow({
            cToken: cUSDC,
            amount: 700e6
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
        collateralToMigrate[0] = CometMigratorV2.CompoundV2Collateral({
            cToken: CTokenLike(0x0000000000000000000000000000000000000000),
            amount: 0
        });
        CometMigratorV2.CompoundV2Borrow[] memory borrowsToMigrate = new CometMigratorV2.CompoundV2Borrow[](1);
        borrowsToMigrate[0] = CometMigratorV2.CompoundV2Borrow({
            cToken: cUSDC,
            amount: 800e6
        });
        bytes[] memory paths = new bytes[](1);
        paths[0] = "";
        CometMigratorV2.CompoundV2Position memory compoundV2Position = CometMigratorV2.CompoundV2Position({
            collateral: collateralToMigrate,
            borrows: borrowsToMigrate,
            paths: paths
        });
        vm.startPrank(borrower);
        cUNI.approve(address(migrator), type(uint256).max);
        comet.allow(address(migrator), true);
        vm.expectRevert(abi.encodeWithSelector(CometMigratorV2.CompoundV2Error.selector, 0, 9));
        migrator.migrate(compoundV2Position, 800e6);

        // Check v2 balances
        assertEq(cUNI.balanceOf(borrower), cUNIPre, "Amount of cUNI should have been migrated");
        assertEq(cUSDC.borrowBalanceCurrent(borrower), 700e6, "Remainder of tokens");

        // Check v3 balances
        assertEq(comet.collateralBalanceOf(borrower, address(uni)), 0, "v3 collateral balance");
        assertEq(comet.borrowBalanceOf(borrower), 0, "v3 borrow balance");
    }

    function testMigrateSimpleUniPosition_NoMovement() public {
        // Posit
        CometMigratorV2.CompoundV2Collateral[] memory initialCollateral = new CometMigratorV2.CompoundV2Collateral[](1);
        initialCollateral[0] = CometMigratorV2.CompoundV2Collateral({
            cToken: cUNI,
            amount: 300e18 // ~ $5 * 300 = ~$1500 75% collateral factor = $1,000
        });
        CometMigratorV2.CompoundV2Borrow[] memory initialBorrows = new CometMigratorV2.CompoundV2Borrow[](1);
        initialBorrows[0] = CometMigratorV2.CompoundV2Borrow({
            cToken: cUSDC,
            amount: 700e6
        });
        posit(Posit({
            borrower: borrower,
            collateral: initialCollateral,
            borrows: initialBorrows
        }));

        uint256 cUNIPre = cUNI.balanceOf(borrower);
        preflightChecks();

        // Migrate
        CometMigratorV2.CompoundV2Position memory compoundV2Position = CometMigratorV2.CompoundV2Position({
            collateral: new CometMigratorV2.CompoundV2Collateral[](0),
            borrows: new CometMigratorV2.CompoundV2Borrow[](0),
            paths: new bytes[](0)
        });
        vm.startPrank(borrower);
        cUNI.approve(address(migrator), type(uint256).max);
        comet.allow(address(migrator), true);
        migrator.migrate(compoundV2Position, 0e6);

        // Check v2 balances
        assertEq(cUNI.balanceOf(borrower), cUNIPre, "Amount of cUNI should have been migrated");
        assertEq(cUSDC.borrowBalanceCurrent(borrower), 700e6, "Remainder of tokens");

        // Check v3 balances
        assertEq(comet.collateralBalanceOf(borrower, address(uni)), 0, "v3 collateral balance");
        assertEq(comet.borrowBalanceOf(borrower), 0, "v3 borrow balance");
    }

    function testMigrateSimpleDualPosition_HalfAndHalf() public {
        // Posit
        CometMigratorV2.CompoundV2Collateral[] memory initialCollateral = new CometMigratorV2.CompoundV2Collateral[](2);
        initialCollateral[0] = CometMigratorV2.CompoundV2Collateral({
            cToken: cUNI,
            amount: 300e18 // ~ $5 * 300 = ~$1500 75% collateral factor = $1,000
        });
        initialCollateral[1] = CometMigratorV2.CompoundV2Collateral({
            cToken: cETH,
            amount: 1e18 // ~ $2000 * 1 = ~$2000 82-83% collateral factor = $1,600
        });
        CometMigratorV2.CompoundV2Borrow[] memory initialBorrows = new CometMigratorV2.CompoundV2Borrow[](1);
        initialBorrows[0] = CometMigratorV2.CompoundV2Borrow({
            cToken: cUSDC,
            amount: 1400e6
        });
        posit(Posit({
            borrower: borrower,
            collateral: initialCollateral,
            borrows: initialBorrows
        }));

        uint256 cUNIPre = cUNI.balanceOf(borrower);
        uint256 cETHPre = cETH.balanceOf(borrower);
        preflightChecks();

        // Migration 0
        CometMigratorV2.CompoundV2Collateral[] memory collateralToMigrate0 = new CometMigratorV2.CompoundV2Collateral[](2);
        uint256 uniMigrateAmount0 = amountToTokens(100e18, cUNI);
        collateralToMigrate0[0] = CometMigratorV2.CompoundV2Collateral({
            cToken: cUNI,
            amount: uniMigrateAmount0
        });
        uint256 ethMigrateAmount0 = amountToTokens(0.3e18, cETH);
        collateralToMigrate0[1] = CometMigratorV2.CompoundV2Collateral({
            cToken: cETH,
            amount: ethMigrateAmount0
        });
        CometMigratorV2.CompoundV2Borrow[] memory borrowsToMigrate0 = new CometMigratorV2.CompoundV2Borrow[](1);
        borrowsToMigrate0[0] = CometMigratorV2.CompoundV2Borrow({
            cToken: cUSDC,
            amount: 650e6
        });
        bytes[] memory paths0 = new bytes[](1);
        paths0[0] = "";
        CometMigratorV2.CompoundV2Position memory compoundV2Position0 = CometMigratorV2.CompoundV2Position({
            collateral: collateralToMigrate0,
            borrows: borrowsToMigrate0,
            paths: paths0
        });

        // Migration 1
        CometMigratorV2.CompoundV2Collateral[] memory collateralToMigrate1 = new CometMigratorV2.CompoundV2Collateral[](2);
        uint256 uniMigrateAmount1 = amountToTokens(99e18, cUNI);
        collateralToMigrate1[0] = CometMigratorV2.CompoundV2Collateral({
            cToken: cUNI,
            amount: uniMigrateAmount1
        });
        uint256 ethMigrateAmount1 = amountToTokens(0.3e18, cETH);
        collateralToMigrate1[1] = CometMigratorV2.CompoundV2Collateral({
            cToken: cETH,
            amount: ethMigrateAmount1
        });
        CometMigratorV2.CompoundV2Borrow[] memory borrowsToMigrate1 = new CometMigratorV2.CompoundV2Borrow[](1);
        borrowsToMigrate1[0] = CometMigratorV2.CompoundV2Borrow({
            cToken: cUSDC,
            amount: 550e6
        });
        bytes[] memory paths1 = new bytes[](1);
        paths1[0] = "";
        CometMigratorV2.CompoundV2Position memory compoundV2Position1 = CometMigratorV2.CompoundV2Position({
            collateral: collateralToMigrate1,
            borrows: borrowsToMigrate1,
            paths: paths1
        });

        vm.startPrank(borrower);
        cUNI.approve(address(migrator), type(uint256).max);
        cETH.approve(address(migrator), type(uint256).max);
        comet.allow(address(migrator), true);

        // Check event 0
        vm.expectEmit(true, false, false, true);
        emit Migrated(borrower, compoundV2Position0, 650e6, 650e6 * 1.0001);

        // Check event 1
        vm.expectEmit(true, false, false, true);
        emit Migrated(borrower, compoundV2Position1, 550e6, 550e6 * 1.0001);

        // Migration 0
        migrator.migrate(compoundV2Position0, 650e6);

        // Check v2 balances
        assertEq(cUNI.balanceOf(borrower), cUNIPre - uniMigrateAmount0, "Amount of cUNI should have been migrated first");
        assertEq(cETH.balanceOf(borrower), cETHPre - ethMigrateAmount0, "Amount of cETH should have been migrated first");
        assertEq(cUSDC.borrowBalanceCurrent(borrower), 750e6, "Remainder of tokens");

        // Check v3 balances
        assertApproxEqRel(comet.collateralBalanceOf(borrower, address(uni)), 100e18, 0.01e18, "v3 collateral balance");
        assertApproxEqRel(comet.collateralBalanceOf(borrower, address(weth)), 0.3e18, 0.01e18, "v3 collateral balance");
        assertEq(comet.borrowBalanceOf(borrower), 650e6 * 1.0001, "v3 borrow balance");

        // Migration 1
        migrator.migrate(compoundV2Position1, 550e6);

        // Check v2 balances
        assertEq(cUNI.balanceOf(borrower), cUNIPre - uniMigrateAmount0 - uniMigrateAmount1, "Amount of cUNI should have been migrated both");
        assertEq(cETH.balanceOf(borrower), cETHPre - ethMigrateAmount0 - ethMigrateAmount1, "Amount of cETH should have been migrated both");
        assertEq(cUSDC.borrowBalanceCurrent(borrower), 200e6, "Remainder of tokens");

        // Check v3 balances
        assertApproxEqRel(comet.collateralBalanceOf(borrower, address(uni)), 199e18, 0.01e18, "v3 collateral balance");
        assertApproxEqRel(comet.collateralBalanceOf(borrower, address(weth)), 0.6e18, 0.01e18, "v3 collateral balance");
        assertEq(comet.borrowBalanceOf(borrower), 1200e6 * 1.0001, "v3 borrow balance");
    }

    function testMigrateSimpleDualPosition_NoCollateralSecondTime() public {
        // Posit
        CometMigratorV2.CompoundV2Collateral[] memory initialCollateral = new CometMigratorV2.CompoundV2Collateral[](2);
        initialCollateral[0] = CometMigratorV2.CompoundV2Collateral({
            cToken: cUNI,
            amount: 300e18 // ~ $5 * 300 = ~$1500 75% collateral factor = $1,000
        });
        initialCollateral[1] = CometMigratorV2.CompoundV2Collateral({
            cToken: cETH,
            amount: 1e18 // ~ $2000 * 1 = ~$2000 82-83% collateral factor = $1,600
        });
        CometMigratorV2.CompoundV2Borrow[] memory initialBorrows = new CometMigratorV2.CompoundV2Borrow[](1);
        initialBorrows[0] = CometMigratorV2.CompoundV2Borrow({
            cToken: cUSDC,
            amount: 1400e6
        });
        posit(Posit({
            borrower: borrower,
            collateral: initialCollateral,
            borrows: initialBorrows
        }));

        uint256 cUNIPre = cUNI.balanceOf(borrower);
        uint256 cETHPre = cETH.balanceOf(borrower);
        preflightChecks();

        // Migration 0
        CometMigratorV2.CompoundV2Collateral[] memory collateralToMigrate0 = new CometMigratorV2.CompoundV2Collateral[](2);
        uint256 uniMigrateAmount0 = amountToTokens(199e18, cUNI);
        collateralToMigrate0[0] = CometMigratorV2.CompoundV2Collateral({
            cToken: cUNI,
            amount: uniMigrateAmount0
        });
        uint256 ethMigrateAmount0 = amountToTokens(0.6e18, cETH);
        collateralToMigrate0[1] = CometMigratorV2.CompoundV2Collateral({
            cToken: cETH,
            amount: ethMigrateAmount0
        });
        CometMigratorV2.CompoundV2Borrow[] memory borrowsToMigrate0 = new CometMigratorV2.CompoundV2Borrow[](1);
        borrowsToMigrate0[0] = CometMigratorV2.CompoundV2Borrow({
            cToken: cUSDC,
            amount: 1200e6
        });
        bytes[] memory paths0 = new bytes[](1);
        paths0[0] = "";
        CometMigratorV2.CompoundV2Position memory compoundV2Position0 = CometMigratorV2.CompoundV2Position({
            collateral: collateralToMigrate0,
            borrows: borrowsToMigrate0,
            paths: paths0
        });

        // Migration 1
        CometMigratorV2.CompoundV2Borrow[] memory borrowsToMigrate1 = new CometMigratorV2.CompoundV2Borrow[](1);
        borrowsToMigrate1[0] = CometMigratorV2.CompoundV2Borrow({
            cToken: cUSDC,
            amount: 200e6
        });
        bytes[] memory paths1 = new bytes[](1);
        paths1[0] = "";
        CometMigratorV2.CompoundV2Position memory compoundV2Position1 = CometMigratorV2.CompoundV2Position({
            collateral: new CometMigratorV2.CompoundV2Collateral[](0),
            borrows: borrowsToMigrate1,
            paths: paths1
        });

        vm.startPrank(borrower);
        cUNI.approve(address(migrator), type(uint256).max);
        cETH.approve(address(migrator), type(uint256).max);
        comet.allow(address(migrator), true);

        // Check event 0
        vm.expectEmit(true, false, false, true);
        emit Migrated(borrower, compoundV2Position0, 1200e6, 1200e6 * 1.0001);

        // Check event 1
        vm.expectEmit(true, false, false, true);
        emit Migrated(borrower, compoundV2Position1, 200e6, 200e6 * 1.0001);

        // Migration 0
        migrator.migrate(compoundV2Position0, 1200e6);

        // Check v2 balances
        assertEq(cUNI.balanceOf(borrower), cUNIPre - uniMigrateAmount0, "Amount of cUNI should have been migrated first");
        assertEq(cETH.balanceOf(borrower), cETHPre - ethMigrateAmount0, "Amount of cETH should have been migrated first");
        assertEq(cUSDC.borrowBalanceCurrent(borrower), 200e6, "Remainder of tokens");

        // Check v3 balances
        assertApproxEqRel(comet.collateralBalanceOf(borrower, address(uni)), 199e18, 0.01e18, "v3 collateral balance");
        assertApproxEqRel(comet.collateralBalanceOf(borrower, address(weth)), 0.6e18, 0.01e18, "v3 collateral balance");
        assertEq(comet.borrowBalanceOf(borrower), 1200e6 * 1.0001, "v3 borrow balance");

        // Migration 1 [No collateral moved, but still okay]
        migrator.migrate(compoundV2Position1, 200e6);

        // Check v2 balances
        assertEq(cUNI.balanceOf(borrower), cUNIPre - uniMigrateAmount0, "Amount of cUNI should have been migrated both");
        assertEq(cETH.balanceOf(borrower), cETHPre - ethMigrateAmount0, "Amount of cETH should have been migrated both");
        assertEq(cUSDC.borrowBalanceCurrent(borrower), 0e6, "Remainder of tokens");

        // Check v3 balances
        assertApproxEqRel(comet.collateralBalanceOf(borrower, address(uni)), 199e18, 0.01e18, "v3 collateral balance");
        assertApproxEqRel(comet.collateralBalanceOf(borrower, address(weth)), 0.6e18, 0.01e18, "v3 collateral balance");
        assertEq(comet.borrowBalanceOf(borrower), 1400e6 * 1.0001, "v3 borrow balance");
    }

    function testReentrancyOne_CallingCallbackDirectly() public {
        // Posit
        CometMigratorV2.CompoundV2Collateral[] memory initialCollateral = new CometMigratorV2.CompoundV2Collateral[](1);
        initialCollateral[0] = CometMigratorV2.CompoundV2Collateral({
            cToken: cUNI,
            amount: 1000e18 // ~ $5 * 1000 = ~$5000 75% collateral factor = $3,750
        });
        CometMigratorV2.CompoundV2Borrow[] memory initialBorrows = new CometMigratorV2.CompoundV2Borrow[](1);
        initialBorrows[0] = CometMigratorV2.CompoundV2Borrow({
            cToken: cUSDC,
            amount: 1400e6
        });
        posit(Posit({
            borrower: borrower,
            collateral: initialCollateral,
            borrows: initialBorrows
        }));

        uint256 cETHPre = cETH.balanceOf(borrower);
        preflightChecks();

        vm.expectRevert(abi.encodeWithSelector(CometMigrator.Reentrancy.selector, 1));
        migrator.uniswapV3FlashCallback(0, 0, "");

        // Check v2 balances
        assertEq(cETH.balanceOf(borrower), cETHPre, "Amount of cETH should have been migrated");
        assertEq(cUSDC.borrowBalanceCurrent(borrower), 1400e6, "Remainder of tokens");

        // Check v3 balances
        assertEq(comet.collateralBalanceOf(borrower, address(weth)), 0, "v3 collateral balance");
        assertEq(comet.borrowBalanceOf(borrower), 0, "v3 borrow balance");
    }

    function testSweepCToken() public {
        // Posit
        CometMigratorV2.CompoundV2Collateral[] memory initialCollateral = new CometMigratorV2.CompoundV2Collateral[](0);
        CometMigratorV2.CompoundV2Borrow[] memory initialBorrows = new CometMigratorV2.CompoundV2Borrow[](0);
        posit(Posit({
            borrower: borrower,
            collateral: initialCollateral,
            borrows: initialBorrows
        }));

        preflightChecks();

        uint256 cUNIPre = cUNI.balanceOf(sweepee);

        vm.prank(cHolderUni);
        cUNI.transfer(address(migrator), 300e8);

        assertEq(cUNI.balanceOf(address(migrator)), 300e8, "cUNI given to migrator");
        migrator.sweep(IERC20(address(cUNI)));
        assertEq(cUNI.balanceOf(address(migrator)), 0e8, "cUNI in migrator after sweep");
        assertEq(cUNI.balanceOf(sweepee) - cUNIPre, 300e8, "cUNI swept to sweepee");
    }

    function testSweepEth() public {
        // Posit
        CometMigratorV2.CompoundV2Collateral[] memory initialCollateral = new CometMigratorV2.CompoundV2Collateral[](0);
        CometMigratorV2.CompoundV2Borrow[] memory initialBorrows = new CometMigratorV2.CompoundV2Borrow[](0);
        posit(Posit({
            borrower: borrower,
            collateral: initialCollateral,
            borrows: initialBorrows
        }));

        preflightChecks();

        uint256 sweepeeEthPre = sweepee.balance;

        payable(address(migrator)).transfer(1 ether);
        assertEq(address(migrator).balance, 1 ether, "original eth for migrator");
        migrator.sweep(IERC20(0x0000000000000000000000000000000000000000));
        assertEq(address(migrator).balance, 0 ether, "post-sweep eth for migrator");
        assertEq(sweepee.balance - sweepeeEthPre, 1 ether, "post-sweep eth for sweepee");
    }

    function testInvalidTokenForUni() public {
        IUniswapV3Pool pool_ETH_USDT = IUniswapV3Pool(0x4e68Ccd3E89f51C3074ca5072bbAC773960dFa36);

        vm.expectRevert(abi.encodeWithSelector(CometMigratorV2.InvalidConfiguration.selector, 0));
        new CometMigratorV2(
            comet,
            usdc,
            cETH,
            weth,
            pool_ETH_USDT,
            swapRouter,
            sweepee
        );
    }

    function testMigrateReentrancyZero() public {
        CTokenLike reentrantToken = new ReentrantToken(migrator);

        CometMigratorV2.CompoundV2Collateral[] memory collateralToMigrate = new CometMigratorV2.CompoundV2Collateral[](1);
        collateralToMigrate[0] = CometMigratorV2.CompoundV2Collateral({
            cToken: reentrantToken,
            amount: 1
        });
        CometMigratorV2.CompoundV2Position memory compoundV2Position = CometMigratorV2.CompoundV2Position({
            collateral: collateralToMigrate,
            borrows: new CometMigratorV2.CompoundV2Borrow[](0),
            paths: new bytes[](0)
        });
        vm.expectRevert(abi.encodeWithSelector(CometMigratorV2.Reentrancy.selector, 0));
        migrator.migrate(compoundV2Position, 0e6);
    }

    function testInvalidCallbackZero() public {
        CTokenLike reentrantCallbackToken = new ReentrantCallbackToken(migrator);

        CometMigratorV2.CompoundV2Collateral[] memory collateralToMigrate = new CometMigratorV2.CompoundV2Collateral[](1);
        collateralToMigrate[0] = CometMigratorV2.CompoundV2Collateral({
            cToken: reentrantCallbackToken,
            amount: 1
        });
        CometMigratorV2.CompoundV2Position memory compoundV2Position = CometMigratorV2.CompoundV2Position({
            collateral: collateralToMigrate,
            borrows: new CometMigratorV2.CompoundV2Borrow[](0),
            paths: new bytes[](0)
        });
        vm.expectRevert(abi.encodeWithSelector(CometMigratorV2.InvalidCallback.selector, 0));
        migrator.migrate(compoundV2Position, 0e6);
    }

    function testReentrancyTwo_SweepToken() public {
        CTokenLike reentrantSweepToken = new ReentrantSweepToken(migrator);

        CometMigratorV2.CompoundV2Collateral[] memory collateralToMigrate = new CometMigratorV2.CompoundV2Collateral[](1);
        collateralToMigrate[0] = CometMigratorV2.CompoundV2Collateral({
            cToken: reentrantSweepToken,
            amount: 1
        });
        CometMigratorV2.CompoundV2Position memory compoundV2Position = CometMigratorV2.CompoundV2Position({
            collateral: collateralToMigrate,
            borrows: new CometMigratorV2.CompoundV2Borrow[](0),
            paths: new bytes[](0)
        });
        vm.expectRevert(abi.encodeWithSelector(CometMigratorV2.Reentrancy.selector, 2));
        migrator.migrate(compoundV2Position, 0e6);
    }

    function testSweepFailure_Zero() public {
        CTokenLike lazyToken = new LazyToken();
        CometMigratorV2 migrator0 = new CometMigratorV2(
            comet,
            usdc,
            cETH,
            weth,
            pool_DAI_USDC,
            swapRouter,
            payable(address(lazyToken))
        );

        vm.expectRevert(abi.encodeWithSelector(CometMigratorV2.SweepFailure.selector, 0));
        migrator0.sweep(IERC20(0x0000000000000000000000000000000000000000));
    }

    function testSweepFailure_One() public {
        CTokenLike lazyToken = new LazyToken();

        vm.expectRevert(abi.encodeWithSelector(CometMigratorV2.SweepFailure.selector, 1));
        migrator.sweep(IERC20(address(lazyToken)));
    }

    function testCompoundV2Error() public {
        CTokenLike noRedeemToken = new NoRedeemToken();

        CometMigratorV2.CompoundV2Collateral[] memory collateralToMigrate = new CometMigratorV2.CompoundV2Collateral[](1);
        collateralToMigrate[0] = CometMigratorV2.CompoundV2Collateral({
            cToken: noRedeemToken,
            amount: 1
        });
        CometMigratorV2.CompoundV2Position memory compoundV2Position = CometMigratorV2.CompoundV2Position({
            collateral: collateralToMigrate,
            borrows: new CometMigratorV2.CompoundV2Borrow[](0),
            paths: new bytes[](0)
        });
        vm.expectRevert(abi.encodeWithSelector(CometMigratorV2.CompoundV2Error.selector, 1, 10));
        migrator.migrate(compoundV2Position, 0e6);
    }

    /* ===== Migrator V2 Specific Tests ===== */

    function testMigrateSingleCompoundV2Borrow_allUsdc() public {
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
        CometMigratorV2.CompoundV2Position memory compoundV2Position = CometMigratorV2.CompoundV2Position({
            collateral: collateralToMigrate,
            borrows: initialBorrows,
            paths: paths
        });
        uint256 flashEstimate = 360e6;
        vm.startPrank(borrower);
        cUNI.approve(address(migrator), type(uint256).max);
        comet.allow(address(migrator), true);

        // Check event
        vm.expectEmit(true, false, false, true);
        emit Migrated(borrower, compoundV2Position, flashEstimate, 360e6 * 1.0001);

        migrator.migrate(compoundV2Position, flashEstimate);

        // Check v2 balances
        assertEq(cUNI.balanceOf(borrower), cUNIPre - migrateAmount, "Amount of cUNI should have been migrated");
        assertEq(cUSDC.borrowBalanceCurrent(borrower), 0e6, "Remainder of tokens");

        // Check v3 balances
        assertApproxEqRel(comet.collateralBalanceOf(borrower, address(uni)), 199e18, 0.01e18, "v3 collateral balance");
        assertEq(comet.borrowBalanceOf(borrower), 350e6 + 360e6 * 0.0001, "v3 borrow balance");
    }

    function testMigrateSingleCompoundV2Borrow_allDai() public {
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
        CometMigratorV2.CompoundV2Position memory compoundV2Position = CometMigratorV2.CompoundV2Position({
            collateral: collateralToMigrate,
            borrows: initialBorrows,
            paths: paths
        });
        uint256 flashEstimate = 360e6; // We overstimate slightly to account for slippage
        vm.startPrank(borrower);
        cUNI.approve(address(migrator), type(uint256).max);
        comet.allow(address(migrator), true);

        // Check event
        vm.expectEmit(true, false, false, true);
        emit Migrated(borrower, compoundV2Position, flashEstimate, 360e6 * 1.0001);

        migrator.migrate(compoundV2Position, flashEstimate);

        // Check v2 balances
        assertEq(cUNI.balanceOf(borrower), cUNIPre - migrateAmount, "Amount of cUNI should have been migrated");
        assertEq(cDAI.borrowBalanceCurrent(borrower), 0e18, "Remainder of tokens");

        // Check v3 balances
        assertApproxEqRel(comet.collateralBalanceOf(borrower, address(uni)), 199e18, 0.01e18, "v3 collateral balance");
        // Approximate assertion because of slippage from DAI to USDC
        assertApproxEqRel(comet.borrowBalanceOf(borrower), 350e6 * 1.0001, 0.01e18, "v3 borrow balance");
    }

    function testMigrateDualCompoundV2Borrow_allUsdcAndDai() public {
        // Posit
        CometMigratorV2.CompoundV2Collateral[] memory initialCollateral = new CometMigratorV2.CompoundV2Collateral[](1);
        initialCollateral[0] = CometMigratorV2.CompoundV2Collateral({
            cToken: cUNI,
            amount: 600e18 // ~ $5 * 600 = ~$3000 75% collateral factor = $2,000
        });
        CometMigratorV2.CompoundV2Borrow[] memory initialBorrows = new CometMigratorV2.CompoundV2Borrow[](2);
        initialBorrows[0] = CometMigratorV2.CompoundV2Borrow({
            cToken: cUSDC,
            amount: 350e6
        });
        initialBorrows[1] = CometMigratorV2.CompoundV2Borrow({
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
        uint256 migrateAmount = amountToTokens(398e18, cUNI);
        collateralToMigrate[0] = CometMigratorV2.CompoundV2Collateral({
            cToken: cUNI,
            amount: migrateAmount
        });
        bytes[] memory paths = new bytes[](2);
        uint24 poolFee = 500;
        // Path is reversed (DAI -> USDC) because we are using exact output instead of exact input
        bytes memory usdcToDaiPath = abi.encodePacked(
            address(dai), poolFee, address(usdc)
        );
        paths[0] = "";
        paths[1] = usdcToDaiPath;
        CometMigratorV2.CompoundV2Position memory compoundV2Position = CometMigratorV2.CompoundV2Position({
            collateral: collateralToMigrate,
            borrows: initialBorrows,
            paths: paths
        });
        uint256 flashEstimate = 710e6; // We overstimate slightly to account for slippage
        vm.startPrank(borrower);
        cUNI.approve(address(migrator), type(uint256).max);
        comet.allow(address(migrator), true);

        // Check event
        vm.expectEmit(true, false, false, true);
        emit Migrated(borrower, compoundV2Position, flashEstimate, 710e6 * 1.0001);

        migrator.migrate(compoundV2Position, flashEstimate);

        // Check v2 balances
        assertEq(cUNI.balanceOf(borrower), cUNIPre - migrateAmount, "Amount of cUNI should have been migrated");
        assertEq(cUSDC.borrowBalanceCurrent(borrower), 0e6, "Remainder of tokens");
        assertEq(cDAI.borrowBalanceCurrent(borrower), 0e18, "Remainder of tokens");

        // Check v3 balances
        assertApproxEqRel(comet.collateralBalanceOf(borrower, address(uni)), 398e18, 0.01e18, "v3 collateral balance");
        // Approximate assertion because of slippage from DAI to USDC
        assertApproxEqRel(comet.borrowBalanceOf(borrower), 700e6 * 1.0001, 0.01e18, "v3 borrow balance");
    }

    function testMigrateSingleCompoundV2Borrow_lowFlashEstimate() public {
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
        CometMigratorV2.CompoundV2Position memory compoundV2Position = CometMigratorV2.CompoundV2Position({
            collateral: collateralToMigrate,
            borrows: initialBorrows,
            paths: paths
        });
        uint256 flashEstimate = 350e6; // This should be too low due to slippage
        vm.startPrank(borrower);
        cUNI.approve(address(migrator), type(uint256).max);
        comet.allow(address(migrator), true);

        vm.expectRevert(bytes("STF")); // Uniswap SafeTransferFrom revert due to lack of USDC to complete swap
        migrator.migrate(compoundV2Position, flashEstimate);

        // Check v2 balances
        assertEq(cUNI.balanceOf(borrower), cUNIPre, "Amount of cUNI should have been migrated");
        assertEq(cDAI.borrowBalanceCurrent(borrower), 350e18, "Remainder of tokens");

        // Check v3 balances
        assertEq(comet.collateralBalanceOf(borrower, address(uni)), 0, "v3 collateral balance");
        assertEq(comet.borrowBalanceOf(borrower), 0, "v3 borrow balance");
    }

    function testMigrateDualCompoundV2Borrow_LowFlashEstimate() public {
        // Posit
        CometMigratorV2.CompoundV2Collateral[] memory initialCollateral = new CometMigratorV2.CompoundV2Collateral[](1);
        initialCollateral[0] = CometMigratorV2.CompoundV2Collateral({
            cToken: cUNI,
            amount: 600e18 // ~ $5 * 600 = ~$3000 75% collateral factor = $2,000
        });
        CometMigratorV2.CompoundV2Borrow[] memory initialBorrows = new CometMigratorV2.CompoundV2Borrow[](2);
        initialBorrows[0] = CometMigratorV2.CompoundV2Borrow({
            cToken: cUSDC,
            amount: 350e6
        });
        initialBorrows[1] = CometMigratorV2.CompoundV2Borrow({
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
        uint256 migrateAmount = amountToTokens(398e18, cUNI);
        collateralToMigrate[0] = CometMigratorV2.CompoundV2Collateral({
            cToken: cUNI,
            amount: migrateAmount
        });
        bytes[] memory paths = new bytes[](2);
        uint24 poolFee = 500;
        // Path is reversed (DAI -> USDC) because we are using exact output instead of exact input
        bytes memory usdcToDaiPath = abi.encodePacked(
            address(dai), poolFee, address(usdc)
        );
        paths[0] = "";
        paths[1] = usdcToDaiPath;
        CometMigratorV2.CompoundV2Position memory compoundV2Position = CometMigratorV2.CompoundV2Position({
            collateral: collateralToMigrate,
            borrows: initialBorrows,
            paths: paths
        });
        uint256 flashEstimate = 700e6; // This should be too little due to slippage
        vm.startPrank(borrower);
        cUNI.approve(address(migrator), type(uint256).max);
        comet.allow(address(migrator), true);

        vm.expectRevert(bytes("STF")); // Uniswap SafeTransferFrom revert due to lack of USDC to complete swap
        migrator.migrate(compoundV2Position, flashEstimate);

        // Check v2 balances
        assertEq(cUNI.balanceOf(borrower), cUNIPre, "Amount of cUNI should have been migrated");
        assertEq(cUSDC.borrowBalanceCurrent(borrower), 350e6, "Remainder of tokens");
        assertEq(cDAI.borrowBalanceCurrent(borrower), 350e18, "Remainder of tokens");

        // Check v3 balances
        assertEq(comet.collateralBalanceOf(borrower, address(uni)), 0, "v3 collateral balance");
        assertEq(comet.borrowBalanceOf(borrower), 0, "v3 borrow balance");
    }

    function testMigrateSingleCompoundV2Borrow_highFlashEstimate() public {
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
        CometMigratorV2.CompoundV2Position memory compoundV2Position = CometMigratorV2.CompoundV2Position({
            collateral: collateralToMigrate,
            borrows: initialBorrows,
            paths: paths
        });
        uint256 flashEstimate = 35000e6; // Estimate higher by a factor of 100
        vm.startPrank(borrower);
        cUNI.approve(address(migrator), type(uint256).max);
        comet.allow(address(migrator), true);

        // Check event
        vm.expectEmit(true, false, false, true);
        emit Migrated(borrower, compoundV2Position, flashEstimate, 35000e6 * 1.0001);

        migrator.migrate(compoundV2Position, flashEstimate);

        // Check v2 balances
        assertEq(cUNI.balanceOf(borrower), cUNIPre - migrateAmount, "Amount of cUNI should have been migrated");
        assertEq(cUSDC.borrowBalanceCurrent(borrower), 0e6, "Remainder of tokens");

        // Check v3 balances
        assertApproxEqRel(comet.collateralBalanceOf(borrower, address(uni)), 199e18, 0.01e18, "v3 collateral balance");
        // v3 borrow includes the interest paid on the larger flash loan
        assertEq(comet.borrowBalanceOf(borrower), 350e6 + 35000e6 * 0.0001, "v3 borrow balance");
    }

    // XXX USDT (probably won't work until we switch to NonCompliantIERC20)
    // XXX multi-path
    // XXX low flash estimate (still need to test for different sources: aave, cdp)

    // XXX error cases:
    // XXX borrow and path length mismatch
    // XXX invalid path

    function preflightChecks() internal {
        require(comet.collateralBalanceOf(borrower, address(uni)) == 0, "no starting uni collateral balance");
        require(comet.collateralBalanceOf(borrower, address(weth)) == 0, "no starting weth collateral balance");
        require(comet.borrowBalanceOf(borrower) == 0, "no starting v3 borrow balance");
        migrator.sweep(IERC20(0x0000000000000000000000000000000000000000));
        require(address(migrator).balance == 0, "no starting v3 eth");
    }
}
