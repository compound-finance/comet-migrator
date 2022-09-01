import { useEffect, useState } from 'react';
import { InMessage, OutMessage } from './MessageTypes';

export type SendRPC = (inMsg: InMessage) => Promise<OutMessage<InMessage>>;

type Handler = Record<number, {resolve: (res: any) => void, reject: (err: any) => void}>;

let msgId = 1;
let handlers: Handler = {};

export function useRPC(): SendRPC {
  function sendRPC(inMsg: InMessage): Promise<OutMessage<InMessage>> {
    msgId++;
    let resolve: (res: any) => void;
    let reject: (err: any) => void;
    let p = new Promise<OutMessage<InMessage>>((resolve_, reject_) => {
      resolve = resolve_;
      reject = reject_;
    });
    handlers[msgId] = { resolve: resolve!, reject: reject! };
    console.log("sending", { msgId: msgId, message: inMsg });
    window.top?.postMessage( { msgId: msgId, message: inMsg }, "*");
    return p as unknown as any;
  }

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      let msgId: number | undefined = event.data.msgId;
      let result: any | undefined = event.data.result;
      let error: any | undefined = event.data.error;
      if (msgId !== undefined && msgId in handlers) {
        let { resolve, reject } = handlers[msgId]!;
        if (error) {
          reject(error);
        } else if (result) {
          resolve(result);
        }
      }
    }

    window.addEventListener("message", handler)

    return () => window.removeEventListener("message", handler)
  }, [handlers]);

  return sendRPC;
}
