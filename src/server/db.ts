import pg from 'pg';

// CRITICAL: Force SSL globally for ALL pg connections
// This MUST be set before any Pool or Client is created
// Set it unconditionally if we're not in local development
if (process.env.DATABASE_URL) {
  // If we have a DATABASE_URL at all, assume we need SSL with no cert verification
  pg.defaults.ssl = { rejectUnauthorized: false };
  console.log('SSL defaults forcefully set for all pg connections');
}

// Enhanced connection pool configuration for Supabase
const createPool = () => {
  // Always use SSL if DATABASE_URL exists (which means we're not in local dev without a DB)
  const needsSSL = !!process.env.DATABASE_URL;
  
  console.log('Creating database pool:', {
    hasDbUrl: !!process.env.DATABASE_URL,
    sslEnabled: needsSSL,
    NODE_ENV: process.env.NODE_ENV,
    VERCEL: process.env.VERCEL
  });
  
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    // Connection pool settings optimized for Supabase
    max: 10, // Maximum number of connections in the pool
    min: 2, // Minimum number of connections to maintain
    idleTimeoutMillis: 30000, // Close idle connections after 30 seconds
    connectionTimeoutMillis: 10000, // Timeout after 10 seconds if unable to connect
    // Handle connection errors gracefully
    allowExitOnIdle: true,
    // SSL configuration - use when DATABASE_URL exists
    ssl: needsSSL
      ? { rejectUnauthorized: false }  // Required for Supabase/Heroku Postgres
      : undefined
  });

  // Handle pool-level errors
  pool.on('error', (err) => {
    console.error('Database pool error:', err);
  });

  // Handle connection errors
  pool.on('connect', (client) => {
    console.log('New database connection established');
  });

  return pool;
};

const pool = createPool();

// Enhanced query wrapper with retry logic and proper error handling
const executeQuery = async <T = any>(
  operation: () => Promise<T>,
  maxRetries = 3,
  retryDelay = 1000
): Promise<T> => {
  let lastError: Error;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error: any) {
      lastError = error;
      
      // Check if this is a connection-related error that we should retry
      const isRetryableError = 
        error.code === 'ECONNRESET' ||
        error.code === 'ENOTFOUND' ||
        error.code === 'ECONNREFUSED' ||
        error.code === 'ETIMEDOUT' ||
        error.message?.includes('Connection terminated') ||
        error.message?.includes('server closed the connection') ||
        error.message?.includes('connection is closed');

      if (!isRetryableError || attempt === maxRetries) {
        throw error;
      }

      console.warn(`Database operation failed (attempt ${attempt}/${maxRetries}):`, error.message);
      
      // Exponential backoff with jitter
      const delay = retryDelay * Math.pow(2, attempt - 1) + Math.random() * 1000;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError!;
};

// Database interface with enhanced error handling and connection management
export const db = {
  query: async (q: string, params?: any[]) => {
    return executeQuery(() => pool.query(q, params));
  },

  one: async (q: string, params?: any[]) => {
    const result = await executeQuery(() => pool.query(q, params));
    return result.rows[0];
  },

  oneOrNone: async (q: string, params?: any[]) => {
    const result = await executeQuery(() => pool.query(q, params));
    return result.rows[0] || null;
  },

  manyOrNone: async (q: string, params?: any[]) => {
    const result = await executeQuery(() => pool.query(q, params));
    return result.rows || [];
  },

  none: async (q: string, params?: any[]) => {
    await executeQuery(() => pool.query(q, params));
  },

  result: async (q: string, params?: any[]) => {
    return executeQuery(() => pool.query(q, params));
  },

  // Health check method with timeout
  healthCheck: async (timeoutMs = 5000): Promise<boolean> => {
    try {
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Health check timeout')), timeoutMs);
      });

      const queryPromise = pool.query('SELECT 1 as health_check');
      
      await Promise.race([queryPromise, timeoutPromise]);
      return true;
    } catch (error) {
      console.error('Database health check failed:', error);
      return false;
    }
  },

  // Get pool status information
  getPoolStatus: () => ({
    totalCount: pool.totalCount,
    idleCount: pool.idleCount,
    waitingCount: pool.waitingCount,
  }),

  // Graceful shutdown
  shutdown: async () => {
    try {
      console.log('Closing database pool...');
      await pool.end();
      console.log('Database pool closed successfully');
    } catch (error) {
      console.error('Error closing database pool:', error);
    }
  }
};

// Graceful shutdown handling
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down database connections...');
  await db.shutdown();
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down database connections...');
  await db.shutdown();
});

// Handle uncaught exceptions
process.on('uncaughtException', async (error) => {
  console.error('Uncaught exception:', error);
  await db.shutdown();
  process.exit(1);
});

// Export pool for advanced usage if needed
export { pool };
