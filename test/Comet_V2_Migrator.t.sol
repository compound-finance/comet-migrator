// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import "forge-std/Script.sol";
import "../src/Comet_V2_Migrator.sol";
import "forge-std/Test.sol";

interface Comptroller {
    function enterMarkets(address[] memory cTokens) external returns (uint[] memory);
}

contract ContractTest is Test {
    struct Position {
        CTokenLike collateral;
        uint256 amount;
    }
    mapping (CTokenLike => address) holders;

    Comet public constant comet = Comet(0xc3d688B66703497DAA19211EEdff47f25384cdc3);
    IERC20 public constant usdc = IERC20(0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48);
    IERC20 public constant uni = IERC20(0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984);
    CErc20 public constant cUSDC = CErc20(0x39AA39c021dfbaE8faC545936693aC917d5E7563);
    CErc20 public constant cUNI = CErc20(0x35A18000230DA775CAc24873d00Ff85BccdeD550);
    CTokenLike public constant cETH = CTokenLike(0x4Ddc2D193948926D02f9B1fE9e1daa0718270ED5);
    IUniswapV3Pool public constant pool_DAI_USDC = IUniswapV3Pool(0x5777d92f208679DB4b9778590Fa3CAB3aC9e2168);
    address payable public constant sweepee = payable(0x6d903f6003cca6255D85CcA4D3B5E5146dC33925);
    address public constant uniswapFactory = address(0x1F98431c8aD98523631AE4a59f267346ea31F984);
    IWETH9 public constant weth = IWETH9(0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2);
    address public constant cHolderUni = address(0x39d8014b4F40d2CBC441137011d32023f4f1fd87);
    address public constant cHolderEth = address(0xe84A061897afc2e7fF5FB7e3686717C528617487);
    address public constant borrower = address(0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266);
    Comptroller public constant comptroller = Comptroller(0x3d9819210A31b4961b30EF54bE2aeD79B9c9Cd3B);

    function setUp() public {
        holders[cUNI] = cHolderUni;
        holders[cETH] = cHolderEth;
    }

    function setupMigratorBorrow(Position[] memory positions, uint256 borrowAmount) internal returns (Comet_V2_Migrator) {
        console.log("Deploying Comet v2 Migrator");
        Comet_V2_Migrator migrator = deployCometV2Migrator();
        console.log("Deployed Comet v2 Migrator", address(migrator));

        for (uint8 i = 0; i < positions.length; i++) {
            setupV2Borrows(positions[i].collateral, positions[i].amount);
        }

        vm.prank(borrower);
        require(cUSDC.borrow(borrowAmount) == 0, "failed to borrow"); // 100 USDC
        require(usdc.balanceOf(borrower) == borrowAmount, "incorrect borrow");
        require(cUSDC.borrowBalanceCurrent(borrower) >= borrowAmount, "incorrect borrow");

        return migrator;
    }

    function testMigrateSimpleUniPosition() public {
        Position[] memory positions = new Position[](1);
        positions[0] = Position({
            collateral: cUNI,
            amount: 200e18
        });

        Comet_V2_Migrator migrator = setupMigratorBorrow(positions, 700e6);

        Comet_V2_Migrator.Collateral[] memory collateral = new Comet_V2_Migrator.Collateral[](1);
        collateral[0] = Comet_V2_Migrator.Collateral({
            cToken: cUNI,
            amount: amountToTokens(199e18, cUNI)
        });

        vm.prank(borrower);
        cUNI.approve(address(migrator), type(uint256).max);

        vm.prank(borrower);
        comet.allow(address(migrator), true);

        vm.prank(borrower);
        migrator.migrate(collateral, 600e6);

        // We should now have 15e18 less cUNI
        require(cUNI.balanceOf(borrower) == 5000e8, "Should have 5e18 cUNI after migration");
        require(cUSDC.borrowBalanceCurrent(borrower) < 101e6, "invalid borrows - should be less");

        // Check v3 balances
        console.log(comet.collateralBalanceOf(borrower, address(uni)));
        require(comet.collateralBalanceOf(borrower, address(uni)) > 0, "check v3 collateral balance"); // this isn't right
        require(comet.borrowBalanceOf(borrower) >= 60e6, "check v3 borrow balance");// this isn't right
    }

    function testMigrateSimpleEthPosition() public {
        Position[] memory positions = new Position[](1);
        positions[0] = Position({
            collateral: cETH,
            amount: 1e18
        });

        Comet_V2_Migrator migrator = setupMigratorBorrow(positions, 700e6);

        Comet_V2_Migrator.Collateral[] memory collateral = new Comet_V2_Migrator.Collateral[](1);
        collateral[0] = Comet_V2_Migrator.Collateral({
            cToken: cETH,
            amount: 1e18
        });

        vm.prank(borrower);
        cUNI.approve(address(migrator), type(uint256).max);

        vm.prank(borrower);
        comet.allow(address(migrator), true);

        vm.prank(borrower);
        migrator.migrate(collateral, 600e6);

        // We should now have 15e18 less cUNI
        require(cUNI.balanceOf(borrower) == 5000e8, "Should have 5e18 cUNI after migration");
        require(cUSDC.borrowBalanceCurrent(borrower) < 101e6, "invalid borrows - should be less");

        // Check v3 balances
        console.log(comet.collateralBalanceOf(borrower, address(uni)));
        require(comet.collateralBalanceOf(borrower, address(uni)) > 0, "check v3 collateral balance"); // this isn't right
        require(comet.borrowBalanceOf(borrower) >= 60e6, "check v3 borrow balance");// this isn't right
    }

    function setupV2Borrows(CTokenLike cToken, uint256 amount) internal {
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

    function deployCometV2Migrator() internal returns (Comet_V2_Migrator) {
        return new Comet_V2_Migrator(
            comet,
            cUSDC,
            cETH,
            weth,
            pool_DAI_USDC,
            sweepee
        );
    }

    function amountToTokens(uint256 amount, CTokenLike cToken) internal returns (uint256) {
        return ( 1e18 * amount ) / cToken.exchangeRateCurrent();
    }
}
