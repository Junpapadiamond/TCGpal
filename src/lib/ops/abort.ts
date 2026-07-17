export function createAbortError(message = "The operation was aborted.") {
  return new DOMException(message, "AbortError");
}

export function createTimeoutError(message = "The operation timed out.") {
  return new DOMException(message, "TimeoutError");
}

export function createLinkedAbortSignal(parent: AbortSignal | undefined, timeoutMs: number) {
  const controller = new AbortController();
  const abortFromParent = () => controller.abort(parent?.reason ?? createAbortError());

  if (parent?.aborted) {
    abortFromParent();
  } else {
    parent?.addEventListener("abort", abortFromParent, { once: true });
  }

  const timeout = setTimeout(() => {
    controller.abort(createTimeoutError());
  }, Math.max(timeoutMs, 1));

  return {
    signal: controller.signal,
    cleanup() {
      clearTimeout(timeout);
      parent?.removeEventListener("abort", abortFromParent);
    },
  };
}

export function abortableDelay(ms: number, signal?: AbortSignal) {
  if (signal?.aborted) return Promise.reject(signal.reason ?? createAbortError());

  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      signal?.removeEventListener("abort", abort);
      resolve();
    }, ms);
    const abort = () => {
      clearTimeout(timeout);
      reject(signal?.reason ?? createAbortError());
    };
    signal?.addEventListener("abort", abort, { once: true });
  });
}
