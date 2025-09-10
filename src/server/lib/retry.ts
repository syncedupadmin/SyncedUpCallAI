export async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: {
    maxAttempts?: number;
    delayMs?: number;
    onError?: (error: any, attempt: number) => void;
  } = {}
): Promise<T> {
  const { maxAttempts = 2, delayMs = 10000, onError } = options;
  
  let lastError: any;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (onError) {
        onError(error, attempt);
      }
      
      if (attempt < maxAttempts) {
        console.log(`Attempt ${attempt} failed, retrying in ${delayMs}ms...`);
        await sleep(delayMs);
      }
    }
  }
  
  throw lastError;
}

export function truncatePayload(payload: any, maxLength: number = 4096): any {
  const str = JSON.stringify(payload);
  if (str.length <= maxLength) {
    return payload;
  }
  
  // Try to parse back a truncated version
  try {
    const truncated = str.substring(0, maxLength - 20) + '...truncated"}';
    return JSON.parse(truncated);
  } catch {
    // If that fails, just return a string
    return { message: str.substring(0, maxLength - 13) + '...truncated' };
  }
}