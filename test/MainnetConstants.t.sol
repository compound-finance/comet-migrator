// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import "../src/CometMigrator.sol";
import "../src/vendor/@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol";

interface Comptroller {
    function enterMarkets(address[] memory cTokens) external returns (uint[] memory);
}

contract MainnetConstants {
    Comet public constant comet = Comet(0xc3d688B66703497DAA19211EEdff47f25384cdc3);
    IERC20NonStandard public constant usdc = IERC20NonStandard(0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48);
    IERC20NonStandard public constant usdt = IERC20NonStandard(0xdAC17F958D2ee523a2206206994597C13D831ec7);
    IERC20NonStandard public constant dai = IERC20NonStandard(0x6B175474E89094C44Da98b954EedeAC495271d0F);
    IERC20NonStandard public constant uni = IERC20NonStandard(0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984);
    CErc20 public constant cUSDC = CErc20(0x39AA39c021dfbaE8faC545936693aC917d5E7563);
    CErc20 public constant cUSDT = CErc20(0xf650C3d88D12dB855b8bf7D11Be6C55A4e07dCC9);
    CErc20 public constant cDAI = CErc20(0x5d3a536E4D6DbD6114cc1Ead35777bAB948E3643);
    CErc20 public constant cUNI = CErc20(0x35A18000230DA775CAc24873d00Ff85BccdeD550);
    CTokenLike public constant cETH = CTokenLike(0x4Ddc2D193948926D02f9B1fE9e1daa0718270ED5);
    IUniswapV3Pool public constant pool_DAI_USDC = IUniswapV3Pool(0x5777d92f208679DB4b9778590Fa3CAB3aC9e2168);
    IUniswapV3Pool public constant pool_DAI_USDC_high_fee = IUniswapV3Pool(0x6c6Bc977E13Df9b0de53b251522280BB72383700);
    IUniswapV3Pool public constant pool_USDT_USDC = IUniswapV3Pool(0x3416cF6C708Da44DB2624D63ea0AAef7113527C6);
    address payable public constant sweepee = payable(0x6d903f6003cca6255D85CcA4D3B5E5146dC33925);
    address public constant uniswapFactory = address(0x1F98431c8aD98523631AE4a59f267346ea31F984);
    IWETH9 public constant weth = IWETH9(0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2);
    address public constant cHolderUni = address(0x39d8014b4F40d2CBC441137011d32023f4f1fd87);
    address public constant cHolderEth = address(0xe84A061897afc2e7fF5FB7e3686717C528617487);
    Comptroller public constant comptroller = Comptroller(0x3d9819210A31b4961b30EF54bE2aeD79B9c9Cd3B);
    ISwapRouter public constant swapRouter = ISwapRouter(0xE592427A0AEce92De3Edee1F18E0157C05861564);
}
