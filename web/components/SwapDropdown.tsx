import { StateType, BaseAsset } from '@compound-finance/comet-extension/dist/CometState';
import { useState } from 'react';

import {
  FACTOR_PRECISION,
  formatRateFactor,
  formatTokenBalance,
  maximumBorrowFromSwapInfo,
} from '../helpers/numbers';

import { SwapInfo } from '../types';

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

  const expectedBorrow = formatTokenBalance(swapInfo.tokenOut.decimals, swapInfo.tokenOut.amount, false);
  const valueIn = (swapInfo.tokenIn.amount * swapInfo.tokenIn.price) / BigInt(10 ** swapInfo.tokenIn.decimals);
  const valueOut = (swapInfo.tokenOut.amount * swapInfo.tokenOut.price) / BigInt(10 ** swapInfo.tokenOut.decimals);
  const priceImpactRaw = ((valueOut - valueIn) * BigInt(10 ** FACTOR_PRECISION)) / valueIn;
  const priceImpact = formatRateFactor(priceImpactRaw < 0 ? -priceImpactRaw : priceImpactRaw);
  const maximumBorrow = formatTokenBalance(swapInfo.tokenOut.decimals, maximumBorrowFromSwapInfo(swapInfo), false);
  const networkFee = swapInfo.networkFee;

  return (
    <div className={`swap-dropdown L2${active ? ' swap-dropdown--active' : ''}`} onClick={() => setActive(!active)}>
      <div className="swap-dropdown__row">
        <div className="swap-dropdown__row__left">
          <label className="label text-color--2">1.0000 DAI = 0.9899 USDC</label>
          <label className="label label--secondary text-color--2">(0.05% slippage)</label>
        </div>
        <div className="swap-dropdown__row__right">
          <ChevronDown className="svg--icon--2" />
        </div>
      </div>
      <div className="swap-dropdown__content">
        <div className="swap-dropdown__row">
          <div className="swap-dropdown__row__left">
            <label className="label label--secondary text-color--2">Expected Borrow</label>
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
            <label className="label label--secondary text-color--2">Maximum Borrow</label>
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
