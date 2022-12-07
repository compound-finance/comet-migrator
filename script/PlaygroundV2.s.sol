// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import "forge-std/Script.sol";
import "../src/CometMigratorV2.sol";
import "forge-std/Test.sol";
import "../test/MainnetConstantsV2.t.sol";
import "forge-std/console2.sol";

// TODO:
// -Have non-stable supply positions and check they don't appear on UI
// -Increase positions to migrate
// -Migrate USDC supply
// -Test other borrows (USDP?)

contract PlaygroundV2 is Script, Test, MainnetConstants {
    address public constant account = address(0xEacB91408a77824bfd2D9eF1D0773Cf0966d526C);
    uint256 public constant targetNonce = 50;

    function setUp() public {}

    function run() public {
        vm.startBroadcast();
        string memory fileAddress = ".env.playground.local";

        if (vm.envBool("REDEPLOY")) {
            console.log("Deploying Comet Migrator");
            CometMigratorV2 migrator = deployCometMigrator();
            console.log("Deployed Comet Migrator", address(migrator));

            vm.writeFile(fileAddress,
                string.concat(
                    string.concat("VITE_MAINNET_EXT_ADDRESS=", vm.toString(address(migrator)))));

            console.log("Wrote", fileAddress);
        } else {
            vm.writeFile(fileAddress, "");
            console.log("Cleared", fileAddress);
        }

        console.log("Wrapping WETH");
        weth.deposit{value: 150 ether}();
        require(weth.balanceOf(account) == 150 ether, "invalid weth balance");
        console.log("Wrapped WETH");

        console.log("Trading WETH for UNI");
        uint256 uniBalance = swap(weth, uni, 3000, account, 20 ether);
        // require(uni.balanceOf(account) == uniBalance, "invalid uni balance [0]");
        // require(uni.balanceOf(account) > 0, "invalid uni balance [1]");
        console.log("Traded WETH for UNI", uniBalance);

        console.log("Supplying UNI to Compound");
        uni.approve(address(cUNI), type(uint256).max);
        require(cUNI.mint(uniBalance) == 0, "cUNI mint failed");
        require(cUNI.balanceOf(account) > 0, "invalid cUNI balance");
        console.log("Supplied UNI to Compound");

        console.log("Supplying ETH to Compound");
        cETH.mint{value: 20 ether}();
        require(cETH.balanceOf(account) > 0, "invalid cETH balance");
        console.log("Supplied ETH to Compound");

        console.log("Supplying USDC to Compound");
        usdc.approve(address(cUSDC), type(uint256).max);
        uint256 usdcBalance = swap(weth, usdc, 3000, account, 20 ether);
        require(cUSDC.mint(usdcBalance) == 0, "cUSDC mint failed");
        require(cUSDC.balanceOf(account) > 0, "invalid cUSDC balance");
        console.log("Supplied USDC to Compound");

        console.log("Entering cUNI market");
        // Next, we need to borrow cUSDC
        address[] memory markets = new address[](1);
        markets[0] = address(cUNI);
        comptroller.enterMarkets(markets);
        console.log("Entered cUNI market");

        console.log("Borrowing ETH");
        require(cETH.borrow(10 ether) == 0, "failed to borrow");
        // require(usdc.balanceOf(account) == 5000000000, "incorrect borrow");
        console.log("Borrowed ETH");

        console.log("Borrowing UNI");
        require(cUNI.borrow(100e18) == 0, "failed to borrow");
        require(uni.balanceOf(account) == 100e18, "incorrect borrow");
        console.log("Borrowed UNI");

        // XXX NEW TEST THIS. test migrate works (TUSD OR USDP)
        console.log("Borrowing TUSD");
        require(cTUSD.borrow(5000e18) == 0, "failed to borrow");
        require(tusd.balanceOf(account) == 5000e18, "incorrect borrow");
        console.log("Borrowed TUSD");

        console.log("Borrowing USDC");
        require(cUSDC.borrow(5000000000) == 0, "failed to borrow");
        require(usdc.balanceOf(account) == 5000000000, "incorrect borrow");
        console.log("Borrowed USDC");

        console.log("Borrowing DAI");
        require(cDAI.borrow(5000000000000000000000) == 0, "failed to borrow");
        require(dai.balanceOf(account) == 5000000000000000000000, "incorrect borrow");
        console.log("Borrowed DAI");

        // AAVE

        console.log("Trading WETH for UNI");
        uint256 newUniBalance = swap(weth, uni, 3000, account, 20 ether);
        // require(uni.balanceOf(account) == newUniBalance, "invalid uni balance [0]");
        // require(uni.balanceOf(account) > 0, "invalid uni balance [1]");
        console.log("Traded WETH for UNI", newUniBalance);

        console.log("Supplying UNI to Aave");
        uni.approve(address(aaveV2LendingPool), type(uint256).max);
        aaveV2LendingPool.deposit(address(uni), newUniBalance, account, 0);
        require(aUNI.balanceOf(account) > 0, "invalid aUNI balance");
        require(aUNI.balanceOf(account) == newUniBalance, "invalid aUNI balance");
        console.log("Supplied UNI to Aave");

        console.log("Supplying WETH to Aave");
        weth.approve(address(aaveV2LendingPool), type(uint256).max);
        aaveV2LendingPool.deposit(address(weth), 20 ether, account, 0);
        require(aWETH.balanceOf(account) > 0, "invalid aWETH balance");
        require(aWETH.balanceOf(account) == 20 ether, "invalid aWETH balance");
        console.log("Supplied WETH to Aave");

        console.log("Supplying USDC to Aave");
        uint256 usdcBalance2 = swap(weth, usdc, 100, account, 20 ether);
        usdc.approve(address(aaveV2LendingPool), type(uint256).max);
        aaveV2LendingPool.deposit(address(usdc), usdcBalance2, account, 0);
        require(aUSDC.balanceOf(account) > 0, "invalid aUSDC balance");
        // require(aUSDC.balanceOf(account) == usdcBalance, "invalid aUSDC balance");
        console.log("Supplied USDC to Aave");

        console.log("Borrowing WETH");
        aaveV2LendingPool.borrow(address(weth), 10 ether, 2, 0, account);
        // require(variableDebtUSDC.balanceOf(account) >= 5000000000, "incorrect borrow");
        console.log("Borrowed WETH");

        console.log("Borrowing WBTC");
        aaveV2LendingPool.borrow(address(wbtc), 1e8, 2, 0, account);
        // require(variableDebtUSDC.balanceOf(account) >= 5000000000, "incorrect borrow");
        console.log("Borrowed WBTC");

        console.log("Borrowing USDC");
        aaveV2LendingPool.borrow(address(usdc), 5000000000, 2, 0, account);
        // require(variableDebtUSDC.balanceOf(account) >= 5000000000, "incorrect borrow");
        console.log("Borrowed USDC");

        // XXX NEW TEST THIS. test migrate works (TUSD OR USDP)
        console.log("Borrowing Variable TUSD");
        aaveV2LendingPool.borrow(address(tusd), 5000e18, 2, 0, account);
        require(variableDebtTUSD.balanceOf(account) >= 5000e18, "incorrect borrow");
        console.log("Borrowed Variable TUSD");

        // XXX NEW TEST THIS. test migrate works (TUSD OR USDP)
        console.log("Borrowing Stable TUSD");
        aaveV2LendingPool.borrow(address(tusd), 5000e18, 1, 0, account);
        require(stableDebtTUSD.balanceOf(account) >= 5000e18, "incorrect borrow");
        console.log("Borrowed Stable TUSD");


        console.log("Borrowing Variable DAI");
        aaveV2LendingPool.borrow(address(dai), 2500000000000000000000, 2, 0, account);
        require(variableDebtDAI.balanceOf(account) >= 2500000000000000000000, "incorrect borrow");
        console.log("Borrowed Variable DAI");

        console.log("Borrowing Stable DAI");
        aaveV2LendingPool.borrow(address(dai), 2500000000000000000000, 1, 0, account);
        require(variableDebtDAI.balanceOf(account) >= 2500000000000000000000, "incorrect borrow");
        console.log("Borrowed Stable DAI");

        // Setting nonce to target nonce
        console.log("Setting account nonce to target nonce", targetNonce);
        require(vm.getNonce(account) <= targetNonce, "target nonce too low");
        while (vm.getNonce(account) != targetNonce){
            0x0000000000000000000000000000000000000000.call("");
        }
        console.log("Account nonce set to target nonce", targetNonce);

        console.log("Proceed.");
    }

    function deployCometMigrator() internal returns (CometMigratorV2) {
        return new CometMigratorV2(
            comet,
            usdc,
            cETH,
            weth,
            aaveV2LendingPool,
            pool_USDT_USDC,
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
