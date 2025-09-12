import pg from 'pg';
import { URL } from 'url';

/**
 * Parse DATABASE_URL into connection parameters
 */
const parseConnectionString = (connectionString: string) => {
  try {
    const url = new URL(connectionString);
    
    return {
      host: url.hostname,
      port: parseInt(url.port) || 5432,
      database: url.pathname.substring(1), // Remove leading slash
      user: url.username,
      password: url.password,
    };
  } catch (error) {
    throw new Error(`Invalid DATABASE_URL format: ${error}`);
  }
};

/**
 * Determine if SSL should be used based on the connection parameters
 */
const shouldUseSSL = (host: string): boolean => {
  // Use SSL for any non-localhost connections
  return host !== 'localhost' && host !== '127.0.0.1' && host !== '::1';
};

/**
 * Create database pool with proper SSL configuration for production environments
 */
const createPool = (): pg.Pool => {
  const connectionString = process.env.DATABASE_URL;
  
  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is required');
  }

  console.log('Creating database pool for:', {
    NODE_ENV: process.env.NODE_ENV,
    VERCEL: !!process.env.VERCEL,
    hasConnectionString: !!connectionString
  });

  // Check if we need SSL based on the connection string
  const needsSSL = connectionString.includes('sslmode=require') || 
                   connectionString.includes('supabase') ||
                   connectionString.includes('pooler');

  console.log('Database connection using connectionString directly with SSL:', needsSSL);

  // Use connectionString directly to preserve all query parameters
  const poolConfig: pg.PoolConfig = {
    connectionString, // Use the full connection string with all query params
    
    // Connection pool settings optimized for serverless environments
    max: 10, // Maximum connections in pool
    min: 0, // Start with no idle connections in serverless
    idleTimeoutMillis: 30000, // Close idle connections after 30 seconds
    connectionTimeoutMillis: 10000, // Timeout after 10 seconds
    allowExitOnIdle: true, // Allow process to exit when all connections idle
    
    // SSL configuration - critical for Supabase and other hosted databases
    ssl: needsSSL ? {
      rejectUnauthorized: false // Required for Supabase's self-signed certificates
    } : undefined
  };

  const pool = new pg.Pool(poolConfig);

  // Enhanced error handling
  pool.on('error', (err, client) => {
    const dbError = err as any; // Cast to handle pg-specific error properties
    console.error('Database pool error:', {
      message: err.message,
      code: dbError.code,
      name: err.name,
      stack: err.stack
    });
    
    // If it's an SSL error, provide additional context
    if (err.message.includes('SSL') || err.message.includes('certificate')) {
      console.error('SSL certificate error detected. This may indicate a configuration issue with the database connection.');
    }
  });

  pool.on('connect', (client) => {
    console.log('New database connection established successfully');
  });

  pool.on('acquire', (client) => {
    console.log('Database connection acquired from pool');
  });

  pool.on('release', (client) => {
    console.log('Database connection returned to pool');
  });

  return pool;
};

/**
 * Singleton pattern for database pool
 * Ensures only one pool instance per process, critical for serverless environments
 */
class DatabaseConnection {
  private static instance: DatabaseConnection;
  private pool: pg.Pool | null = null;

  private constructor() {}

  static getInstance(): DatabaseConnection {
    if (!DatabaseConnection.instance) {
      DatabaseConnection.instance = new DatabaseConnection();
    }
    return DatabaseConnection.instance;
  }

  getPool(): pg.Pool {
    if (!this.pool) {
      this.pool = createPool();
    }
    return this.pool;
  }

  async closePool(): Promise<void> {
    if (this.pool) {
      console.log('Closing database pool...');
      await this.pool.end();
      this.pool = null;
      console.log('Database pool closed successfully');
    }
  }
}

// Get the singleton instance
const dbConnection = DatabaseConnection.getInstance();

const getPool = (): pg.Pool => {
  return dbConnection.getPool();
};

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
    return executeQuery(() => getPool().query(q, params));
  },

  one: async (q: string, params?: any[]) => {
    const result = await executeQuery(() => getPool().query(q, params));
    return result.rows[0];
  },

  oneOrNone: async (q: string, params?: any[]) => {
    const result = await executeQuery(() => getPool().query(q, params));
    return result.rows[0] || null;
  },

  manyOrNone: async (q: string, params?: any[]) => {
    const result = await executeQuery(() => getPool().query(q, params));
    return result.rows || [];
  },

  none: async (q: string, params?: any[]) => {
    await executeQuery(() => getPool().query(q, params));
  },

  result: async (q: string, params?: any[]) => {
    return executeQuery(() => getPool().query(q, params));
  },

  // Health check method with timeout
  healthCheck: async (timeoutMs = 5000): Promise<boolean> => {
    try {
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Health check timeout')), timeoutMs);
      });

      const queryPromise = getPool().query('SELECT 1 as health_check');
      
      await Promise.race([queryPromise, timeoutPromise]);
      return true;
    } catch (error) {
      console.error('Database health check failed:', error);
      return false;
    }
  },

  // Get pool status information
  getPoolStatus: () => {
    const currentPool = getPool();
    return {
      totalCount: currentPool.totalCount,
      idleCount: currentPool.idleCount,
      waitingCount: currentPool.waitingCount,
    };
  },

  // Graceful shutdown
  shutdown: async () => {
    try {
      await dbConnection.closePool();
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

// Export getPool for advanced usage if needed
export { getPool as pool };

// Export the database connection instance for advanced usage if needed
export { dbConnection };
