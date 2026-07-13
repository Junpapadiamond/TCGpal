import { AsyncLocalStorage } from "node:async_hooks";

export type McpRequestContext = {
  requestId: string;
};

const storage = new AsyncLocalStorage<McpRequestContext>();

export function runWithMcpRequestContext<T>(context: McpRequestContext, callback: () => T): T {
  return storage.run(context, callback);
}

export function getMcpRequestContext() {
  return storage.getStore();
}
