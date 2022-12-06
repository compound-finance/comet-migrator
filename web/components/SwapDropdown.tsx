import { StateType, BaseAsset } from '@compound-finance/comet-extension/dist/CometState';
import { useState, ReactNode } from 'react';

import {
  FACTOR_PRECISION,
  formatRateFactor,
  formatTokenBalance,
  maximumBorrowFromSwapInfo,
  SLIPPAGE_TOLERANCE
} from '../helpers/numbers';

import { SwapInfo } from '../types';

import { InputViewError } from './ErrorViews';
import LoadSpinner from './LoadSpinner';
import { ChevronDown } from './Icons';

type SwapDropdownState = undefined | [StateType.Loading] | [StateType.Hydrated, SwapInfo];

type SwapDropdownProps = {
  baseAsset: BaseAsset;
  state: SwapDropdownState;
};

const SwapDropdown = ({ baseAsset, state }: SwapDropdownProps) => {
  const [active, setActive] = useState(false);

  if (state === undefined) return null;

  if (state[0] === StateType.Loading) {
    return (
      <div className="swap-dropdown swap-dropdown--loading L2">
        <div className="swap-dropdown__row">
          <div className="swap-dropdown__row__left">
            <LoadSpinner size={12} />
            <label className="label text-color--2">Calculating best price...</label>
          </div>
        </div>
      </div>
    );
  }
  const swapInfo = state[1];

  const exchangeRateRaw =
    (swapInfo.tokenOut.amount * BigInt(10 ** swapInfo.tokenIn.decimals)) / swapInfo.tokenIn.amount;
  const exchangeRate = formatTokenBalance(swapInfo.tokenOut.decimals, exchangeRateRaw, false);
  const expectedBorrow = formatTokenBalance(swapInfo.tokenOut.decimals, swapInfo.tokenOut.amount, false);
  const valueIn = (swapInfo.tokenIn.amount * swapInfo.tokenIn.price) / BigInt(10 ** swapInfo.tokenIn.decimals);
  const valueOut = (swapInfo.tokenOut.amount * swapInfo.tokenOut.price) / BigInt(10 ** swapInfo.tokenOut.decimals);
  const priceImpactRaw = ((valueOut - valueIn) * BigInt(10 ** FACTOR_PRECISION)) / valueIn;
  const priceImpactAbs = priceImpactRaw < 0 ? -priceImpactRaw : priceImpactRaw;
  const priceImpact = formatRateFactor(priceImpactAbs);
  const maximumBorrow = formatTokenBalance(swapInfo.tokenOut.decimals, maximumBorrowFromSwapInfo(swapInfo), false);
  const networkFee = swapInfo.networkFee;

  let exchangeRateLabel: ReactNode;
  let error: ReactNode;

  if (priceImpactRaw < SLIPPAGE_TOLERANCE) {
    exchangeRateLabel = (
      <>
        <label className="label text-color--2">
          1.0000 {swapInfo.tokenIn.symbol} = {`${exchangeRate} ${swapInfo.tokenOut.symbol}`}
        </label>
        <label className="label label--secondary text-color--2" style={{ marginLeft: '0.25rem' }}>
          ({formatRateFactor(SLIPPAGE_TOLERANCE)} max slippage)
        </label>
      </>
    );
    error = null;
  } else {
    exchangeRateLabel = (
      <>
        <label className="label text-color--caution">
          1.0000 {swapInfo.tokenIn.symbol} = {`${exchangeRate} ${swapInfo.tokenOut.symbol}`}
        </label>
        <label className="label label--secondary text-color--caution" style={{ marginLeft: '0.25rem' }}>
          ({priceImpact} Price Impact)
        </label>
      </>
    );
    error = (
      <InputViewError
        title="Slippage for this swap is high."
        description=" A swap of this size may have a high price impact, given the current liquidity in the pool. There may be a larger difference between the amount of your input token and what you will recieve in the output token."
      />
    );
  }

  return (
    <div className={`swap-dropdown L2${active ? ' swap-dropdown--active' : ''}`} onClick={() => setActive(!active)}>
      <div className="swap-dropdown__row">
        <div className="swap-dropdown__row__left">{exchangeRateLabel}</div>
        <div className="swap-dropdown__row__right">
          <ChevronDown className="svg--icon--2" />
        </div>
      </div>
      <div className="swap-dropdown__content">
        {error}
        <div className="swap-dropdown__row">
          <div className="swap-dropdown__row__left">
            <label className="label label--secondary text-color--2">Expected V3 Borrow</label>
          </div>
          <div className="swap-dropdown__row__right">
            <div className={`asset asset--${baseAsset.symbol}`}></div>
            <label className="label text-color--2">{expectedBorrow}</label>
          </div>
        </div>
        <div className="swap-dropdown__row">
          <div className="swap-dropdown__row__left">
            <label className="label label--secondary text-color--2">Price Impact</label>
          </div>
          <div className="swap-dropdown__row__right">
            <label className="label text-color--2">{priceImpact}</label>
          </div>
        </div>
        <div className="swap-dropdown__divider"></div>
        <div className="swap-dropdown__row">
          <div className="swap-dropdown__row__left">
            <label className="label label--secondary text-color--2">Maximum V3 Borrow</label>
          </div>
          <div className="swap-dropdown__row__right">
            <div className={`asset asset--${baseAsset.symbol}`}></div>
            <label className="label text-color--2">{maximumBorrow}</label>
          </div>
        </div>
        <div className="swap-dropdown__row">
          <div className="swap-dropdown__row__left">
            <label className="label label--secondary text-color--2">Network Fee</label>
          </div>
          <div className="swap-dropdown__row__right">
            <label className="label text-color--2">{networkFee}</label>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SwapDropdown;
