import { InMessage, OutMessage } from './MessageTypes';
import { SendRPC } from './useRPC';
import { TransactionResponse } from '@ethersproject/providers';

export async function read(sendRPC: SendRPC, to: string, idata: string): Promise<string> {
  let { data } = await sendRPC({ type: 'read', to: to, data: idata }) as OutMessage<{ type: 'read' }>;
  return data;
}

export async function write(sendRPC: SendRPC, to: string, idata: string): Promise<TransactionResponse> {
  let { data } = await sendRPC({ type: 'write', to: to, data: idata }) as OutMessage<{ type: 'write' }>;
  return data;
}

export async function sendWeb3(sendRPC: SendRPC, method: string, params: string[]): Promise<any> {
  let { data } = await sendRPC({ type: 'sendWeb3', method, params }) as OutMessage<{ type: 'sendWeb3' }>;
  return data;
}
