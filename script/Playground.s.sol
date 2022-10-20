// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import "forge-std/Script.sol";
import "../src/CometMigratorV2.sol";
import "forge-std/Test.sol";
import "../test/MainnetConstantsV2.t.sol";
import "forge-std/console2.sol";

contract Playground is Script, Test, MainnetConstants {
    address public constant caller = address(0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266);

    function setUp() public {}

    function run() public {
        vm.startBroadcast();

        console.log("Deploying Comet Migrator");
        CometMigratorV2 migrator = deployCometMigrator();
        console.log("Deployed Comet Migrator", address(migrator));

        string memory fileAddress = ".env.playground.local";
        vm.writeFile(fileAddress,
            string.concat(
                string.concat("VITE_MAINNET_EXT_ADDRESS=", vm.toString(address(migrator)))));

        console.log("Wrote", fileAddress);

        console.log("Wrapping WETH");
        weth.deposit{value: 50 ether}();
        require(weth.balanceOf(caller) == 50 ether, "invalid weth balance");
        console.log("Wrapped WETH");

        console.log("Trading WETH for UNI");
        uint256 uniBalance = swap(weth, uni, 3000, caller, 10 ether);
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
        require(cUSDC.borrow(10000000000) == 0, "failed to borrow"); // 100 USDC
        require(usdc.balanceOf(caller) == 10000000000, "incorrect borrow");
        console.log("Borrowed USDC");

        console.log("Proceed.");
    }

    function deployCometMigrator() internal returns (CometMigratorV2) {
        return new CometMigratorV2(
            comet,
            usdc,
            cETH,
            weth,
            aaveV2LendingPool,
            pool_DAI_USDC,
            swapRouter,
            sweepee
        );
    }

    function swap(IERC20NonStandard token0, IERC20NonStandard token1, uint24 poolFee, address recipient, uint256 amountIn) internal returns (uint256) {
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
