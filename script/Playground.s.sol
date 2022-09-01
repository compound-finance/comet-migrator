// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import "forge-std/Script.sol";
import "../src/Comet_V2_Migrator.sol";

contract Playground is Script {
    Comet public constant comet = Comet(0xc3d688B66703497DAA19211EEdff47f25384cdc3);
    CErc20 public constant cUSDC = CErc20(0x39AA39c021dfbaE8faC545936693aC917d5E7563);
    IUniswapV3Pool public constant pool_DAI_USDC = IUniswapV3Pool(0x5777d92f208679DB4b9778590Fa3CAB3aC9e2168);
    address payable public constant sweepee = payable(0x6d903f6003cca6255D85CcA4D3B5E5146dC33925);
    address public constant uniswapFactory = address(0x1F98431c8aD98523631AE4a59f267346ea31F984);
    address public constant WETH9 = address(0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2);

    function setUp() public {}

    function run() public {
        vm.broadcast();
        console.log("Deploying Comet v2 Migrator");
        Comet_V2_Migrator migrator = deployCometV2Migrator();
        console.log("Deployed Comet v2 Migrator", address(migrator));
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
