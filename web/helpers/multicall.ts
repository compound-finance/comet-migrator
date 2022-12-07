import { ContractCall, Provider } from 'ethers-multicall';

export async function multicall(
  multicallProvider: Provider,
  calls: Array<ContractCall | Array<ContractCall>>
): Promise<Array<any | Array<any>>> {
  const reqs: ContractCall[] = [];
  const slices: [boolean, number, number][] = [];
  calls.forEach(x => {
    if (Array.isArray(x)) {
      slices.push([true, reqs.length, reqs.length + x.length]);
      reqs.push(...x);
    } else {
      slices.push([false, reqs.length, 0]);
      reqs.push(x);
    }
  });
  const results = await multicallProvider.all(reqs);
  return slices.map(([isArray, start, end]) => {
    if (!isArray) {
      return results[start];
    } else {
      return results.slice(start, end);
    }
  });
}
