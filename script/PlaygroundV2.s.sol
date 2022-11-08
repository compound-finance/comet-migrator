// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import "forge-std/Script.sol";
import "../src/interfaces/Liquidator.sol";
import "forge-std/Test.sol";
import "forge-std/console2.sol";

contract PlaygroundV2 is Script, Test {
    address public constant account = address(0xEacB91408a77824bfd2D9eF1D0773Cf0966d526C);
    uint256 public constant targetNonce = 10;

    function setUp() public {}

    function run() public {
        console.log("Deploying Liquidator");
        // Liquidator liquidator = deployLiquidator();
        // deal(address(0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48), address(liquidator), 5_000e6);
        console.log("Pre");
        address[] memory a = new address[](0);
        Liquidator.FlashParams memory params = Liquidator.FlashParams({
            accounts: a,
            pairToken: address(0x6B175474E89094C44Da98b954EedeAC495271d0F),
            poolFee: 100
        });
        // liquidator.initFlash(params);
        address payable addr = payable(address(0x64995442daBC5F8e1AF2d977E6676a2C6bABc6A1));
        Liquidator(addr).initFlash(params);
        console.log("Post");
    }

    function deployLiquidator() internal returns (Liquidator) {
        address[] memory assets = new address[](5);
        assets[0] = address(0xc00e94Cb662C3520282E6f5717214004A7f26888);
        assets[1] = address(0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599);
        assets[2] = address(0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2);
        assets[3] = address(0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984);
        assets[4] = address(0x514910771AF9Ca656af840dff83E8264EcF986CA);

        bool[] memory isLowLiquidity = new bool[](5);
        isLowLiquidity[0] = true;
        isLowLiquidity[1] = false;
        isLowLiquidity[2] = false;
        isLowLiquidity[3] = true;
        isLowLiquidity[4] = true;

        uint24[] memory fees = new uint24[](5);
        fees[0] = 3000;
        fees[1] = 3000;
        fees[2] = 500;
        fees[3] = 3000;
        fees[4] = 3000;

        return new Liquidator(
            address(0xe8F0c9059b8Db5B863d48dB8e8C1A09f97D3B991), // _recipient
            ISwapRouter(0xE592427A0AEce92De3Edee1F18E0157C05861564), // _swapRouter
            CometInterface(0xc3d688B66703497DAA19211EEdff47f25384cdc3), // _comet
            (0x1F98431c8aD98523631AE4a59f267346ea31F984), // _factory
            address(0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2), // _WETH9
            0,
            assets, // _assets
            isLowLiquidity, // _lowLiquidityPools
            fees // _poolFees
        );
    }

    // function swap(IERC20NonStandard token0, IERC20NonStandard token1, uint24 poolFee, address recipient, uint256 amountIn) internal returns (uint256) {
    //     // Approve the router to spend token0
    //     token0.approve(address(swapRouter), type(uint256).max);

    //     // Naively set amountOutMinimum to 0. In production, use an oracle or other data source to choose a safer value for amountOutMinimum.
    //     // We also set the sqrtPriceLimitx96 to be 0 to ensure we swap our exact input amount.
    //     ISwapRouter.ExactInputSingleParams memory params =
    //         ISwapRouter.ExactInputSingleParams({
    //             tokenIn: address(token0),
    //             tokenOut: address(token1),
    //             fee: poolFee,
    //             recipient: recipient,
    //             deadline: type(uint256).max,
    //             amountIn: amountIn,
    //             amountOutMinimum: 0,
    //             sqrtPriceLimitX96: 0
    //         });

    //     // The call to `exactInputSingle` executes the swap.
    //     return swapRouter.exactInputSingle(params);
    // }
}
