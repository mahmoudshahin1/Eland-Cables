export type LogLevel = 'info' | 'warn' | 'error';

export function logPlatform(level: LogLevel, event: string, details?: Record<string, unknown>): void {
  const payload = {
    ts: new Date().toISOString(),
    level,
    event,
    ...details,
  };
  if (level === 'error') {
    console.error('[energya]', payload);
  } else if (level === 'warn') {
    console.warn('[energya]', payload);
  } else {
    console.info('[energya]', payload);
  }
}
