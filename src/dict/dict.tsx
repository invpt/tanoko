import { JMdictWord, Kanjidic2Character } from "@scriptin/jmdict-simplified-types";
import DictWorker from "./dictWorker?worker";
import { Component, createContext, createEffect, createSignal, onCleanup, ParentProps, useContext } from "solid-js";

export type DictWorkerMessage = {
  type: "response",
  data: unknown,
} | ({
  type: "status",
} & DictStatus);

export type DictMessage = {
  command: "search",
  query: string,
} | {
  command: "get",
  id: string,
} | {
  command: "getKanji",
  literal: string,
};

export type DictMessageResponse<M> =
  M extends { command: "search" } ? JMdictWord[] :
  M extends { command: "get" } ? JMdictWord :
  M extends { command: "getKanji" } ? Kanjidic2Character :
  never;

export type DictStatus = {
  status: "loading",
  words: number,
} | {
  status: "ready",
  words: number,
} | {
  status: "failure",
  erorr: unknown,
};

export class Dict {
  private worker: Worker;
  private outstandingReqs: { resolve(data: any): void, reject(error: any): void }[] = [];
  private statusListeners: ((status: DictStatus) => void)[] = [];
  private latestStatus: DictStatus = { status: "loading", words: 0 };

  constructor() {
    this.worker = new DictWorker();
    this.worker.onmessage = (msg) => this.onMessage(msg);
    this.worker.onerror = (error) => this.onError(error);
  }

  getLatestStatus() {
    return this.latestStatus;
  }

  addStatusListener(callback: (status: DictStatus) => void) {
    this.statusListeners.push(callback);
  }

  removeStatusListener(callback: (status: DictStatus) => void) {
    this.statusListeners.splice(this.statusListeners.indexOf(callback), 1);
  }

  async search(query: string) {
    return await this.sendMessage({ command: "search", query });
  }

  async get(id: string) {
    return await this.sendMessage({ command: "get", id });
  }

  async getKanji(literal: string) {
    return await this.sendMessage({ command: "getKanji", literal });
  }

  private async sendMessage<M extends DictMessage>(message: M) {
    return await new Promise((resolve, reject) => {
      this.outstandingReqs.push({ resolve, reject });
      this.worker.postMessage(message);
    }) as DictMessageResponse<M>;
  }

  private onMessage(ev: MessageEvent<DictWorkerMessage>) {
    if (ev.data.type === "response") {
      this.outstandingReqs.shift()!.resolve(ev.data.data);
    } else if (ev.data.type === "status") {
      this.latestStatus = ev.data;
      for (const listener of this.statusListeners) {
        listener(ev.data);
      }
    }
  }

  private onError(error: ErrorEvent) {
    this.outstandingReqs.forEach(({ reject }) => reject(error.error));
  }
}

const DictContext = createContext<Dict>();

export function useDict() {
  const dict = useContext(DictContext);

  if (dict === undefined) {
    throw new Error("Cannot useDict() outside of DictProvider");
  } else {
    return dict;
  }
}

export function useDictStatus() {
  const dict = useDict();
  const [status, setStatus] = createSignal<DictStatus>(dict.getLatestStatus());
  createEffect(() => {
    dict.addStatusListener(setStatus);
    onCleanup(() => dict.removeStatusListener(setStatus));
  });
  return status;
}

export const DictProvider: Component<ParentProps> = (props) => {
  const dict = new Dict();

  return (
    <DictContext.Provider value={dict}>
      {props.children}
    </DictContext.Provider>
  );
}
