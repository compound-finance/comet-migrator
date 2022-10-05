// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import "forge-std/Script.sol";
import "../src/CometMigrator.sol";
import "forge-std/Test.sol";
import "./MainnetConstants.t.sol";
import "./Positor.t.sol";

contract CometMigratorTest is Positor {
    event Migrated(
        address indexed user,
        CometMigrator.Collateral[] collateral,
        CometMigrator.TokenRepaid[] tokensRepaid,
        uint256 borrowAmountWithFee);

    address public constant borrower = address(0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266);

    function testMigrateSimpleUniPosition() public {
        // Posit
        Position[] memory positions = new Position[](1);
        positions[0] = Position({
            collateral: cUNI,
            amount: 300e18 // ~ $5 * 300 = ~$1500 75% collateral factor = $1,000
        });
        BorrowPosition[] memory borrowPositions = new BorrowPosition[](1);
        borrowPositions[0] = BorrowPosition({
            borrowCToken: cUSDC,
            amount: 700e6
        });
        posit(Posit({
            borrower: borrower,
            positions: positions,
            borrows: borrowPositions
        }));

        uint256 cUNIPre = cUNI.balanceOf(borrower);
        preflightChecks();

        // Migrate
        CometMigrator.Collateral[] memory collateral = new CometMigrator.Collateral[](1);
        uint256 migrateAmount = amountToTokens(199e18, cUNI);
        collateral[0] = CometMigrator.Collateral({
            cToken: cUNI,
            amount: migrateAmount
        });

        vm.startPrank(borrower);
        cUNI.approve(address(migrator), type(uint256).max);
        comet.allow(address(migrator), true);

        // Check event
        vm.expectEmit(true, false, false, true);
        CometMigrator.TokenRepaid[] memory tokensRepaid = new CometMigrator.TokenRepaid[](1);
        tokensRepaid[0] = CometMigrator.TokenRepaid({
            borrowToken: address(usdc),
            repayAmount: 600e6
        });
        emit Migrated(borrower, collateral, tokensRepaid, 600e6 * 1.0001);

        CometMigrator.BorrowData[] memory borrowData = new CometMigrator.BorrowData[](1);
        borrowData[0] = CometMigrator.BorrowData({
            borrowCToken: cUSDC,
            borrowAmount: 600e6,
            poolInfo: CometMigrator.UniswapPoolInfo({
                token0: address(dai),
                token1: address(usdc),
                fee: 100
            }),
            isFlashLoan: true
        });
        migrator.migrate(collateral, borrowData, address(usdc));

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
        BorrowPosition[] memory borrowPositions = new BorrowPosition[](1);
        borrowPositions[0] = BorrowPosition({
            borrowCToken: cUSDC,
            amount: 700e6
        });
        posit(Posit({
            borrower: borrower,
            positions: positions,
            borrows: borrowPositions
        }));

        uint256 cETHPre = cETH.balanceOf(borrower);
        preflightChecks();

        // Migrate
        CometMigrator.Collateral[] memory collateral = new CometMigrator.Collateral[](1);
        uint256 migrateAmount = amountToTokens(0.6e18, cETH);
        collateral[0] = CometMigrator.Collateral({
            cToken: cETH,
            amount: migrateAmount
        });

        vm.startPrank(borrower);
        cETH.approve(address(migrator), type(uint256).max);
        comet.allow(address(migrator), true);

        // Check event
        vm.expectEmit(true, false, false, true);
        CometMigrator.TokenRepaid[] memory tokensRepaid = new CometMigrator.TokenRepaid[](1);
        tokensRepaid[0] = CometMigrator.TokenRepaid({
            borrowToken: address(usdc),
            repayAmount: 600e6
        });
        emit Migrated(borrower, collateral, tokensRepaid, 600e6 * 1.0001);

        CometMigrator.BorrowData[] memory borrowData = new CometMigrator.BorrowData[](1);
        borrowData[0] = CometMigrator.BorrowData({
            borrowCToken: cUSDC,
            borrowAmount: 600e6,
            poolInfo: CometMigrator.UniswapPoolInfo({
                token0: address(dai),
                token1: address(usdc),
                fee: 100
            }),
            isFlashLoan: true
        });
        migrator.migrate(collateral, borrowData, address(usdc));

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
        BorrowPosition[] memory borrowPositions = new BorrowPosition[](1);
        borrowPositions[0] = BorrowPosition({
            borrowCToken: cUSDC,
            amount: 700e6
        });
        posit(Posit({
            borrower: borrower,
            positions: positions,
            borrows: borrowPositions
        }));

        uint256 cUNIPre = cUNI.balanceOf(borrower);
        preflightChecks();

        // Migrate
        CometMigrator.Collateral[] memory collateral = new CometMigrator.Collateral[](2);
        uint256 migrateAmount = amountToTokens(199e18, cUNI);
        collateral[0] = CometMigrator.Collateral({
            cToken: cUNI,
            amount: 0
        });
        collateral[1] = CometMigrator.Collateral({
            cToken: cUNI,
            amount: migrateAmount
        });

        vm.startPrank(borrower);
        cUNI.approve(address(migrator), type(uint256).max);
        comet.allow(address(migrator), true);

        CometMigrator.BorrowData[] memory borrowData = new CometMigrator.BorrowData[](1);
        borrowData[0] = CometMigrator.BorrowData({
            borrowCToken: cUSDC,
            borrowAmount: 600e6,
            poolInfo: CometMigrator.UniswapPoolInfo({
                token0: address(dai),
                token1: address(usdc),
                fee: 100
            }),
            isFlashLoan: true
        });
        migrator.migrate(collateral, borrowData, address(usdc));

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
        BorrowPosition[] memory borrowPositions = new BorrowPosition[](1);
        borrowPositions[0] = BorrowPosition({
            borrowCToken: cUSDC,
            amount: 700e6
        });
        posit(Posit({
            borrower: borrower,
            positions: positions,
            borrows: borrowPositions
        }));

        preflightChecks();

        // Migrate
        CometMigrator.Collateral[] memory collateral = new CometMigrator.Collateral[](1);
        collateral[0] = CometMigrator.Collateral({
            cToken: cUNI,
            amount: type(uint256).max
        });

        vm.startPrank(borrower);
        cUNI.approve(address(migrator), type(uint256).max);
        comet.allow(address(migrator), true);

        CometMigrator.BorrowData[] memory borrowData = new CometMigrator.BorrowData[](1);
        borrowData[0] = CometMigrator.BorrowData({
            borrowCToken: cUSDC,
            borrowAmount: 700e6,
            poolInfo: CometMigrator.UniswapPoolInfo({
                token0: address(dai),
                token1: address(usdc),
                fee: 100
            }),
            isFlashLoan: true
        });
        migrator.migrate(collateral, borrowData, address(usdc));

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
        BorrowPosition[] memory borrowPositions = new BorrowPosition[](1);
        borrowPositions[0] = BorrowPosition({
            borrowCToken: cUSDC,
            amount: 700e6
        });
        posit(Posit({
            borrower: borrower,
            positions: positions,
            borrows: borrowPositions
        }));

        preflightChecks();

        // Migrate
        CometMigrator.Collateral[] memory collateral = new CometMigrator.Collateral[](1);
        collateral[0] = CometMigrator.Collateral({
            cToken: cUNI,
            amount: type(uint256).max
        });

        vm.startPrank(borrower);
        cUNI.approve(address(migrator), type(uint256).max);
        comet.allow(address(migrator), true);

        CometMigrator.BorrowData[] memory borrowData = new CometMigrator.BorrowData[](1);
        borrowData[0] = CometMigrator.BorrowData({
            borrowCToken: cUSDC,
            borrowAmount: type(uint256).max,
            poolInfo: CometMigrator.UniswapPoolInfo({
                token0: address(dai),
                token1: address(usdc),
                fee: 100
            }),
            isFlashLoan: true
        });
        migrator.migrate(collateral, borrowData, address(usdc));

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
        BorrowPosition[] memory borrowPositions = new BorrowPosition[](1);
        borrowPositions[0] = BorrowPosition({
            borrowCToken: cUSDC,
            amount: 1400e6
        });
        posit(Posit({
            borrower: borrower,
            positions: positions,
            borrows: borrowPositions
        }));

        uint256 cUNIPre = cUNI.balanceOf(borrower);
        preflightChecks();

        // Migrate
        CometMigrator.Collateral[] memory collateral = new CometMigrator.Collateral[](1);
        uint256 migrateAmount = amountToTokens(199e18, cUNI);
        collateral[0] = CometMigrator.Collateral({
            cToken: cUNI,
            amount: migrateAmount
        });

        vm.startPrank(borrower);
        cUNI.approve(address(migrator), type(uint256).max);
        comet.allow(address(migrator), true);

        CometMigrator.BorrowData[] memory borrowData = new CometMigrator.BorrowData[](1);
        borrowData[0] = CometMigrator.BorrowData({
            borrowCToken: cUSDC,
            borrowAmount: 600e6,
            poolInfo: CometMigrator.UniswapPoolInfo({
                token0: address(dai),
                token1: address(usdc),
                fee: 100
            }),
            isFlashLoan: true
        });
        migrator.migrate(collateral, borrowData, address(usdc));

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
        BorrowPosition[] memory borrowPositions = new BorrowPosition[](1);
        borrowPositions[0] = BorrowPosition({
            borrowCToken: cUSDC,
            amount: 1400e6
        });
        posit(Posit({
            borrower: borrower,
            positions: positions,
            borrows: borrowPositions
        }));

        uint256 cUNIPre = cUNI.balanceOf(borrower);
        uint256 cETHPre = cETH.balanceOf(borrower);
        preflightChecks();

        // Migrate
        CometMigrator.Collateral[] memory collateral = new CometMigrator.Collateral[](2);
        uint256 uniMigrateAmount = amountToTokens(199e18, cUNI);
        collateral[0] = CometMigrator.Collateral({
            cToken: cUNI,
            amount: uniMigrateAmount
        });
        uint256 ethMigrateAmount = amountToTokens(0.6e18, cETH);
        collateral[1] = CometMigrator.Collateral({
            cToken: cETH,
            amount: ethMigrateAmount
        });

        vm.startPrank(borrower);
        cETH.approve(address(migrator), type(uint256).max); // TODO: Test without approval
        cUNI.approve(address(migrator), type(uint256).max);
        comet.allow(address(migrator), true);

        CometMigrator.BorrowData[] memory borrowData = new CometMigrator.BorrowData[](1);
        borrowData[0] = CometMigrator.BorrowData({
            borrowCToken: cUSDC,
            borrowAmount: 1200e6,
            poolInfo: CometMigrator.UniswapPoolInfo({
                token0: address(dai),
                token1: address(usdc),
                fee: 100
            }),
            isFlashLoan: true
        });
        migrator.migrate(collateral, borrowData, address(usdc));

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
        BorrowPosition[] memory borrowPositions = new BorrowPosition[](1);
        borrowPositions[0] = BorrowPosition({
            borrowCToken: cUSDC,
            amount: 700e6
        });
        posit(Posit({
            borrower: borrower,
            positions: positions,
            borrows: borrowPositions
        }));

        uint256 cUNIPre = cUNI.balanceOf(borrower);
        preflightChecks();

        // Migrate
        CometMigrator.Collateral[] memory collateral = new CometMigrator.Collateral[](1);
        uint256 migrateAmount = amountToTokens(199e18, cUNI);
        collateral[0] = CometMigrator.Collateral({
            cToken: cUNI,
            amount: migrateAmount
        });

        vm.startPrank(borrower);
        cUNI.approve(address(migrator), 0);
        comet.allow(address(migrator), true);
        vm.expectRevert(stdError.arithmeticError);

        CometMigrator.BorrowData[] memory borrowData = new CometMigrator.BorrowData[](1);
        borrowData[0] = CometMigrator.BorrowData({
            borrowCToken: cUSDC,
            borrowAmount: 600e6,
            poolInfo: CometMigrator.UniswapPoolInfo({
                token0: address(dai),
                token1: address(usdc),
                fee: 100
            }),
            isFlashLoan: true
        });
        migrator.migrate(collateral, borrowData, address(usdc));

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
        BorrowPosition[] memory borrowPositions = new BorrowPosition[](1);
        borrowPositions[0] = BorrowPosition({
            borrowCToken: cUSDC,
            amount: 700e6
        });
        posit(Posit({
            borrower: borrower,
            positions: positions,
            borrows: borrowPositions
        }));

        uint256 cETHPre = cETH.balanceOf(borrower);
        preflightChecks();

        // Migrate
        CometMigrator.Collateral[] memory collateral = new CometMigrator.Collateral[](1);
        uint256 migrateAmount = amountToTokens(0.6e18, cETH);
        collateral[0] = CometMigrator.Collateral({
            cToken: cETH,
            amount: migrateAmount
        });

        vm.startPrank(borrower);
        cETH.approve(address(migrator), 0);
        comet.allow(address(migrator), true);

        vm.expectRevert(CometMigrator.CTokenTransferFailure.selector);

        CometMigrator.BorrowData[] memory borrowData = new CometMigrator.BorrowData[](1);
        borrowData[0] = CometMigrator.BorrowData({
            borrowCToken: cUSDC,
            borrowAmount: 600e6,
            poolInfo: CometMigrator.UniswapPoolInfo({
                token0: address(dai),
                token1: address(usdc),
                fee: 100
            }),
            isFlashLoan: true
        });
        migrator.migrate(collateral, borrowData, address(usdc));

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
        BorrowPosition[] memory borrowPositions = new BorrowPosition[](1);
        borrowPositions[0] = BorrowPosition({
            borrowCToken: cUSDC,
            amount: 700e6
        });
        posit(Posit({
            borrower: borrower,
            positions: positions,
            borrows: borrowPositions
        }));

        uint256 cUNIPre = cUNI.balanceOf(borrower);
        preflightChecks();

        // Migrate
        CometMigrator.Collateral[] memory collateral = new CometMigrator.Collateral[](1);
        uint256 migrateAmount = amountToTokens(400e18, cUNI);
        collateral[0] = CometMigrator.Collateral({
            cToken: cUNI,
            amount: migrateAmount
        });

        vm.startPrank(borrower);
        cUNI.approve(address(migrator), type(uint256).max);
        comet.allow(address(migrator), true);
        vm.expectRevert(abi.encodeWithSelector(CTokenLike.TransferComptrollerRejection.selector, 4));

        CometMigrator.BorrowData[] memory borrowData = new CometMigrator.BorrowData[](1);
        borrowData[0] = CometMigrator.BorrowData({
            borrowCToken: cUSDC,
            borrowAmount: 600e6,
            poolInfo: CometMigrator.UniswapPoolInfo({
                token0: address(dai),
                token1: address(usdc),
                fee: 100
            }),
            isFlashLoan: true
        });
        migrator.migrate(collateral, borrowData, address(usdc));

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
        BorrowPosition[] memory borrowPositions = new BorrowPosition[](1);
        borrowPositions[0] = BorrowPosition({
            borrowCToken: cUSDC,
            amount: 700e6
        });
        posit(Posit({
            borrower: borrower,
            positions: positions,
            borrows: borrowPositions
        }));

        uint256 cETHPre = cETH.balanceOf(borrower);
        preflightChecks();

        // Migrate
        CometMigrator.Collateral[] memory collateral = new CometMigrator.Collateral[](1);
        uint256 migrateAmount = amountToTokens(200e18, cETH);
        collateral[0] = CometMigrator.Collateral({
            cToken: cETH,
            amount: migrateAmount
        });

        vm.startPrank(borrower);
        cETH.approve(address(migrator), type(uint256).max);
        comet.allow(address(migrator), true);

        vm.expectRevert(CometMigrator.CTokenTransferFailure.selector);

        CometMigrator.BorrowData[] memory borrowData = new CometMigrator.BorrowData[](1);
        borrowData[0] = CometMigrator.BorrowData({
            borrowCToken: cUSDC,
            borrowAmount: 600e6,
            poolInfo: CometMigrator.UniswapPoolInfo({
                token0: address(dai),
                token1: address(usdc),
                fee: 100
            }),
            isFlashLoan: true
        });
        migrator.migrate(collateral, borrowData, address(usdc));

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
        BorrowPosition[] memory borrowPositions = new BorrowPosition[](1);
        borrowPositions[0] = BorrowPosition({
            borrowCToken: cUSDC,
            amount: 700e6
        });
        posit(Posit({
            borrower: borrower,
            positions: positions,
            borrows: borrowPositions
        }));

        uint256 cUNIPre = cUNI.balanceOf(borrower);
        preflightChecks();

        // Migrate
        CometMigrator.Collateral[] memory collateral = new CometMigrator.Collateral[](1);
        uint256 migrateAmount = amountToTokens(200e18, cUNI);
        collateral[0] = CometMigrator.Collateral({
            cToken: cUNI,
            amount: migrateAmount
        });

        vm.startPrank(borrower);
        cUNI.approve(address(migrator), type(uint256).max);
        vm.expectRevert(Comet.Unauthorized.selector);

        CometMigrator.BorrowData[] memory borrowData = new CometMigrator.BorrowData[](1);
        borrowData[0] = CometMigrator.BorrowData({
            borrowCToken: cUSDC,
            borrowAmount: 600e6,
            poolInfo: CometMigrator.UniswapPoolInfo({
                token0: address(dai),
                token1: address(usdc),
                fee: 100
            }),
            isFlashLoan: true
        });
        migrator.migrate(collateral, borrowData, address(usdc));

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
        BorrowPosition[] memory borrowPositions = new BorrowPosition[](1);
        borrowPositions[0] = BorrowPosition({
            borrowCToken: cUSDC,
            amount: 700e6
        });
        posit(Posit({
            borrower: borrower,
            positions: positions,
            borrows: borrowPositions
        }));

        uint256 cUNIPre = cUNI.balanceOf(borrower);
        preflightChecks();

        // Migrate
        CometMigrator.Collateral[] memory collateral = new CometMigrator.Collateral[](1);
        uint256 migrateAmount = amountToTokens(200e18, cUNI);
        collateral[0] = CometMigrator.Collateral({
            cToken: cUNI,
            amount: migrateAmount
        });

        vm.startPrank(borrower);
        cUNI.approve(address(migrator), type(uint256).max);
        comet.allow(address(migrator), true);

        vm.expectRevert(abi.encodeWithSelector(CTokenLike.TransferComptrollerRejection.selector, 4));

        CometMigrator.BorrowData[] memory borrowData = new CometMigrator.BorrowData[](1);
        borrowData[0] = CometMigrator.BorrowData({
            borrowCToken: cUSDC,
            borrowAmount: 0e6,
            poolInfo: CometMigrator.UniswapPoolInfo({
                token0: address(dai),
                token1: address(usdc),
                fee: 100
            }),
            isFlashLoan: true
        });
        migrator.migrate(collateral, borrowData, address(usdc));

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
        BorrowPosition[] memory borrowPositions = new BorrowPosition[](1);
        borrowPositions[0] = BorrowPosition({
            borrowCToken: cUSDC,
            amount: 700e6
        });
        posit(Posit({
            borrower: borrower,
            positions: positions,
            borrows: borrowPositions
        }));

        uint256 cUNIPre = cUNI.balanceOf(borrower);
        preflightChecks();

        // Migrate
        CometMigrator.Collateral[] memory collateral = new CometMigrator.Collateral[](1);
        uint256 migrateAmount = amountToTokens(200e18, cUNI);
        collateral[0] = CometMigrator.Collateral({
            cToken: cUNI,
            amount: migrateAmount
        });

        vm.startPrank(borrower);
        cUNI.approve(address(migrator), type(uint256).max);
        comet.allow(address(migrator), true);

        vm.expectRevert(abi.encodeWithSelector(CometMigrator.CompoundV2Error.selector, 0, 9));

        CometMigrator.BorrowData[] memory borrowData = new CometMigrator.BorrowData[](1);
        borrowData[0] = CometMigrator.BorrowData({
            borrowCToken: cUSDC,
            borrowAmount: 800e6,
            poolInfo: CometMigrator.UniswapPoolInfo({
                token0: address(dai),
                token1: address(usdc),
                fee: 100
            }),
            isFlashLoan: true
        });
        migrator.migrate(collateral, borrowData, address(usdc));

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
        BorrowPosition[] memory borrowPositions = new BorrowPosition[](1);
        borrowPositions[0] = BorrowPosition({
            borrowCToken: cUSDC,
            amount: 700e6
        });
        posit(Posit({
            borrower: borrower,
            positions: positions,
            borrows: borrowPositions
        }));

        uint256 cUNIPre = cUNI.balanceOf(borrower);
        preflightChecks();

        // Migrate
        CometMigrator.Collateral[] memory collateral = new CometMigrator.Collateral[](1);
        collateral[0] = CometMigrator.Collateral({
            cToken: CTokenLike(address(uni)),
            amount: 0
        });

        vm.startPrank(borrower);
        cUNI.approve(address(migrator), type(uint256).max);
        comet.allow(address(migrator), true);

        vm.expectRevert(abi.encodeWithSelector(CometMigrator.CompoundV2Error.selector, 0, 9));

        CometMigrator.BorrowData[] memory borrowData = new CometMigrator.BorrowData[](1);
        borrowData[0] = CometMigrator.BorrowData({
            borrowCToken: cUSDC,
            borrowAmount: 800e6,
            poolInfo: CometMigrator.UniswapPoolInfo({
                token0: address(dai),
                token1: address(usdc),
                fee: 100
            }),
            isFlashLoan: true
        });
        migrator.migrate(collateral, borrowData, address(usdc));

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
        BorrowPosition[] memory borrowPositions = new BorrowPosition[](1);
        borrowPositions[0] = BorrowPosition({
            borrowCToken: cUSDC,
            amount: 700e6
        });
        posit(Posit({
            borrower: borrower,
            positions: positions,
            borrows: borrowPositions
        }));

        uint256 cUNIPre = cUNI.balanceOf(borrower);
        preflightChecks();

        // Migrate
        CometMigrator.Collateral[] memory collateral = new CometMigrator.Collateral[](1);
        collateral[0] = CometMigrator.Collateral({
            cToken: CTokenLike(0x0000000000000000000000000000000000000000),
            amount: 0
        });

        vm.startPrank(borrower);
        cUNI.approve(address(migrator), type(uint256).max);
        comet.allow(address(migrator), true);

        vm.expectRevert(abi.encodeWithSelector(CometMigrator.CompoundV2Error.selector, 0, 9));

        CometMigrator.BorrowData[] memory borrowData = new CometMigrator.BorrowData[](1);
        borrowData[0] = CometMigrator.BorrowData({
            borrowCToken: cUSDC,
            borrowAmount: 800e6,
            poolInfo: CometMigrator.UniswapPoolInfo({
                token0: address(dai),
                token1: address(usdc),
                fee: 100
            }),
            isFlashLoan: true
        });
        migrator.migrate(collateral, borrowData, address(usdc));

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
        BorrowPosition[] memory borrowPositions = new BorrowPosition[](1);
        borrowPositions[0] = BorrowPosition({
            borrowCToken: cUSDC,
            amount: 700e6
        });
        posit(Posit({
            borrower: borrower,
            positions: positions,
            borrows: borrowPositions
        }));

        uint256 cUNIPre = cUNI.balanceOf(borrower);
        preflightChecks();

        // Migrate
        CometMigrator.Collateral[] memory collateral = new CometMigrator.Collateral[](0);

        vm.startPrank(borrower);
        cUNI.approve(address(migrator), type(uint256).max);
        comet.allow(address(migrator), true);

        CometMigrator.BorrowData[] memory borrowData = new CometMigrator.BorrowData[](1);
        borrowData[0] = CometMigrator.BorrowData({
            borrowCToken: cUSDC,
            borrowAmount: 0e6,
            poolInfo: CometMigrator.UniswapPoolInfo({
                token0: address(dai),
                token1: address(usdc),
                fee: 100
            }),
            isFlashLoan: true
        });
        migrator.migrate(collateral, borrowData, address(usdc));

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

    function testMigrateUniPosition_flashSwapAllDai() public {
        // Posit
        Position[] memory positions = new Position[](1);
        positions[0] = Position({
            collateral: cUNI,
            amount: 300e18 // ~ $5 * 300 = ~$1500 75% collateral factor = $1,000
        });
        BorrowPosition[] memory borrowPositions = new BorrowPosition[](1);
        borrowPositions[0] = BorrowPosition({
            borrowCToken: cDAI,
            amount: 350e18
        });
        posit(Posit({
            borrower: borrower,
            positions: positions,
            borrows: borrowPositions
        }));

        uint256 cUNIPre = cUNI.balanceOf(borrower);
        preflightChecks();

        // Migrate
        CometMigrator.Collateral[] memory collateral = new CometMigrator.Collateral[](1);
        uint256 migrateAmount = amountToTokens(199e18, cUNI);
        collateral[0] = CometMigrator.Collateral({
            cToken: cUNI,
            amount: migrateAmount
        });

        vm.startPrank(borrower);
        cUNI.approve(address(migrator), type(uint256).max);
        comet.allow(address(migrator), true);

        // Check event
        // XXX borrowAmountWithFee is not exact due to Uniswap slippage
        // vm.expectEmit(true, false, false, true);
        // CometMigrator.TokenRepaid[] memory tokensRepaid = new CometMigrator.TokenRepaid[](1);
        // tokensRepaid[0] = CometMigrator.TokenRepaid({
        //     borrowToken: address(dai),
        //     repayAmount: 350e18
        // });
        // emit Migrated(borrower, collateral, tokensRepaid, 350e6 * 1.0001);

        CometMigrator.BorrowData[] memory borrowData = new CometMigrator.BorrowData[](1);
        borrowData[0] = CometMigrator.BorrowData({
            borrowCToken: cDAI,
            borrowAmount: 350e18,
            poolInfo: CometMigrator.UniswapPoolInfo({
                token0: address(dai),
                token1: address(usdc),
                fee: 100
            }),
            isFlashLoan: false
        });
        migrator.migrate(collateral, borrowData, address(usdc));

        // Check v2 balances
        assertEq(cUNI.balanceOf(borrower), cUNIPre - migrateAmount, "Amount of cUNI should have been migrated");
        assertEq(cDAI.borrowBalanceCurrent(borrower), 0e18, "Remainder of tokens");

        // Check v3 balances
        assertApproxEqRel(comet.collateralBalanceOf(borrower, address(uni)), 199e18, 0.01e18, "v3 collateral balance");
        // Approximate assertion because of slippage from DAI to USDC
        assertApproxEqRel(comet.borrowBalanceOf(borrower), 350e6 * 1.0001, 0.01e18, "v3 borrow balance");
    }

    function testMigrateUniPosition_flashSwapAllUsdt() public {
        // Posit
        Position[] memory positions = new Position[](1);
        positions[0] = Position({
            collateral: cUNI,
            amount: 300e18 // ~ $5 * 300 = ~$1500 75% collateral factor = $1,000
        });
        BorrowPosition[] memory borrowPositions = new BorrowPosition[](1);
        borrowPositions[0] = BorrowPosition({
            borrowCToken: cUSDT,
            amount: 350e6
        });
        posit(Posit({
            borrower: borrower,
            positions: positions,
            borrows: borrowPositions
        }));

        uint256 cUNIPre = cUNI.balanceOf(borrower);
        preflightChecks();

        // Migrate
        CometMigrator.Collateral[] memory collateral = new CometMigrator.Collateral[](1);
        uint256 migrateAmount = amountToTokens(199e18, cUNI);
        collateral[0] = CometMigrator.Collateral({
            cToken: cUNI,
            amount: migrateAmount
        });

        vm.startPrank(borrower);
        cUNI.approve(address(migrator), type(uint256).max);
        comet.allow(address(migrator), true);

        // Check event
        // XXX borrowAmountWithFee is not exact due to Uniswap slippage
        // vm.expectEmit(true, false, false, true);
        // CometMigrator.TokenRepaid[] memory tokensRepaid = new CometMigrator.TokenRepaid[](1);
        // tokensRepaid[0] = CometMigrator.TokenRepaid({
        //     borrowToken: address(usdt),
        //     repayAmount: 350e6
        // });
        // emit Migrated(borrower, collateral, tokensRepaid, 350e6 * 1.0001);

        CometMigrator.BorrowData[] memory borrowData = new CometMigrator.BorrowData[](1);
        borrowData[0] = CometMigrator.BorrowData({
            borrowCToken: cUSDT,
            borrowAmount: 350e6,
            poolInfo: CometMigrator.UniswapPoolInfo({
                token0: address(usdt),
                token1: address(usdc),
                fee: 100
            }),
            isFlashLoan: false
        });
        migrator.migrate(collateral, borrowData, address(usdc));

        // Check v2 balances
        assertEq(cUNI.balanceOf(borrower), cUNIPre - migrateAmount, "Amount of cUNI should have been migrated");
        assertEq(cUSDT.borrowBalanceCurrent(borrower), 0e6, "Remainder of tokens");

        // Check v3 balances
        assertApproxEqRel(comet.collateralBalanceOf(borrower, address(uni)), 199e18, 0.01e18, "v3 collateral balance");
        assertApproxEqRel(comet.borrowBalanceOf(borrower), 350e6 * 1.0001, 0.01e18, "v3 borrow balance");
    }

    function testMigrateUniPosition_WithTwoBorrows_LoanFirstSwapSecond() public {
        // Posit
        Position[] memory positions = new Position[](1);
        positions[0] = Position({
            collateral: cUNI,
            amount: 300e18 // ~ $5 * 300 = ~$1500 75% collateral factor = $1,000
        });
        BorrowPosition[] memory borrowPositions = new BorrowPosition[](2);
        borrowPositions[0] = BorrowPosition({
            borrowCToken: cUSDC,
            amount: 350e6
        });
        borrowPositions[1] = BorrowPosition({
            borrowCToken: cDAI,
            amount: 350e18
        });
        posit(Posit({
            borrower: borrower,
            positions: positions,
            borrows: borrowPositions
        }));

        uint256 cUNIPre = cUNI.balanceOf(borrower);
        preflightChecks();

        // Migrate
        CometMigrator.Collateral[] memory collateral = new CometMigrator.Collateral[](1);
        uint256 migrateAmount = amountToTokens(199e18, cUNI);
        collateral[0] = CometMigrator.Collateral({
            cToken: cUNI,
            amount: migrateAmount
        });

        vm.startPrank(borrower);
        cUNI.approve(address(migrator), type(uint256).max);
        comet.allow(address(migrator), true);

        // Check event
        // XXX borrowAmountWithFee is not exact due to Uniswap slippage
        // vm.expectEmit(true, false, false, true);
        // CometMigrator.TokenRepaid[] memory tokensRepaid = new CometMigrator.TokenRepaid[](2);
        // tokensRepaid[0] = CometMigrator.TokenRepaid({
        //     borrowToken: address(usdc),
        //     repayAmount: 350e6
        // });
        // tokensRepaid[1] = CometMigrator.TokenRepaid({
        //     borrowToken: address(dai),
        //     repayAmount: 350e18
        // });
        // emit Migrated(borrower, collateral, tokensRepaid, 700e6 * 1.0001);

        CometMigrator.BorrowData[] memory borrowData = new CometMigrator.BorrowData[](2);
        borrowData[0] = CometMigrator.BorrowData({
            borrowCToken: cUSDC,
            borrowAmount: 350e6,
            poolInfo: CometMigrator.UniswapPoolInfo({
                token0: address(usdt),
                token1: address(usdc),
                fee: 100
            }),
            isFlashLoan: true
        });
        borrowData[1] = CometMigrator.BorrowData({
            borrowCToken: cDAI,
            borrowAmount: 350e18,
            poolInfo: CometMigrator.UniswapPoolInfo({
                token0: address(dai),
                token1: address(usdc),
                fee: 100
            }),
            isFlashLoan: false
        });
        migrator.migrate(collateral, borrowData, address(usdc));

        // Check v2 balances
        assertEq(cUNI.balanceOf(borrower), cUNIPre - migrateAmount, "Amount of cUNI should have been migrated");
        assertEq(cUSDC.borrowBalanceCurrent(borrower), 0e6, "Remainder of tokens");
        assertEq(cDAI.borrowBalanceCurrent(borrower), 0e18, "Remainder of tokens");

        // Check v3 balances
        assertApproxEqRel(comet.collateralBalanceOf(borrower, address(uni)), 199e18, 0.01e18, "v3 collateral balance");
        assertApproxEqRel(comet.borrowBalanceOf(borrower), 700e6 * 1.0001, 0.01e18, "v3 borrow balance");
    }

    function testMigrateUniPosition_WithTwoBorrows_SwapFirstLoanSecond() public {
        // Posit
        Position[] memory positions = new Position[](1);
        positions[0] = Position({
            collateral: cUNI,
            amount: 300e18 // ~ $5 * 300 = ~$1500 75% collateral factor = $1,000
        });
        BorrowPosition[] memory borrowPositions = new BorrowPosition[](2);
        borrowPositions[0] = BorrowPosition({
            borrowCToken: cUSDC,
            amount: 350e6
        });
        borrowPositions[1] = BorrowPosition({
            borrowCToken: cDAI,
            amount: 350e18
        });
        posit(Posit({
            borrower: borrower,
            positions: positions,
            borrows: borrowPositions
        }));

        uint256 cUNIPre = cUNI.balanceOf(borrower);
        preflightChecks();

        // Migrate
        CometMigrator.Collateral[] memory collateral = new CometMigrator.Collateral[](1);
        uint256 migrateAmount = amountToTokens(199e18, cUNI);
        collateral[0] = CometMigrator.Collateral({
            cToken: cUNI,
            amount: migrateAmount
        });

        vm.startPrank(borrower);
        cUNI.approve(address(migrator), type(uint256).max);
        comet.allow(address(migrator), true);

        // Check event
        // XXX borrowAmountWithFee is not exact due to Uniswap slippage
        // vm.expectEmit(true, false, false, true);
        // CometMigrator.TokenRepaid[] memory tokensRepaid = new CometMigrator.TokenRepaid[](2);
        // tokensRepaid[0] = CometMigrator.TokenRepaid({
        //     borrowToken: address(dai),
        //     repayAmount: 350e18
        // });
        // tokensRepaid[1] = CometMigrator.TokenRepaid({
        //     borrowToken: address(usdc),
        //     repayAmount: 350e6
        // });
        // emit Migrated(borrower, collateral, tokensRepaid, 700e6 * 1.0001);

        CometMigrator.BorrowData[] memory borrowData = new CometMigrator.BorrowData[](2);
        borrowData[0] = CometMigrator.BorrowData({
            borrowCToken: cDAI,
            borrowAmount: 350e18,
            poolInfo: CometMigrator.UniswapPoolInfo({
                token0: address(dai),
                token1: address(usdc),
                fee: 100
            }),
            isFlashLoan: false
        });
        borrowData[1] = CometMigrator.BorrowData({
            borrowCToken: cUSDC,
            borrowAmount: 350e6,
            poolInfo: CometMigrator.UniswapPoolInfo({
                token0: address(usdt),
                token1: address(usdc),
                fee: 100
            }),
            isFlashLoan: true
        });
        migrator.migrate(collateral, borrowData, address(usdc));

        // Check v2 balances
        assertEq(cUNI.balanceOf(borrower), cUNIPre - migrateAmount, "Amount of cUNI should have been migrated");
        assertEq(cUSDC.borrowBalanceCurrent(borrower), 0e6, "Remainder of tokens");
        assertEq(cDAI.borrowBalanceCurrent(borrower), 0e18, "Remainder of tokens");

        // Check v3 balances
        assertApproxEqRel(comet.collateralBalanceOf(borrower, address(uni)), 199e18, 0.01e18, "v3 collateral balance");
        assertApproxEqRel(comet.borrowBalanceOf(borrower), 700e6 * 1.0001, 0.01e18, "v3 borrow balance");
    }

    function testMigrateUniPosition_WithThreeBorrows() public {
        // Posit
        Position[] memory positions = new Position[](1);
        positions[0] = Position({
            collateral: cUNI,
            amount: 300e18 // ~ $5 * 300 = ~$1500 75% collateral factor = $1,000
        });
        BorrowPosition[] memory borrowPositions = new BorrowPosition[](3);
        borrowPositions[0] = BorrowPosition({
            borrowCToken: cUSDC,
            amount: 200e6
        });
        borrowPositions[1] = BorrowPosition({
            borrowCToken: cDAI,
            amount: 200e18
        });
        borrowPositions[2] = BorrowPosition({
            borrowCToken: cUSDT,
            amount: 200e6
        });
        posit(Posit({
            borrower: borrower,
            positions: positions,
            borrows: borrowPositions
        }));

        uint256 cUNIPre = cUNI.balanceOf(borrower);
        preflightChecks();

        // Migrate
        CometMigrator.Collateral[] memory collateral = new CometMigrator.Collateral[](1);
        uint256 migrateAmount = amountToTokens(199e18, cUNI);
        collateral[0] = CometMigrator.Collateral({
            cToken: cUNI,
            amount: migrateAmount
        });

        vm.startPrank(borrower);
        cUNI.approve(address(migrator), type(uint256).max);
        comet.allow(address(migrator), true);

        // Check event
        // XXX borrowAmountWithFee is not exact due to Uniswap slippage
        // vm.expectEmit(true, false, false, true);
        // CometMigrator.TokenRepaid[] memory tokensRepaid = new CometMigrator.TokenRepaid[](3);
        // tokensRepaid[0] = CometMigrator.TokenRepaid({
        //     borrowToken: address(dai),
        //     repayAmount: 200e18
        // });
        // tokensRepaid[1] = CometMigrator.TokenRepaid({
        //     borrowToken: address(usdc),
        //     repayAmount: 200e6
        // });
        // tokensRepaid[2] = CometMigrator.TokenRepaid({
        //     borrowToken: address(usdt),
        //     repayAmount: 200e6
        // });
        // emit Migrated(borrower, collateral, tokensRepaid, 600e6 * 1.0001);

        CometMigrator.BorrowData[] memory borrowData = new CometMigrator.BorrowData[](3);
        borrowData[0] = CometMigrator.BorrowData({
            borrowCToken: cDAI,
            borrowAmount: 200e18,
            poolInfo: CometMigrator.UniswapPoolInfo({
                token0: address(dai),
                token1: address(usdc),
                fee: 100
            }),
            isFlashLoan: false
        });
        borrowData[1] = CometMigrator.BorrowData({
            borrowCToken: cUSDC,
            borrowAmount: 200e6,
            poolInfo: CometMigrator.UniswapPoolInfo({
                token0: address(dai),
                token1: address(usdc),
                fee: 500
            }),
            isFlashLoan: true
        });
        borrowData[2] = CometMigrator.BorrowData({
            borrowCToken: cUSDT,
            borrowAmount: 200e6,
            poolInfo: CometMigrator.UniswapPoolInfo({
                token0: address(usdt),
                token1: address(usdc),
                fee: 100
            }),
            isFlashLoan: false
        });
        migrator.migrate(collateral, borrowData, address(usdc));

        // Check v2 balances
        assertEq(cUNI.balanceOf(borrower), cUNIPre - migrateAmount, "Amount of cUNI should have been migrated");
        assertEq(cUSDC.borrowBalanceCurrent(borrower), 0e6, "Remainder of tokens");
        assertEq(cDAI.borrowBalanceCurrent(borrower), 0e18, "Remainder of tokens");
        assertEq(cUSDT.borrowBalanceCurrent(borrower), 0e6, "Remainder of tokens");

        // Check v3 balances
        assertApproxEqRel(comet.collateralBalanceOf(borrower, address(uni)), 199e18, 0.01e18, "v3 collateral balance");
        assertApproxEqRel(comet.borrowBalanceOf(borrower), 600e6 * 1.0001, 0.01e18, "v3 borrow balance");
    }

    // XXX test partial repay with flash swaps
    // XXX test invalid pools
    //        -flash loan from pool that isn't borrowing USDC
    //        -flash swap from pool that isn't paired with USDC

    function preflightChecks() internal {
        require(comet.collateralBalanceOf(borrower, address(uni)) == 0, "no starting uni collateral balance");
        require(comet.collateralBalanceOf(borrower, address(weth)) == 0, "no starting weth collateral balance");
        require(comet.borrowBalanceOf(borrower) == 0, "no starting v3 borrow balance");
        migrator.sweep(IERC20(0x0000000000000000000000000000000000000000));
        require(address(migrator).balance == 0, "no starting v3 eth");
    }
}
