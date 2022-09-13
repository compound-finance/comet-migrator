// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import "forge-std/Script.sol";
import "../src/Comet_V2_Migrator.sol";
import "forge-std/Test.sol";
import "./MainnetConstants.t.sol";
import "./Positor.t.sol";

contract ContractTest is Positor {
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
        require(comet.collateralBalanceOf(borrower, address(uni)) == 0, "no starting collateral balance");
        require(comet.borrowBalanceOf(borrower) == 0, "no starting v3 borrow balance");

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
        require(comet.collateralBalanceOf(borrower, address(weth)) == 0, "no starting collateral balance");
        require(comet.borrowBalanceOf(borrower) == 0, "no starting v3 borrow balance");

        // Migrate
        Comet_V2_Migrator.Collateral[] memory collateral = new Comet_V2_Migrator.Collateral[](1);
        uint256 migrateAmount = amountToTokens(0.1e18, cETH);
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
        assertApproxEqRel(comet.collateralBalanceOf(borrower, address(weth)), 0.1e18, 0.01e18, "v3 collateral balance");
        assertEq(comet.borrowBalanceOf(borrower), 600e6 * 1.0001, "v3 borrow balance");
    }
}
