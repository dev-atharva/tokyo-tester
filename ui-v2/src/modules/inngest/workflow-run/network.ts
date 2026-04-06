export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(
        `Request timed out after ${Math.round(timeoutMs / 1000)}s`,
      );
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function withRetry<T>(
  operation: () => Promise<T>,
  attempts: number,
  backoffMs: number,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt === attempts) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, backoffMs * attempt));
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Retry operation failed");
}

export async function mapWithConcurrency<TInput, TOutput>(
  values: TInput[],
  concurrency: number,
  worker: (value: TInput, index: number) => Promise<TOutput>,
): Promise<TOutput[]> {
  const results = new Array<TOutput>(values.length);
  let nextIndex = 0;

  const runners = Array.from(
    { length: Math.min(concurrency, values.length) },
    async () => {
      while (true) {
        const currentIndex = nextIndex++;
        if (currentIndex >= values.length) {
          return;
        }
        results[currentIndex] = await worker(values[currentIndex], currentIndex);
      }
    },
  );

  await Promise.all(runners);
  return results;
}
