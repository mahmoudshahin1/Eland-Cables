export interface EnvironmentVariables {
  NODE_ENV?: string;
  PORT?: number;
  DATABASE_URL: string;
  JWT_SECRET: string;
  CORS_ORIGIN?: string;
  CORS_ALLOWED_ORIGINS?: string;
  LOGIN_RATE_LIMIT?: string;
  LOGIN_RATE_MAX?: number;
  LOGIN_RATE_WINDOW_MS?: number;
  LOGIN_LOCK_THRESHOLD?: number;
}

export function validateEnv(config: Record<string, unknown>): EnvironmentVariables {
  const errors: string[] = [];

  const databaseUrl = config['DATABASE_URL'] as string | undefined;
  if (!databaseUrl || typeof databaseUrl !== 'string' || !databaseUrl.trim()) {
    errors.push('DATABASE_URL is required and must not be empty.');
  }

  const jwtSecret = config['JWT_SECRET'] as string | undefined;
  if (!jwtSecret || typeof jwtSecret !== 'string') {
    errors.push('JWT_SECRET is required.');
  } else if (jwtSecret.length < 32) {
    errors.push(`JWT_SECRET must be at least 32 characters long. Received length: ${jwtSecret.length}.`);
  }

  if (errors.length > 0) {
    throw new Error(`[ConfigModule] Environment validation failed:\n - ${errors.join('\n - ')}`);
  }

  const port = config['PORT'] ? Number(config['PORT']) : 3000;

  return {
    ...config,
    PORT: isNaN(port) ? 3000 : port,
    DATABASE_URL: databaseUrl!,
    JWT_SECRET: jwtSecret!,
  } as EnvironmentVariables;
}
