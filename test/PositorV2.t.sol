// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import "forge-std/Script.sol";
import "../src/CometMigratorV2.sol";
import "forge-std/Test.sol";
import "./MainnetConstantsV2.t.sol";

contract Positor is Test, MainnetConstants {
    // Units used in Maker contracts
    uint256 internal constant RAY = 10**27;

    // XXX change name to `PositCompoundV2`?
    struct Posit {
        address borrower;
        CometMigratorV2.CompoundV2Collateral[] collateral;
        CometMigratorV2.CompoundV2Borrow[] borrows;
    }

    struct PositAaveV2 {
        address borrower;
        CometMigratorV2.AaveV2Collateral[] collateral;
        CometMigratorV2.AaveV2Borrow[] borrows;
    }

    struct PositCdp {
        address borrower;
        CometMigratorV2.CDPPosition[] positions;
    }

    // Note: We need this because `deal` is currently incompatible with aTokens
    // See: https://github.com/foundry-rs/forge-std/issues/140
    mapping (ATokenLike => address) aTokenHolders;
    CometMigratorV2 public immutable migrator;

    constructor() {
        aTokenHolders[aUNI] = aHolderUni;
        aTokenHolders[aWETH] = aHolderWeth;

        console.log("Deploying Comet Migrator");
        migrator = deployCometMigrator();
        console.log("Deployed Comet Migrator", address(migrator));
    }

    function posit(Posit memory posit_) public {
        setupCompoundV2MigratorBorrow(posit_.borrower, posit_.collateral, posit_.borrows);
    }

    function positAaveV2(PositAaveV2 memory posit_) public {
        setupAaveV2MigratorBorrow(posit_.borrower, posit_.collateral, posit_.borrows);
    }

    function positCdp(PositCdp memory posit_) public returns (uint256[] memory) {
        return setupCdpBorrows(posit_.borrower, posit_.positions);
    }

    function setupCompoundV2MigratorBorrow(address borrower, CometMigratorV2.CompoundV2Collateral[] memory collateral, CometMigratorV2.CompoundV2Borrow[] memory borrows) internal returns (CometMigratorV2) {
        for (uint8 i = 0; i < collateral.length; i++) {
            setupCompoundV2Collateral(borrower, collateral[i].cToken, collateral[i].amount);
        }

        for (uint8 i = 0; i < borrows.length; i++) {
            CTokenLike cToken = borrows[i].cToken;
            IERC20NonStandard underlying;
            uint256 preUnderlyingAmount;
            if (cToken == cETH) {
                underlying = weth;
                preUnderlyingAmount = address(borrower).balance;
            } else {
                underlying = IERC20NonStandard(CErc20(address(cToken)).underlying());
                preUnderlyingAmount = underlying.balanceOf(borrower);
            }
            uint256 borrowAmount = borrows[i].amount;
            vm.prank(borrower);
            require(cToken.borrow(borrowAmount) == 0, "failed to borrow");
            if (cToken == cETH) {
                require(address(borrower).balance - preUnderlyingAmount == borrowAmount, "incorrect borrow");
            } else {
                require(underlying.balanceOf(borrower) - preUnderlyingAmount == borrowAmount, "incorrect borrow");
            }
            require(cToken.borrowBalanceCurrent(borrower) >= borrowAmount, "incorrect borrow");
        }

        return migrator;
    }

    function setupCompoundV2Collateral(address borrower, CTokenLike cToken, uint256 amount) internal {
        // Next, let's transfer in some of the cToken to ourselves
        uint256 tokens = amountToTokens(amount, cToken);
        console.log(address(cToken), tokens);
        deal(address(cToken), borrower, tokens);

        require(cToken.balanceOf(borrower) == tokens, "invalid cToken balance");

        // Next, we need to enter this market
        vm.prank(borrower);
        address[] memory markets = new address[](1);
        markets[0] = address(cToken);
        comptroller.enterMarkets(markets);
    }

    function setupAaveV2MigratorBorrow(address borrower, CometMigratorV2.AaveV2Collateral[] memory collateral, CometMigratorV2.AaveV2Borrow[] memory borrows) internal returns (CometMigratorV2) {
        for (uint8 i = 0; i < collateral.length; i++) {
            setupAaveV2Collateral(borrower, collateral[i].aToken, collateral[i].amount);
        }

        for (uint8 i = 0; i < borrows.length; i++) {
            ADebtTokenLike aDebtToken = borrows[i].aDebtToken;
            IERC20NonStandard underlying = IERC20NonStandard(aDebtToken.UNDERLYING_ASSET_ADDRESS());
            uint256 preUnderlyingAmount = underlying.balanceOf(borrower);
            uint256 borrowAmount = borrows[i].amount;
            vm.prank(borrower);
            aDebtToken.approveDelegation(address(this), type(uint256).max);
            vm.prank(borrower); // XXX prank not using the correct msg.sender for borrow, so we approveDelegation above first
            aaveV2LendingPool.borrow(address(underlying), borrowAmount, aDebtToken.DEBT_TOKEN_REVISION(), 0, borrower);
            underlying.transfer(borrower, borrowAmount);
            require(underlying.balanceOf(borrower) - preUnderlyingAmount == borrowAmount, "incorrect borrow");
            require(aDebtToken.balanceOf(borrower) >= borrowAmount, "incorrect borrow");
        }

        return migrator;
    }

    function setupAaveV2Collateral(address borrower, ATokenLike aToken, uint256 amount) internal {
        // Next, let's transfer in some of the aToken to ourselves
        console.log(address(aToken), amount);
        vm.prank(aTokenHolders[aToken]);
        aToken.transfer(borrower, amount);

        require(aToken.balanceOf(borrower) == amount, "invalid aToken balance");
    }

    function setupCdpBorrows(address borrower, CometMigratorV2.CDPPosition[] memory cdpPositions) internal returns (uint256[] memory) {
        uint256[] memory cdpIds = new uint256[](cdpPositions.length);
        for (uint8 i = 0; i < cdpPositions.length; i++) {
            CometMigratorV2.CDPPosition memory position = cdpPositions[i];
            GemJoinLike gemJoin = position.gemJoin;
            bytes32 ilk = position.gemJoin.ilk();
            VatLike vat = VatLike(cdpManager.vat());

            // Open new CDP for borrower
            uint256 cdpId = cdpManager.open(ilk, borrower);
            cdpIds[i] = cdpId;
            // Borrower allows this contract to manage the CDP
            vm.prank(borrower);
            cdpManager.cdpAllow(cdpId, address(this), 1);
            // Deposit collateral and borrow DAI
            IERC20NonStandard collateral = IERC20NonStandard(gemJoin.gem());
            deal(address(collateral), address(this), position.collateralAmount);
            collateral.approve(address(gemJoin), position.collateralAmount);
            address urn = cdpManager.urns(cdpId);
            gemJoin.join(urn, position.collateralAmount);
            cdpManager.frob(cdpId, int256(convertTo18(gemJoin, position.collateralAmount)), getDrawDart(vat, urn, ilk, position.borrowAmount));
            cdpManager.move(cdpId, address(this), position.borrowAmount * RAY);
            vat.hope(address(daiJoin));
            daiJoin.exit(address(this), position.borrowAmount);
            // Transfer borrowed DAI to borrower
            dai.transfer(borrower, position.borrowAmount);
        }

        require(dai.balanceOf(address(this)) == 0, "migrator should not own DAI");

        return cdpIds;
    }

    function deployCometMigrator() internal returns (CometMigratorV2) {
        return new CometMigratorV2(
            comet,
            usdc,
            cETH,
            weth,
            aaveV2LendingPool,
            cdpManager,
            daiJoin,
            pool_DAI_USDC,
            swapRouter,
            sweepee
        );
    }

    function amountToTokens(uint256 amount, CTokenLike cToken) internal returns (uint256) {
        return ( 1e18 * amount ) / cToken.exchangeRateCurrent();
    }

    function convertTo18(GemJoinLike gemJoin, uint256 amount) internal returns (uint256 wad)
    {
        // For those collaterals that have less than 18 decimals precision we need to do the conversion before
        // passing to frob function
        // Adapters will automatically handle the difference of precision
        wad = amount * (10 ** (18 - gemJoin.dec()));
    }

    // Adapted from https://github.com/makerdao/dss-proxy-actions/blob/master/src/DssProxyActions.sol#L161
    function getDrawDart(
        VatLike vat,
        address urn,
        bytes32 ilk,
        uint256 wad
    ) internal returns (int256 dart) {
        // Updates stability fee rate
        uint256 rate = jug.drip(ilk);

        // Gets DAI balance of the urn in the vat
        uint256 dai = vat.dai(urn);

        // If there was already enough DAI in the vat balance, just exits it without adding more debt
        if (dai < wad * RAY) {
            // Calculates the needed dart so together with the existing dai in the vat is enough to exit wad amount of DAI tokens
            dart = int256(((wad * RAY) - dai) / rate);
            // This is needed due to lack of precision. It might need to sum an extra dart wei (for the given DAI wad amount)
            dart = uint256(dart) * rate < wad * RAY ? dart + 1 : dart;
        }
    }
}
