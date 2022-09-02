// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import "forge-std/Script.sol";
import "../src/Comet_V2_Migrator.sol";
import "forge-std/Test.sol";

interface Comptroller {
    function enterMarkets(address[] memory cTokens) external returns (uint[] memory);
}

contract Playground is Script, Test {
    Comet public constant comet = Comet(0xc3d688B66703497DAA19211EEdff47f25384cdc3);
    IERC20 public constant usdc = IERC20(0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48);
    CErc20 public constant cUSDC = CErc20(0x39AA39c021dfbaE8faC545936693aC917d5E7563);
    CErc20 public constant cUNI = CErc20(0x35A18000230DA775CAc24873d00Ff85BccdeD550);
    IUniswapV3Pool public constant pool_DAI_USDC = IUniswapV3Pool(0x5777d92f208679DB4b9778590Fa3CAB3aC9e2168);
    address payable public constant sweepee = payable(0x6d903f6003cca6255D85CcA4D3B5E5146dC33925);
    address public constant uniswapFactory = address(0x1F98431c8aD98523631AE4a59f267346ea31F984);
    ISwapRouter public constant swapRouter = ISwapRouter(0xE592427A0AEce92De3Edee1F18E0157C05861564);
    IERC20 public constant uni = IERC20(0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984);
    IWETH9 public constant weth = IWETH9(0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2);
    address public constant caller = address(0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266);
    Comptroller public constant comptroller = Comptroller(0x3d9819210A31b4961b30EF54bE2aeD79B9c9Cd3B);

    function setUp() public {}

    function run() public {
        vm.startBroadcast();

        console.log("Deploying Comet v2 Migrator");
        Comet_V2_Migrator migrator = deployCometV2Migrator();
        console.log("Deployed Comet v2 Migrator", address(migrator));

        console.log("Wrapping WETH");
        weth.deposit{value: 50 ether}();
        require(weth.balanceOf(caller) == 50 ether, "invalid weth balance");
        console.log("Wrapped WETH");

        console.log("Trading WETH for UNI");
        uint256 uniBalance = swap(weth, uni, 3000, caller, 1 ether);
        require(uni.balanceOf(caller) == uniBalance, "invalid uni balance [0]");
        require(uni.balanceOf(caller) > 0, "invalid uni balance [1]");
        console.log("Traded WETH for UNI", uniBalance);

        console.log("Supplying UNI to Compound");
        uni.approve(address(cUNI), type(uint256).max);
        require(cUNI.mint(uniBalance) == 0, "cUNI mint failed");
        require(cUNI.balanceOf(caller) > 0, "invalid cUNI balance");
        console.log("Supplied UNI to Compound");

        console.log("Entering cUNI market");
        // Next, we need to borrow cUSDC
        address[] memory markets = new address[](1);
        markets[0] = address(cUNI);
        comptroller.enterMarkets(markets);
        console.log("Entered cUNI market");

        console.log("Borrowing USDC");
        require(cUSDC.borrow(100000000) == 0, "failed to borrow"); // 100 USDC
        require(usdc.balanceOf(caller) == 100000000, "incorrect borrow");
        console.log("Borrowed USDC");

        console.log("Proceed.");
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
            address(weth)
        );
    }

    function swap(IERC20 token0, IERC20 token1, uint24 poolFee, address recipient, uint256 amountIn) internal returns (uint256) {
        // Approve the router to spend token0
        token0.approve(address(swapRouter), type(uint256).max);

        // Naively set amountOutMinimum to 0. In production, use an oracle or other data source to choose a safer value for amountOutMinimum.
        // We also set the sqrtPriceLimitx96 to be 0 to ensure we swap our exact input amount.
        ISwapRouter.ExactInputSingleParams memory params =
            ISwapRouter.ExactInputSingleParams({
                tokenIn: address(token0),
                tokenOut: address(token1),
                fee: poolFee,
                recipient: recipient,
                deadline: type(uint256).max,
                amountIn: amountIn,
                amountOutMinimum: 0,
                sqrtPriceLimitX96: 0
            });

        // The call to `exactInputSingle` executes the swap.
        return swapRouter.exactInputSingle(params);
    }
}
