export const ACCESS_TOKEN_KEY = 'jwt_access_token';
export const REFRESH_TOKEN_KEY = 'jwt_refresh_token';
export const REMEMBER_SESSION_KEY = 'jwt_remember';

function browserStorageAvailable(): boolean {
  return typeof window !== 'undefined' && typeof localStorage !== 'undefined' && typeof sessionStorage !== 'undefined';
}

export function readAccessToken(): string | null {
  if (!browserStorageAvailable()) return null;
  return localStorage.getItem(ACCESS_TOKEN_KEY) || sessionStorage.getItem(ACCESS_TOKEN_KEY);
}

export function readRefreshToken(): string | null {
  if (!browserStorageAvailable()) return null;
  return localStorage.getItem(REFRESH_TOKEN_KEY) || sessionStorage.getItem(REFRESH_TOKEN_KEY);
}

export function isRememberedSession(): boolean {
  if (!browserStorageAvailable()) return true;
  const flag = localStorage.getItem(REMEMBER_SESSION_KEY);
  if (flag === '0') return false;
  if (flag === '1') return true;
  return Boolean(localStorage.getItem(ACCESS_TOKEN_KEY) || localStorage.getItem(REFRESH_TOKEN_KEY));
}

export function persistAuthTokens(accessToken: string, refreshToken: string, rememberMe: boolean): void {
  if (!browserStorageAvailable()) return;
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  sessionStorage.removeItem(ACCESS_TOKEN_KEY);
  sessionStorage.removeItem(REFRESH_TOKEN_KEY);
  const store = rememberMe ? localStorage : sessionStorage;
  store.setItem(ACCESS_TOKEN_KEY, accessToken);
  store.setItem(REFRESH_TOKEN_KEY, refreshToken);
  localStorage.setItem(REMEMBER_SESSION_KEY, rememberMe ? '1' : '0');
}

export function clearAuthTokens(): void {
  if (!browserStorageAvailable()) return;
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(REMEMBER_SESSION_KEY);
  sessionStorage.removeItem(ACCESS_TOKEN_KEY);
  sessionStorage.removeItem(REFRESH_TOKEN_KEY);
}

export function getJwtExpiryMs(token: string | null): number | null {
  if (!token) return null;
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const padded = payload.replace(/-/g, '+').replace(/_/g, '/');
    const json = JSON.parse(atob(padded)) as { exp?: number };
    return typeof json.exp === 'number' ? json.exp * 1000 : null;
  } catch {
    return null;
  }
}
