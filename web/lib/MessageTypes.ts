import { TransactionResponse } from '@ethersproject/providers';

export type InMessage =
  | { type: 'read'; to: string; data: string }
  | { type: 'write'; to: string; data: string }
  | { type: 'sendWeb3'; method: string; params: string[] }
  | { type: 'getTheme'; };

export type OutMessage<InMessage> = InMessage extends { type: 'read' }
  ? { type: 'read'; data: string }
  : InMessage extends { type: 'write' }
  ? { type: 'write'; data: TransactionResponse }
  : InMessage extends { type: 'sendWeb3' }
  ? { type: 'sendWeb3'; data: any }
  : InMessage extends { type: 'getTheme' }
  ? { type: 'setTheme'; theme: 'Dark' | 'Light' }
  : null;

export type ExtMessage =
  { type: 'setTheme', theme: 'Dark' | 'Light' };

type ExtMessageConfig<ExtMessage extends { type: string }> = {
    [E in ExtMessage as E["type"]]?: (msg: E) => void;
};

export type ExtMessageHandler = ExtMessageConfig<ExtMessage>;
