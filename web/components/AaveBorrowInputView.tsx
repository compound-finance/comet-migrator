import { BaseAssetWithAccountState } from '@compound-finance/comet-extension/dist/CometState';

import { formatTokenBalance, maybeBigIntFromString, PRICE_PRECISION } from '../helpers/numbers';

import { ATokenState, StateType, SwapRouteState } from '../types';

import { notEnoughLiquidityError, InputViewError } from './ErrorViews';
import { ArrowRight } from './Icons';
import SwapDropdown from './SwapDropdown';

type AaveBorrowInputViewProps = {
  baseAsset: BaseAssetWithAccountState;
  borrowType: 'stable' | 'variable';
  tokenState: ATokenState;
  onInputChange: (value: string) => void;
  onMaxButtonClicked: () => void;
};

const AaveBorrowInputView = ({
  baseAsset,
  borrowType,
  tokenState,
  onInputChange,
  onMaxButtonClicked
}: AaveBorrowInputViewProps) => {
  const [borrowBalance, repayAmountRaw, swapRoute]: [bigint, string, SwapRouteState ] =
    borrowType === 'stable'
      ? [tokenState.borrowBalanceStable, tokenState.repayAmountStable, tokenState.swapRouteStable]
      : [tokenState.borrowBalanceVariable, tokenState.repayAmountVariable, tokenState.swapRouteVariable];
  let repayAmount: string;
  let repayAmountDollarValue: string;
  let errorTitle: string | undefined;
  let errorDescription: string | undefined;

  if (repayAmountRaw === 'max') {
    repayAmount = formatTokenBalance(tokenState.aToken.decimals, borrowBalance, false);
    repayAmountDollarValue = formatTokenBalance(
      tokenState.aToken.decimals + PRICE_PRECISION,
      borrowBalance * tokenState.price,
      false,
      true
    );

    if (
      (tokenState.aToken.symbol === baseAsset.symbol && borrowBalance > baseAsset.balanceOfComet) ||
      (swapRoute !== undefined &&
        swapRoute[0] === StateType.Hydrated &&
        swapRoute[1].tokenIn.amount > baseAsset.balanceOfComet)
    ) {
      [errorTitle, errorDescription] = notEnoughLiquidityError(baseAsset);
    }
  } else {
    const maybeRepayAmount = maybeBigIntFromString(repayAmountRaw, tokenState.aToken.decimals);
    repayAmount = repayAmountRaw;

    if (maybeRepayAmount === undefined) {
      repayAmountDollarValue = '$0.00';
    } else {
      repayAmountDollarValue = formatTokenBalance(
        tokenState.aToken.decimals + PRICE_PRECISION,
        maybeRepayAmount * tokenState.price,
        false,
        true
      );

      if (maybeRepayAmount > borrowBalance) {
        errorTitle = 'Amount Exceeds Borrow Balance.';
        errorDescription = `Value must be less than or equal to ${formatTokenBalance(
          tokenState.aToken.decimals,
          borrowBalance,
          false
        )}`;
      } else if (
        (tokenState.aToken.symbol === baseAsset.symbol && maybeRepayAmount > baseAsset.balanceOfComet) ||
        (swapRoute !== undefined &&
          swapRoute[0] === StateType.Hydrated &&
          swapRoute[1].tokenIn.amount > baseAsset.balanceOfComet)
      ) {
        [errorTitle, errorDescription] = notEnoughLiquidityError(baseAsset);
      }
    }
  }

  return (
    <div className="migrator__input-view" key={`${tokenState.aToken.symbol}-${borrowType}`}>
      <div className="migrator__input-view__content">
        <div className="migrator__input-view__left">
          <div className="migrator__input-view__header">
            <div className={`asset asset--${tokenState.aToken.symbol}`}></div>
            <label className="L2 label text-color--1">
              {tokenState.aToken.symbol}{' '}
              <span className="text-color--2">{borrowType === 'stable' ? '(Stable Debt)' : '(Variable Debt)'}</span>
            </label>
            {tokenState.aToken.symbol !== baseAsset.symbol && (
              <>
                <ArrowRight className="svg--icon--2" />
                <div className={`asset asset--${baseAsset.symbol}`}></div>
                <label className="L2 label text-color--1">{baseAsset.symbol}</label>
              </>
            )}
          </div>
          <div className="migrator__input-view__holder">
            <input
              placeholder="0.0000"
              value={repayAmount}
              onChange={e => {
                onInputChange(e.target.value);
              }}
              type="text"
              inputMode="decimal"
            />
            {repayAmount === '' && (
              <div className="migrator__input-view__placeholder text-color--2">
                <span className="text-color--1">0</span>.0000
              </div>
            )}
          </div>
          <p className="meta text-color--2" style={{ marginTop: '0.25rem' }}>
            {repayAmountDollarValue}
          </p>
        </div>
        <div className="migrator__input-view__right">
          <button className="button button--small" disabled={repayAmountRaw === 'max'} onClick={onMaxButtonClicked}>
            Max
          </button>
          <p className="meta text-color--2" style={{ marginTop: '0.5rem' }}>
            <span style={{ fontWeight: '500' }}>Aave V2 balance:</span>{' '}
            {formatTokenBalance(tokenState.aToken.decimals, borrowBalance, false)}
          </p>
          <p className="meta text-color--2">
            {formatTokenBalance(
              tokenState.aToken.decimals + PRICE_PRECISION,
              borrowBalance * tokenState.price,
              false,
              true
            )}
          </p>
        </div>
      </div>
      <SwapDropdown baseAsset={baseAsset} state={swapRoute} />
      {!!errorTitle && <InputViewError title={errorTitle} description={errorDescription} />}
    </div>
  );
};

export default AaveBorrowInputView;
