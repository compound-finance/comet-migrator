// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import "../src/CometMigratorV2.sol";
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
    ATokenLike public constant aUSDC = ATokenLike(0xBcca60bB61934080951369a648Fb03DF4F96263C);
    ATokenLike public constant aUNI = ATokenLike(0xB9D7CB55f463405CDfBe4E90a6D2Df01C2B92BF1);
    ATokenLike public constant aWETH = ATokenLike(0x030bA81f1c18d280636F32af80b9AAd02Cf0854e);
    ADebtTokenLike public constant stableDebtUSDC = ADebtTokenLike(0xE4922afAB0BbaDd8ab2a88E0C79d884Ad337fcA6);
    ADebtTokenLike public constant variableDebtUSDC = ADebtTokenLike(0x619beb58998eD2278e08620f97007e1116D5D25b);
    ADebtTokenLike public constant stableDebtDAI = ADebtTokenLike(0x778A13D3eeb110A4f7bb6529F99c000119a08E92);
    ADebtTokenLike public constant variableDebtDAI = ADebtTokenLike(0x6C3c78838c761c6Ac7bE9F59fe808ea2A6E4379d);
    ADebtTokenLike public constant variableDebtUSDT = ADebtTokenLike(0x531842cEbbdD378f8ee36D171d6cC9C4fcf475Ec);
    ADebtTokenLike public constant stableDebtUSDT = ADebtTokenLike(0xe91D55AB2240594855aBd11b3faAE801Fd4c4687);
    IUniswapV3Pool public constant pool_DAI_USDC = IUniswapV3Pool(0x5777d92f208679DB4b9778590Fa3CAB3aC9e2168);
    IUniswapV3Pool public constant pool_USDT_USDC = IUniswapV3Pool(0x3416cF6C708Da44DB2624D63ea0AAef7113527C6);
    address payable public constant sweepee = payable(0x6d903f6003cca6255D85CcA4D3B5E5146dC33925);
    address public constant uniswapFactory = address(0x1F98431c8aD98523631AE4a59f267346ea31F984);
    IWETH9 public constant weth = IWETH9(0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2);
    address public constant cHolderUni = address(0x39d8014b4F40d2CBC441137011d32023f4f1fd87);
    address public constant cHolderEth = address(0xe84A061897afc2e7fF5FB7e3686717C528617487);
    address public constant aHolderUni = address(0x3E0182CcC2DB35146E0529de779fB1025e8b0178);
    address public constant aHolderWeth = address(0x32e2665c8d696726c73CE28aCEe310bfac54Db85);
    address public constant usdtHolder = address(0x5041ed759Dd4aFc3a72b8192C143F72f4724081A);
    Comptroller public constant comptroller = Comptroller(0x3d9819210A31b4961b30EF54bE2aeD79B9c9Cd3B);
    ISwapRouter public constant swapRouter = ISwapRouter(0xE592427A0AEce92De3Edee1F18E0157C05861564);
    ILendingPool public constant aaveV2LendingPool = ILendingPool(0x7d2768dE32b0b80b7a3454c06BdAc94A69DDc7A9);

    CometMigratorV2.CompoundV2Position internal EMPTY_COMPOUND_V2_POSITION;
    CometMigratorV2.AaveV2Position internal EMPTY_AAVE_V2_POSITION;
}
