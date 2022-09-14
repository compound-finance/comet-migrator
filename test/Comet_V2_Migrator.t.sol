// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import "forge-std/Script.sol";
import "../src/Comet_V2_Migrator.sol";
import "forge-std/Test.sol";
import "./MainnetConstants.t.sol";
import "./Positor.t.sol";

contract ContractTest is Positor {
    event Migrated(
        address indexed user,
        Comet_V2_Migrator.Collateral[] collateral,
        uint256 repayAmount,
        uint256 borrowAmountWithFee);

    address public constant borrower = address(0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266);

    function testMigrateSimpleUniPosition() public {
        // Posit
        Position[] memory positions = new Position[](1);
        positions[0] = Position({
            collateral: cUNI,
            amount: 300e18 // ~ $5 * 300 = ~$1500 75% collateral factor = $1,000
        });
        posit(Posit({
            borrower: borrower,
            positions: positions,
            borrow: 700e6
        }));

        uint256 cUNIPre = cUNI.balanceOf(borrower);
        preflightChecks();

        // Migrate
        Comet_V2_Migrator.Collateral[] memory collateral = new Comet_V2_Migrator.Collateral[](1);
        uint256 migrateAmount = amountToTokens(199e18, cUNI);
        collateral[0] = Comet_V2_Migrator.Collateral({
            cToken: cUNI,
            amount: migrateAmount
        });

        vm.startPrank(borrower);
        cUNI.approve(address(migrator), type(uint256).max);
        comet.allow(address(migrator), true);

        // Check event
        vm.expectEmit(true, false, false, true);
        emit Migrated(borrower, collateral, 600e6, 600e6 * 1.0001);

        migrator.migrate(collateral, 600e6);

        // Check v2 balances
        assertEq(cUNI.balanceOf(borrower), cUNIPre - migrateAmount, "Amount of cUNI should have been migrated");
        assertEq(cUSDC.borrowBalanceCurrent(borrower), 100e6, "Remainder of tokens");

        // Check v3 balances
        assertApproxEqRel(comet.collateralBalanceOf(borrower, address(uni)), 199e18, 0.01e18, "v3 collateral balance");
        assertEq(comet.borrowBalanceOf(borrower), 600e6 * 1.0001, "v3 borrow balance");
    }

    function testMigrateSimpleEthPosition() public {
        // Posit
        Position[] memory positions = new Position[](1);
        positions[0] = Position({
            collateral: cETH,
            amount: 1e18 // ~ $2000 * 1 = ~$2000 82-83% collateral factor = $1,600
        });
        posit(Posit({
            borrower: borrower,
            positions: positions,
            borrow: 700e6
        }));

        uint256 cETHPre = cETH.balanceOf(borrower);
        preflightChecks();

        // Migrate
        Comet_V2_Migrator.Collateral[] memory collateral = new Comet_V2_Migrator.Collateral[](1);
        uint256 migrateAmount = amountToTokens(0.6e18, cETH);
        collateral[0] = Comet_V2_Migrator.Collateral({
            cToken: cETH,
            amount: migrateAmount
        });

        vm.startPrank(borrower);
        cETH.approve(address(migrator), type(uint256).max);
        comet.allow(address(migrator), true);
        migrator.migrate(collateral, 600e6);

        // Check v2 balances
        assertEq(cETH.balanceOf(borrower), cETHPre - migrateAmount, "Amount of cETH should have been migrated");
        assertEq(cUSDC.borrowBalanceCurrent(borrower), 100e6, "Remainder of tokens");

        // Check v3 balances
        assertApproxEqRel(comet.collateralBalanceOf(borrower, address(weth)), 0.6e18, 0.01e18, "v3 collateral balance");
        assertEq(comet.borrowBalanceOf(borrower), 600e6 * 1.0001, "v3 borrow balance");
    }

    function testMigrateSimpleUniPosition_SecondAsset() public {
        // Posit
        Position[] memory positions = new Position[](1);
        positions[0] = Position({
            collateral: cUNI,
            amount: 300e18 // ~ $5 * 300 = ~$1500 75% collateral factor = $1,000
        });
        posit(Posit({
            borrower: borrower,
            positions: positions,
            borrow: 700e6
        }));

        uint256 cUNIPre = cUNI.balanceOf(borrower);
        preflightChecks();

        // Migrate
        Comet_V2_Migrator.Collateral[] memory collateral = new Comet_V2_Migrator.Collateral[](2);
        uint256 migrateAmount = amountToTokens(199e18, cUNI);
        collateral[0] = Comet_V2_Migrator.Collateral({
            cToken: cUNI,
            amount: 0
        });
        collateral[1] = Comet_V2_Migrator.Collateral({
            cToken: cUNI,
            amount: migrateAmount
        });

        vm.startPrank(borrower);
        cUNI.approve(address(migrator), type(uint256).max);
        comet.allow(address(migrator), true);
        migrator.migrate(collateral, 600e6);

        // Check v2 balances
        assertEq(cUNI.balanceOf(borrower), cUNIPre - migrateAmount, "Amount of cUNI should have been migrated");
        assertEq(cUSDC.borrowBalanceCurrent(borrower), 100e6, "Remainder of tokens");

        // Check v3 balances
        assertApproxEqRel(comet.collateralBalanceOf(borrower, address(uni)), 199e18, 0.01e18, "v3 collateral balance");
        assertEq(comet.borrowBalanceOf(borrower), 600e6 * 1.0001, "v3 borrow balance");
    }

    function testMigrateSimpleUniPositionMaxCollateral() public {
        // Posit
        Position[] memory positions = new Position[](1);
        positions[0] = Position({
            collateral: cUNI,
            amount: 300e18 // ~ $5 * 300 = ~$1500 75% collateral factor = $1,000
        });
        posit(Posit({
            borrower: borrower,
            positions: positions,
            borrow: 700e6
        }));

        preflightChecks();

        // Migrate
        Comet_V2_Migrator.Collateral[] memory collateral = new Comet_V2_Migrator.Collateral[](1);
        collateral[0] = Comet_V2_Migrator.Collateral({
            cToken: cUNI,
            amount: type(uint256).max
        });

        vm.startPrank(borrower);
        cUNI.approve(address(migrator), type(uint256).max);
        comet.allow(address(migrator), true);
        migrator.migrate(collateral, 700e6);

        // Check v2 balances
        assertEq(cUNI.balanceOf(borrower), 0, "Amount of cUNI should have been migrated");
        assertEq(cUSDC.borrowBalanceCurrent(borrower), 0, "Remainder of tokens");

        // Check v3 balances
        assertApproxEqRel(comet.collateralBalanceOf(borrower, address(uni)), 300e18, 0.01e18, "v3 collateral balance");
        assertEq(comet.borrowBalanceOf(borrower), 700e6 * 1.0001, "v3 borrow balance");
    }

    function testMigrateSimpleUniPositionMaxCollateralMaxBorrow() public {
        // Posit
        Position[] memory positions = new Position[](1);
        positions[0] = Position({
            collateral: cUNI,
            amount: 300e18 // ~ $5 * 300 = ~$1500 75% collateral factor = $1,000
        });
        posit(Posit({
            borrower: borrower,
            positions: positions,
            borrow: 700e6
        }));

        preflightChecks();

        // Migrate
        Comet_V2_Migrator.Collateral[] memory collateral = new Comet_V2_Migrator.Collateral[](1);
        collateral[0] = Comet_V2_Migrator.Collateral({
            cToken: cUNI,
            amount: type(uint256).max
        });

        vm.startPrank(borrower);
        cUNI.approve(address(migrator), type(uint256).max);
        comet.allow(address(migrator), true);
        migrator.migrate(collateral, type(uint256).max);

        // Check v2 balances
        assertEq(cUNI.balanceOf(borrower), 0, "Amount of cUNI should have been migrated");
        assertEq(cUSDC.borrowBalanceCurrent(borrower), 0, "Remainder of tokens");

        // Check v3 balances
        assertApproxEqRel(comet.collateralBalanceOf(borrower, address(uni)), 300e18, 0.01e18, "v3 collateral balance");
        assertEq(comet.borrowBalanceOf(borrower), 700e6 * 1.0001, "v3 borrow balance");
    }

    function testMigrateSimpleDualPosition_OneAsset() public {
        // Posit
        Position[] memory positions = new Position[](2);
        positions[0] = Position({
            collateral: cUNI,
            amount: 300e18 // ~ $5 * 300 = ~$1500 75% collateral factor = $1,000
        });
        positions[1] = Position({
            collateral: cETH,
            amount: 1e18 // ~ $2000 * 1 = ~$2000 82-83% collateral factor = $1,600
        });
        posit(Posit({
            borrower: borrower,
            positions: positions,
            borrow: 1400e6
        }));

        uint256 cUNIPre = cUNI.balanceOf(borrower);
        preflightChecks();

        // Migrate
        Comet_V2_Migrator.Collateral[] memory collateral = new Comet_V2_Migrator.Collateral[](1);
        uint256 migrateAmount = amountToTokens(199e18, cUNI);
        collateral[0] = Comet_V2_Migrator.Collateral({
            cToken: cUNI,
            amount: migrateAmount
        });

        vm.startPrank(borrower);
        cUNI.approve(address(migrator), type(uint256).max);
        comet.allow(address(migrator), true);
        migrator.migrate(collateral, 600e6);

        // Check v2 balances
        assertEq(cUNI.balanceOf(borrower), cUNIPre - migrateAmount, "Amount of cUNI should have been migrated");
        assertEq(cUSDC.borrowBalanceCurrent(borrower), 800e6, "Remainder of tokens");

        // Check v3 balances
        assertApproxEqRel(comet.collateralBalanceOf(borrower, address(uni)), 199e18, 0.01e18, "v3 collateral balance");
        assertEq(comet.borrowBalanceOf(borrower), 600e6 * 1.0001, "v3 borrow balance");
    }

    function testMigrateSimpleDualPosition_BothAssets() public {
        // Posit
        Position[] memory positions = new Position[](2);
        positions[0] = Position({
            collateral: cUNI,
            amount: 300e18 // ~ $5 * 300 = ~$1500 75% collateral factor = $1,000
        });
        positions[1] = Position({
            collateral: cETH,
            amount: 1e18 // ~ $2000 * 1 = ~$2000 82-83% collateral factor = $1,600
        });
        posit(Posit({
            borrower: borrower,
            positions: positions,
            borrow: 1400e6
        }));

        uint256 cUNIPre = cUNI.balanceOf(borrower);
        uint256 cETHPre = cETH.balanceOf(borrower);
        preflightChecks();

        // Migrate
        Comet_V2_Migrator.Collateral[] memory collateral = new Comet_V2_Migrator.Collateral[](2);
        uint256 uniMigrateAmount = amountToTokens(199e18, cUNI);
        collateral[0] = Comet_V2_Migrator.Collateral({
            cToken: cUNI,
            amount: uniMigrateAmount
        });
        uint256 ethMigrateAmount = amountToTokens(0.6e18, cETH);
        collateral[1] = Comet_V2_Migrator.Collateral({
            cToken: cETH,
            amount: ethMigrateAmount
        });

        vm.startPrank(borrower);
        cETH.approve(address(migrator), type(uint256).max); // TODO: Test without approval
        cUNI.approve(address(migrator), type(uint256).max);
        comet.allow(address(migrator), true);
        migrator.migrate(collateral, 1200e6);

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
        Position[] memory positions = new Position[](1);
        positions[0] = Position({
            collateral: cUNI,
            amount: 300e18 // ~ $5 * 300 = ~$1500 75% collateral factor = $1,000
        });
        posit(Posit({
            borrower: borrower,
            positions: positions,
            borrow: 700e6
        }));

        uint256 cUNIPre = cUNI.balanceOf(borrower);
        preflightChecks();

        // Migrate
        Comet_V2_Migrator.Collateral[] memory collateral = new Comet_V2_Migrator.Collateral[](1);
        uint256 migrateAmount = amountToTokens(199e18, cUNI);
        collateral[0] = Comet_V2_Migrator.Collateral({
            cToken: cUNI,
            amount: migrateAmount
        });

        vm.startPrank(borrower);
        cUNI.approve(address(migrator), 0);
        comet.allow(address(migrator), true);
        vm.expectRevert(stdError.arithmeticError);
        migrator.migrate(collateral, 600e6);

        // Check v2 balances
        assertEq(cUNI.balanceOf(borrower), cUNIPre, "Amount of cUNI should have been migrated");
        assertEq(cUSDC.borrowBalanceCurrent(borrower), 700e6, "Remainder of tokens");

        // Check v3 balances
        assertEq(comet.collateralBalanceOf(borrower, address(uni)), 0, "v3 collateral balance");
        assertEq(comet.borrowBalanceOf(borrower), 0, "v3 borrow balance");
    }

    function testMigrateSimpleEthPosition_NoApproval() public {
        // Posit
        Position[] memory positions = new Position[](1);
        positions[0] = Position({
            collateral: cETH,
            amount: 1e18 // ~ $2000 * 1 = ~$2000 82-83% collateral factor = $1,600
        });
        posit(Posit({
            borrower: borrower,
            positions: positions,
            borrow: 700e6
        }));

        uint256 cETHPre = cETH.balanceOf(borrower);
        preflightChecks();

        // Migrate
        Comet_V2_Migrator.Collateral[] memory collateral = new Comet_V2_Migrator.Collateral[](1);
        uint256 migrateAmount = amountToTokens(0.6e18, cETH);
        collateral[0] = Comet_V2_Migrator.Collateral({
            cToken: cETH,
            amount: migrateAmount
        });

        vm.startPrank(borrower);
        cETH.approve(address(migrator), 0);
        comet.allow(address(migrator), true);

        vm.expectRevert(Comet_V2_Migrator.CTokenTransferFailure.selector);
        migrator.migrate(collateral, 600e6);

        // Check v2 balances
        assertEq(cETH.balanceOf(borrower), cETHPre, "Amount of cETH should have been migrated");
        assertEq(cUSDC.borrowBalanceCurrent(borrower), 700e6, "Remainder of tokens");

        // Check v3 balances
        assertEq(comet.collateralBalanceOf(borrower, address(weth)), 0, "v3 collateral balance");
        assertEq(comet.borrowBalanceOf(borrower), 0, "v3 borrow balance");
    }

    function testMigrateSimpleUniPosition_InsufficientCollateral() public {
        // Posit
        Position[] memory positions = new Position[](1);
        positions[0] = Position({
            collateral: cUNI,
            amount: 300e18 // ~ $5 * 300 = ~$1500 75% collateral factor = $1,000
        });
        posit(Posit({
            borrower: borrower,
            positions: positions,
            borrow: 700e6
        }));

        uint256 cUNIPre = cUNI.balanceOf(borrower);
        preflightChecks();

        // Migrate
        Comet_V2_Migrator.Collateral[] memory collateral = new Comet_V2_Migrator.Collateral[](1);
        uint256 migrateAmount = amountToTokens(400e18, cUNI);
        collateral[0] = Comet_V2_Migrator.Collateral({
            cToken: cUNI,
            amount: migrateAmount
        });

        vm.startPrank(borrower);
        cUNI.approve(address(migrator), type(uint256).max);
        comet.allow(address(migrator), true);
        vm.expectRevert(abi.encodeWithSelector(CTokenLike.TransferComptrollerRejection.selector, 4));
        migrator.migrate(collateral, 600e6);

        // Check v2 balances
        assertEq(cUNI.balanceOf(borrower), cUNIPre, "Amount of cUNI should have been migrated");
        assertEq(cUSDC.borrowBalanceCurrent(borrower), 700e6, "Remainder of tokens");

        // Check v3 balances
        assertEq(comet.collateralBalanceOf(borrower, address(uni)), 0, "v3 collateral balance");
        assertEq(comet.borrowBalanceOf(borrower), 0, "v3 borrow balance");
    }

    function testMigrateSimpleEthPosition_InsufficientCollateral() public {
        // Posit
        Position[] memory positions = new Position[](1);
        positions[0] = Position({
            collateral: cETH,
            amount: 1e18 // ~ $2000 * 1 = ~$2000 82-83% collateral factor = $1,600
        });
        posit(Posit({
            borrower: borrower,
            positions: positions,
            borrow: 700e6
        }));

        uint256 cETHPre = cETH.balanceOf(borrower);
        preflightChecks();

        // Migrate
        Comet_V2_Migrator.Collateral[] memory collateral = new Comet_V2_Migrator.Collateral[](1);
        uint256 migrateAmount = amountToTokens(200e18, cETH);
        collateral[0] = Comet_V2_Migrator.Collateral({
            cToken: cETH,
            amount: migrateAmount
        });

        vm.startPrank(borrower);
        cETH.approve(address(migrator), type(uint256).max);
        comet.allow(address(migrator), true);

        vm.expectRevert(Comet_V2_Migrator.CTokenTransferFailure.selector);
        migrator.migrate(collateral, 600e6);

        // Check v2 balances
        assertEq(cETH.balanceOf(borrower), cETHPre, "Amount of cETH should have been migrated");
        assertEq(cUSDC.borrowBalanceCurrent(borrower), 700e6, "Remainder of tokens");

        // Check v3 balances
        assertEq(comet.collateralBalanceOf(borrower, address(weth)), 0, "v3 collateral balance");
        assertEq(comet.borrowBalanceOf(borrower), 0, "v3 borrow balance");
    }

    function testMigrateSimpleUniPosition_NoCometApproval() public {
        // Posit
        Position[] memory positions = new Position[](1);
        positions[0] = Position({
            collateral: cUNI,
            amount: 300e18 // ~ $5 * 300 = ~$1500 75% collateral factor = $1,000
        });
        posit(Posit({
            borrower: borrower,
            positions: positions,
            borrow: 700e6
        }));

        uint256 cUNIPre = cUNI.balanceOf(borrower);
        preflightChecks();

        // Migrate
        Comet_V2_Migrator.Collateral[] memory collateral = new Comet_V2_Migrator.Collateral[](1);
        uint256 migrateAmount = amountToTokens(200e18, cUNI);
        collateral[0] = Comet_V2_Migrator.Collateral({
            cToken: cUNI,
            amount: migrateAmount
        });

        vm.startPrank(borrower);
        cUNI.approve(address(migrator), type(uint256).max);
        vm.expectRevert(Comet.Unauthorized.selector);
        migrator.migrate(collateral, 600e6);

        // Check v2 balances
        assertEq(cUNI.balanceOf(borrower), cUNIPre, "Amount of cUNI should have been migrated");
        assertEq(cUSDC.borrowBalanceCurrent(borrower), 700e6, "Remainder of tokens");

        // Check v3 balances
        assertEq(comet.collateralBalanceOf(borrower, address(uni)), 0, "v3 collateral balance");
        assertEq(comet.borrowBalanceOf(borrower), 0, "v3 borrow balance");
    }

    function testMigrateSimpleUniPosition_InsufficientLiquidity() public {
        // Posit
        Position[] memory positions = new Position[](1);
        positions[0] = Position({
            collateral: cUNI,
            amount: 300e18 // ~ $5 * 300 = ~$1500 75% collateral factor = $1,000
        });
        posit(Posit({
            borrower: borrower,
            positions: positions,
            borrow: 700e6
        }));

        uint256 cUNIPre = cUNI.balanceOf(borrower);
        preflightChecks();

        // Migrate
        Comet_V2_Migrator.Collateral[] memory collateral = new Comet_V2_Migrator.Collateral[](1);
        uint256 migrateAmount = amountToTokens(200e18, cUNI);
        collateral[0] = Comet_V2_Migrator.Collateral({
            cToken: cUNI,
            amount: migrateAmount
        });

        vm.startPrank(borrower);
        cUNI.approve(address(migrator), type(uint256).max);
        comet.allow(address(migrator), true);

        vm.expectRevert(abi.encodeWithSelector(CTokenLike.TransferComptrollerRejection.selector, 4));
        migrator.migrate(collateral, 0e6);

        // Check v2 balances
        assertEq(cUNI.balanceOf(borrower), cUNIPre, "Amount of cUNI should have been migrated");
        assertEq(cUSDC.borrowBalanceCurrent(borrower), 700e6, "Remainder of tokens");

        // Check v3 balances
        assertEq(comet.collateralBalanceOf(borrower, address(uni)), 0, "v3 collateral balance");
        assertEq(comet.borrowBalanceOf(borrower), 0, "v3 borrow balance");
    }

    function testMigrateSimpleUniPosition_ExcessiveRepay() public {
        // Posit
        Position[] memory positions = new Position[](1);
        positions[0] = Position({
            collateral: cUNI,
            amount: 300e18 // ~ $5 * 300 = ~$1500 75% collateral factor = $1,000
        });
        posit(Posit({
            borrower: borrower,
            positions: positions,
            borrow: 700e6
        }));

        uint256 cUNIPre = cUNI.balanceOf(borrower);
        preflightChecks();

        // Migrate
        Comet_V2_Migrator.Collateral[] memory collateral = new Comet_V2_Migrator.Collateral[](1);
        uint256 migrateAmount = amountToTokens(200e18, cUNI);
        collateral[0] = Comet_V2_Migrator.Collateral({
            cToken: cUNI,
            amount: migrateAmount
        });

        vm.startPrank(borrower);
        cUNI.approve(address(migrator), type(uint256).max);
        comet.allow(address(migrator), true);

        vm.expectRevert(abi.encodeWithSelector(Comet_V2_Migrator.CompoundV2Error.selector, 0, 9));
        migrator.migrate(collateral, 800e6);

        // Check v2 balances
        assertEq(cUNI.balanceOf(borrower), cUNIPre, "Amount of cUNI should have been migrated");
        assertEq(cUSDC.borrowBalanceCurrent(borrower), 700e6, "Remainder of tokens");

        // Check v3 balances
        assertEq(comet.collateralBalanceOf(borrower, address(uni)), 0, "v3 collateral balance");
        assertEq(comet.borrowBalanceOf(borrower), 0, "v3 borrow balance");
    }

    function testMigrateSimpleUniPosition_UnlistedCollateral() public {
        // Posit
        Position[] memory positions = new Position[](1);
        positions[0] = Position({
            collateral: cUNI,
            amount: 300e18 // ~ $5 * 300 = ~$1500 75% collateral factor = $1,000
        });
        posit(Posit({
            borrower: borrower,
            positions: positions,
            borrow: 700e6
        }));

        uint256 cUNIPre = cUNI.balanceOf(borrower);
        preflightChecks();

        // Migrate
        Comet_V2_Migrator.Collateral[] memory collateral = new Comet_V2_Migrator.Collateral[](1);
        collateral[0] = Comet_V2_Migrator.Collateral({
            cToken: CTokenLike(address(uni)),
            amount: 0
        });

        vm.startPrank(borrower);
        cUNI.approve(address(migrator), type(uint256).max);
        comet.allow(address(migrator), true);

        vm.expectRevert(abi.encodeWithSelector(Comet_V2_Migrator.CompoundV2Error.selector, 0, 9));
        migrator.migrate(collateral, 800e6);

        // Check v2 balances
        assertEq(cUNI.balanceOf(borrower), cUNIPre, "Amount of cUNI should have been migrated");
        assertEq(cUSDC.borrowBalanceCurrent(borrower), 700e6, "Remainder of tokens");

        // Check v3 balances
        assertEq(comet.collateralBalanceOf(borrower, address(uni)), 0, "v3 collateral balance");
        assertEq(comet.borrowBalanceOf(borrower), 0, "v3 borrow balance");
    }

    function testMigrateSimpleUniPosition_NoTokenCollateral() public {
        // Posit
        Position[] memory positions = new Position[](1);
        positions[0] = Position({
            collateral: cUNI,
            amount: 300e18 // ~ $5 * 300 = ~$1500 75% collateral factor = $1,000
        });
        posit(Posit({
            borrower: borrower,
            positions: positions,
            borrow: 700e6
        }));

        uint256 cUNIPre = cUNI.balanceOf(borrower);
        preflightChecks();

        // Migrate
        Comet_V2_Migrator.Collateral[] memory collateral = new Comet_V2_Migrator.Collateral[](1);
        collateral[0] = Comet_V2_Migrator.Collateral({
            cToken: CTokenLike(0x0000000000000000000000000000000000000000),
            amount: 0
        });

        vm.startPrank(borrower);
        cUNI.approve(address(migrator), type(uint256).max);
        comet.allow(address(migrator), true);

        vm.expectRevert(abi.encodeWithSelector(Comet_V2_Migrator.CompoundV2Error.selector, 0, 9));
        migrator.migrate(collateral, 800e6);

        // Check v2 balances
        assertEq(cUNI.balanceOf(borrower), cUNIPre, "Amount of cUNI should have been migrated");
        assertEq(cUSDC.borrowBalanceCurrent(borrower), 700e6, "Remainder of tokens");

        // Check v3 balances
        assertEq(comet.collateralBalanceOf(borrower, address(uni)), 0, "v3 collateral balance");
        assertEq(comet.borrowBalanceOf(borrower), 0, "v3 borrow balance");
    }

    function testMigrateSimpleUniPosition_NoMovement() public {
        // Posit
        Position[] memory positions = new Position[](1);
        positions[0] = Position({
            collateral: cUNI,
            amount: 300e18 // ~ $5 * 300 = ~$1500 75% collateral factor = $1,000
        });
        posit(Posit({
            borrower: borrower,
            positions: positions,
            borrow: 700e6
        }));

        uint256 cUNIPre = cUNI.balanceOf(borrower);
        preflightChecks();

        // Migrate
        Comet_V2_Migrator.Collateral[] memory collateral = new Comet_V2_Migrator.Collateral[](0);

        vm.startPrank(borrower);
        cUNI.approve(address(migrator), type(uint256).max);
        comet.allow(address(migrator), true);

        migrator.migrate(collateral, 0e6);

        // Check v2 balances
        assertEq(cUNI.balanceOf(borrower), cUNIPre, "Amount of cUNI should have been migrated");
        assertEq(cUSDC.borrowBalanceCurrent(borrower), 700e6, "Remainder of tokens");

        // Check v3 balances
        assertEq(comet.collateralBalanceOf(borrower, address(uni)), 0, "v3 collateral balance");
        assertEq(comet.borrowBalanceOf(borrower), 0, "v3 borrow balance");
    }

    // TODO: Test already having a position and moving one in
    // TODO: Test moving no collateral but already being in a position to support it
    // TODO: Test calling callback code directly
    // TODO: Test sweep

    function preflightChecks() internal {
        require(comet.collateralBalanceOf(borrower, address(uni)) == 0, "no starting uni collateral balance");
        require(comet.collateralBalanceOf(borrower, address(weth)) == 0, "no starting weth collateral balance");
        require(comet.borrowBalanceOf(borrower) == 0, "no starting v3 borrow balance");
        migrator.sweep(IERC20(0x0000000000000000000000000000000000000000));
        require(address(migrator).balance == 0, "no starting v3 eth");
    }
}
