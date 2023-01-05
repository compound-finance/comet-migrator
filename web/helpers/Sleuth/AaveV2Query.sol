// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.16;

import './CometQuery.sol';

interface AToken {
  function allowance(address owner, address spender) external view returns (uint);

  function balanceOf(address owner) external view returns (uint);
}

interface DebtToken {
  function balanceOf(address owner) external view returns (uint);
}

interface LendingPoolAddressesProvider {
  function getPriceOracle() external view returns (AavePriceOracle);
}

interface LendingPool {
  struct ReserveConfigurationMap {
    //bit 0-15: LTV
    //bit 16-31: Liq. threshold
    //bit 32-47: Liq. bonus
    //bit 48-55: Decimals
    //bit 56: Reserve is active
    //bit 57: reserve is frozen
    //bit 58: borrowing is enabled
    //bit 59: stable rate borrowing enabled
    //bit 60-63: reserved
    //bit 64-79: reserve factor
    uint256 data;
  }

  function getConfiguration(address asset) external view returns (ReserveConfigurationMap memory);
}

interface AavePriceOracle {
  function getAssetPrice(address asset) external view returns (uint);
}

contract AaveV2Query is CometQuery {
  struct ATokenMetadata {
    address aToken;
    address stableDebtToken;
    address variableDebtToken;
    uint allowance;
    uint balance;
    uint stableDebtBalance;
    uint variableDebtBalance;
    uint configuration;
    uint priceInETH;
  }

  struct QueryResponse {
    uint migratorEnabled;
    ATokenMetadata[] tokens;
    CometStateWithAccountState cometState;
    uint usdcPriceInETH;
  }

  struct ATokenRequest {
    AToken aToken;
    DebtToken stableDebtToken;
    address underlying;
    DebtToken variableDebtToken;
  }

  function getMigratorData(
    LendingPoolAddressesProvider provider,
    LendingPool pool,
    Comet comet,
    ATokenRequest[] calldata aTokens,
    address payable account,
    address payable spender,
    address usdcAddress
  ) external view returns (QueryResponse memory) {
    AavePriceOracle priceOracle = provider.getPriceOracle();
    uint aTokenCount = aTokens.length;
    ATokenMetadata[] memory tokens = new ATokenMetadata[](aTokenCount);
    for (uint i = 0; i < aTokenCount; i++) {
      tokens[i] = aTokenMetadata(pool, priceOracle, aTokens[i], account, spender);
    }

    return
      QueryResponse({
        migratorEnabled: comet.allowance(account, spender),
        tokens: tokens,
        cometState: queryWithAccount(comet, account, payable(0)),
        usdcPriceInETH: priceOracle.getAssetPrice(usdcAddress)
      });
  }

  function aTokenMetadata(
    LendingPool pool,
    AavePriceOracle priceOracle,
    ATokenRequest memory aTokenRequest,
    address payable account,
    address payable spender
  ) public view returns (ATokenMetadata memory) {
    AToken aToken = aTokenRequest.aToken;
    DebtToken stableDebtToken = aTokenRequest.stableDebtToken;
    DebtToken variableDebtToken = aTokenRequest.variableDebtToken;

    LendingPool.ReserveConfigurationMap memory configuration = pool.getConfiguration(aTokenRequest.underlying);

    return
      ATokenMetadata({
        aToken: address(aToken),
        stableDebtToken: address(stableDebtToken),
        variableDebtToken: address(variableDebtToken),
        allowance: aToken.allowance(account, spender),
        balance: aToken.balanceOf(account),
        stableDebtBalance: stableDebtToken.balanceOf(account),
        variableDebtBalance: variableDebtToken.balanceOf(account),
        configuration: configuration.data,
        priceInETH: priceOracle.getAssetPrice(aTokenRequest.underlying)
      });
  }
}
