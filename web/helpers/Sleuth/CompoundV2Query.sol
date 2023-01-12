// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.16;

import './CometQuery.sol';

interface CToken {
  function comptroller() external returns (Comptroller);

  function transfer(address dst, uint amount) external returns (bool);

  function transferFrom(address src, address dst, uint amount) external returns (bool);

  function approve(address spender, uint amount) external returns (bool);

  function allowance(address owner, address spender) external view returns (uint);

  function balanceOf(address owner) external view returns (uint);

  function balanceOfUnderlying(address owner) external returns (uint);

  function borrowBalanceCurrent(address account) external returns (uint);

  function exchangeRateCurrent() external returns (uint);

  function underlying() external returns (address);
}

interface Comptroller {
  function markets(address) external view returns (bool, uint);

  function oracle() external view returns (PriceOracle);

  function getAccountLiquidity(address) external view returns (uint, uint, uint);

  function getAssetsIn(address) external view returns (CToken[] memory);

  function claimComp(address) external;

  function compAccrued(address) external view returns (uint);

  function compSpeeds(address) external view returns (uint);

  function compSupplySpeeds(address) external view returns (uint);

  function compBorrowSpeeds(address) external view returns (uint);

  function borrowCaps(address) external view returns (uint);
}

interface PriceOracle {
  function price(string memory price) external view returns (uint);
}

contract CompoundV2Query is CometQuery {
  struct CTokenMetadata {
    address cToken;
    uint allowance;
    uint balance;
    uint balanceUnderlying;
    uint borrowBalance;
    uint collateralFactor;
    uint exchangeRate;
    uint price;
  }

  struct QueryResponse {
    uint migratorEnabled;
    CTokenMetadata[] tokens;
    CometStateWithAccountState cometState;
  }

  struct CTokenRequest {
    CToken cToken;
    string priceOracleSymbol;
  }

  function getMigratorData(
    Comptroller comptroller,
    Comet comet,
    CTokenRequest[] calldata cTokens,
    address payable account,
    address payable spender
  ) external returns (QueryResponse memory) {
    PriceOracle priceOracle = comptroller.oracle();
    uint cTokenCount = cTokens.length;
    CTokenMetadata[] memory tokens = new CTokenMetadata[](cTokenCount);
    for (uint i = 0; i < cTokenCount; i++) {
      tokens[i] = cTokenMetadata(comptroller, priceOracle, cTokens[i], account, spender);
    }

    return
      QueryResponse({
        migratorEnabled: comet.allowance(account, spender),
        tokens: tokens,
        cometState: queryWithAccount(comet, account, payable(0))
      });
  }

  function cTokenMetadata(
    Comptroller comptroller,
    PriceOracle priceOracle,
    CTokenRequest memory cTokenRequest,
    address payable account,
    address payable spender
  ) public returns (CTokenMetadata memory) {
    CToken cToken = cTokenRequest.cToken;
    (, uint collateralFactor) = comptroller.markets(address(cToken));

    return
      CTokenMetadata({
        cToken: address(cToken),
        allowance: cToken.allowance(account, spender),
        balance: cToken.balanceOf(account),
        balanceUnderlying: cToken.balanceOfUnderlying(account),
        borrowBalance: cToken.borrowBalanceCurrent(account),
        collateralFactor: collateralFactor,
        exchangeRate: cToken.exchangeRateCurrent(),
        price: priceOracle.price(cTokenRequest.priceOracleSymbol)
      });
  }
}
