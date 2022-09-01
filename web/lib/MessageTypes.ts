import { TransactionResponse } from '@ethersproject/providers';

export type InMessage =
  { type: 'read', to: string, data: string } |
  { type: 'write', to: string, data: string } |
  { type: 'sendWeb3', method: string, params: string[] };

export type OutMessage<InMessage> =
  InMessage extends { type: 'read' } ? { type: 'read', data: string } :
  InMessage extends { type: 'write' } ? { type: 'write', data: TransactionResponse } :
  InMessage extends { type: 'sendWeb3' } ? { type: 'sendWeb3', data: any } :
  null;
