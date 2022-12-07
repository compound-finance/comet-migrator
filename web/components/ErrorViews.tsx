import { BaseAssetWithState, TokenWithAccountState } from '@compound-finance/comet-extension/dist/CometState';

import {
  formatTokenBalance,
} from '../helpers/numbers';

import { CircleExclamation } from './Icons';

export const InputViewError = ({ title, description }: { title: string; description?: string }) => {
  return (
    <div className="migrator__input-view__error L2">
      <CircleExclamation />
      <label className="label label--secondary">
        <span style={{ fontWeight: '500' }}>{title}</span> {description}
      </label>
    </div>
  );
};

export const notEnoughLiquidityError = (baseAsset: BaseAssetWithState): [string, string] => {
  const title = 'Not enough liquidity.';
  const description = `There is ${formatTokenBalance(baseAsset.decimals, baseAsset.balanceOfComet, false)} of ${
    baseAsset.symbol
  } liquidity remaining.`;

  return [title, description];
};

export const supplyCapError = (token: TokenWithAccountState): [string, string] => {
  const title = 'Supply cap exceeded.';
  const description = `There is ${formatTokenBalance(token.decimals, token.supplyCap - token.totalSupply, false)} of ${
    token.symbol
  } capacity remaining.`;

  return [title, description];
};