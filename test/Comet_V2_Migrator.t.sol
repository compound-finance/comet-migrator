// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import "forge-std/Script.sol";
import "../src/Comet_V2_Migrator.sol";
import "forge-std/Test.sol";

interface Comptroller {
    function enterMarkets(address[] memory cTokens) external returns (uint[] memory);
}

contract ContractTest is Test {
    Comet public constant comet = Comet(0xc3d688B66703497DAA19211EEdff47f25384cdc3);
    IERC20 public constant usdc = IERC20(0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48);
    IERC20 public constant uni = IERC20(0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984);
    CErc20 public constant cUSDC = CErc20(0x39AA39c021dfbaE8faC545936693aC917d5E7563);
    CErc20 public constant cUNI = CErc20(0x35A18000230DA775CAc24873d00Ff85BccdeD550);
    IUniswapV3Pool public constant pool_DAI_USDC = IUniswapV3Pool(0x5777d92f208679DB4b9778590Fa3CAB3aC9e2168);
    address payable public constant sweepee = payable(0x6d903f6003cca6255D85CcA4D3B5E5146dC33925);
    address public constant uniswapFactory = address(0x1F98431c8aD98523631AE4a59f267346ea31F984);
    address public constant WETH9 = address(0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2);
    address public constant cHolderUni = address(0x39d8014b4F40d2CBC441137011d32023f4f1fd87);
    address public constant caller = address(0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266);
    Comptroller public constant comptroller = Comptroller(0x3d9819210A31b4961b30EF54bE2aeD79B9c9Cd3B);

    Comet_V2_Migrator public migrator;

    function setUp() public {
        console.log("Deploying Comet v2 Migrator");
        migrator = deployCometV2Migrator();
        console.log("Deployed Comet v2 Migrator", address(migrator));

        setupV2Borrower(migrator, caller);
    }

    function testMigrateSimplePosition() public {
        Comet_V2_Migrator.Collateral[] memory collateral = new Comet_V2_Migrator.Collateral[](1);
        collateral[0] = Comet_V2_Migrator.Collateral({
            cToken: cUNI,
            amount: 15000e8
        });

        vm.prank(caller);
        cUNI.approve(address(migrator), type(uint256).max);

        vm.prank(caller);
        comet.allow(address(migrator), true);

        vm.prank(caller);
        migrator.migrate(collateral, 600e6);

        // We should now have 15e18 less cUNI
        require(cUNI.balanceOf(caller) == 5000e8, "Should have 5e18 cUNI after migration");
        require(cUSDC.borrowBalanceCurrent(caller) < 101e6, "invalid borrows - should be less");

        // Check v3 balances
        console.log(comet.collateralBalanceOf(caller, address(uni)));
        require(comet.collateralBalanceOf(caller, address(uni)) > 0, "check v3 collateral balance"); // this isn't right
        require(comet.borrowBalanceOf(caller) >= 60e6, "check v3 borrow balance");// this isn't right
    }

    function setupV2Borrower(Comet_V2_Migrator migrator, address account) internal {
        // Next, let's transfer in some cUNI to ourselves
        uint256 cUNIBalance = cUNI.balanceOf(cHolderUni);
        vm.prank(cHolderUni);
        cUNI.transfer(caller, 20000e8);

        require(cUNI.balanceOf(caller) == 20000e8, "invalid cUNI balance");

        // Next, we need to borrow cUSDC
        vm.prank(account);
        address[] memory markets = new address[](1);
        markets[0] = address(cUNI);
        comptroller.enterMarkets(markets);

        vm.prank(account);
        require(cUSDC.borrow(700e6) == 0, "failed to borrow"); // 100 USDC
        require(usdc.balanceOf(account) == 700e6, "incorrect borrow");
        require(cUSDC.borrowBalanceCurrent(account) >= 700e6, "incorrect borrow");
    }

    function deployCometV2Migrator() internal returns (Comet_V2_Migrator) {
        IERC20[] memory tokens = new IERC20[](0);

        return new Comet_V2_Migrator(
            comet,
            cUSDC,
            pool_DAI_USDC,
            tokens,
            sweepee,
            uniswapFactory,
            WETH9
        );
    }
}
