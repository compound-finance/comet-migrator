import { useMemo, useEffect, useState } from 'react';
import { ExtMessage, ExtMessageHandler, InMessage, OutMessage } from './MessageTypes';

export interface RPC {
  on: (handler: ExtMessageHandler) => void;
  sendRPC: SendRPC;
}

export type SendRPC = (inMsg: InMessage) => Promise<OutMessage<InMessage>>;

type Handler = Record<number, {resolve: (res: any) => void, reject: (err: any) => void}>;

let msgId = 1;
let handlers: Handler = {};
let extHandlers: ExtMessageHandler[] = [];
let extBacklog: ExtMessage[] = [];

function handleExtMessage(extMsg: ExtMessage) {
  console.log("ext message", extMsg);
  let type = extMsg.type;
  for (let handler of extHandlers) {
    if (type in handler) {
      handler[type]!(extMsg);
    }
  }
}

export function useRPC(): RPC {
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
      if ('type' in event.data) {
        let extMsg = event.data as ExtMessage;
        if (extHandlers.length === 0) {
          extBacklog.push(extMsg);
        } else {
          handleExtMessage(extMsg);
        }
      } else {
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
    }

    window.addEventListener("message", handler)

    return () => window.removeEventListener("message", handler)
  }, [handlers]);

  function on(handler: ExtMessageHandler) {
    extHandlers.push(handler);
    extBacklog.forEach(handleExtMessage);
  }

  let rpc = useMemo(() => ({
    on,
    sendRPC
  }), []);

  return rpc;
}
