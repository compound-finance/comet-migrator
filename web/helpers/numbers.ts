const BILLION = 1_000_000_000;
const MILLION = 1_000_000;
const HUNDRED_THOUSAND = 100_000;
const THOUSAND = 1_000;
export const MAX_UINT256 = BigInt('115792089237316195423570985008687907853269984665640564039457584007913129639935');

export enum MeterRiskLevel {
  Low = 'low',
  Medium = 'medium',
  High = 'high'
}

export const formatTokenBalance = (
  tokenDecimals: number,
  value: bigint,
  shortened: boolean = true,
  usd: boolean = false
): string => {
  const baseUnit = BigInt(10 ** tokenDecimals);
  const formatPrecision: number = usd ? 2 : 4;
  const scale = 10 ** (formatPrecision + 1);
  const units = Number((value * BigInt(scale)) / baseUnit) / scale;
  const roundingScale = 10 ** formatPrecision;
  const roundedUnits = Math.round(units * roundingScale) / roundingScale;
  const prefix = usd ? '$' : '';

  if (!shortened) {
    return `${prefix}${roundedUnits.toLocaleString('en-US', {
      minimumFractionDigits: formatPrecision,
      maximumFractionDigits: formatPrecision
    })}`;
  }

  return formatUnits(roundedUnits, shortened, usd);
};

export const formatUnits = (units: number, shortened: boolean = true, usd: boolean = false) => {
  const prefix = usd ? '$' : '';
  let shortenedUnits: number;
  let postfix: string;
  let minimumFractionDigits = usd ? 2 : 4;
  const formatPrecision: number = usd ? 2 : 4;

  if (units > BILLION) {
    shortenedUnits = units / MILLION;
    postfix = 'M';
    minimumFractionDigits = 0;
  } else if (units > MILLION) {
    shortenedUnits = units / MILLION;
    postfix = 'M';
  } else if (units > HUNDRED_THOUSAND) {
    shortenedUnits = units / THOUSAND;
    postfix = 'K';
  } else {
    shortenedUnits = units;
    postfix = '';
  }

  return `${prefix}${shortenedUnits.toLocaleString('en-US', {
    minimumFractionDigits,
    maximumFractionDigits: formatPrecision
  })}${postfix}`;
};

export const getRiskLevelAndPercentage = (numerator: bigint, denominator: bigint): [MeterRiskLevel, number, string] => {
  const percentage =
    denominator === 0n ? (numerator === 0n ? 0 : 100) : Math.round(Number((numerator * 10_000n) / denominator) / 100);
  let riskLevel: MeterRiskLevel;

  if (percentage > 80) {
    riskLevel = MeterRiskLevel.High;
  } else if (percentage > 60) {
    riskLevel = MeterRiskLevel.Medium;
  } else {
    riskLevel = MeterRiskLevel.Low;
  }

  const percentageFill = percentage > 100 ? '100%' : percentage < 0 ? '0%' : `${percentage}%`;
  return [riskLevel, percentage, percentageFill];
};

export const maybeBigIntFromString = (inputValue: string, precision: number): bigint | undefined => {
  try {
    const sanitized = inputValue.replace(/$|,/g, '');
    const [whole, maybeDecimals] = sanitized.split('.');

    const wholeNumber = BigInt(whole) * BigInt(10 ** precision);
    const decimals = !!maybeDecimals
      ? BigInt(maybeDecimals) * BigInt(10 ** (precision - maybeDecimals.length))
      : BigInt(0);

    return wholeNumber + decimals;
  } catch (e) {
    return undefined;
  }
};

export const usdPriceFromEthPrice = (usdcPriceInEth: bigint, priceInEth: bigint, precision: number): bigint => {
  const baseUnit = BigInt(10 ** precision);
  const oneEth = BigInt(10 ** 18);
  const priceOfEth = (baseUnit * oneEth) / usdcPriceInEth;

  return (priceOfEth * priceInEth) / oneEth;
};

export function amountToWei(amount: number, decimals: number): bigint {
  return BigInt(Math.floor(Number(amount) * 10 ** decimals));
}

export function parseNumber(str: string, f: (x: number) => bigint): bigint | null {
  if (str === 'max') {
    return MAX_UINT256;
  } else {
    let num = Number(str);
    if (Number.isNaN(num)) {
      return null;
    } else {
      return f(num);
    }
  }
}
