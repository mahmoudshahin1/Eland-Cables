/**
 * Demo/quick-switch authentication is a local development aid only.
 * It must never mint a production session or bypass PostgreSQL login.
 */
export function isDemoAuthenticationAllowed(nodeEnv: string | undefined = process.env.NODE_ENV): boolean {
  return nodeEnv !== 'production';
}

export function applyDemoUserLogin<T>(user: T, nodeEnv: string | undefined = process.env.NODE_ENV): T | null {
  if (!isDemoAuthenticationAllowed(nodeEnv)) return null;
  return user;
}
