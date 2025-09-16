// Structured JSON logging utilities

export function logInfo(data: Record<string, any>): void {
  const safeData = sanitizeData(data);
  console.log(JSON.stringify({
    ...safeData,
    level: 'info',
    timestamp: new Date().toISOString()
  }));
}

export function logError(message: string, error?: any, data?: Record<string, any>): void {
  const safeData = sanitizeData(data || {});
  console.error(JSON.stringify({
    ...safeData,
    level: 'error',
    message,
    error: error?.message || error,
    timestamp: new Date().toISOString()
  }));
}

// Remove sensitive keys from logs
function sanitizeData(data: Record<string, any>): Record<string, any> {
  const sensitive = ['api_key', 'auth_token', 'password', 'secret', 'token'];
  const result: Record<string, any> = {};

  for (const [key, value] of Object.entries(data)) {
    const lowerKey = key.toLowerCase();
    if (sensitive.some(s => lowerKey.includes(s))) {
      result[key] = '[REDACTED]';
    } else {
      result[key] = value;
    }
  }

  return result;
}