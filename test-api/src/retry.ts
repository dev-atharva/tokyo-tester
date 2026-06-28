export async function retry<T>(
  label: string,
  operation: () => Promise<T>,
  attempts = 30,
  delayMs = 1000,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      console.log(`${label} unavailable (${attempt}/${attempts})`);
      if (attempt < attempts) await Bun.sleep(delayMs);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`${label} unavailable`);
}
