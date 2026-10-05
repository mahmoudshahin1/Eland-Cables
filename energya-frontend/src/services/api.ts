/**
 * Centralized Axios instance with JWT interceptors.
 *
 * - Request interceptor: attaches `Authorization: Bearer <token>` from auth store.
 * - Response interceptor: on 401, attempts a silent token refresh then retries
 *   the original request once. If refresh also fails, clears the session and
 *   redirects to /login.
 */
import axios from 'axios';
import type { AxiosRequestConfig, InternalAxiosRequestConfig } from 'axios';

// ── Axios Instance ──────────────────────────────────────────────────────────
const api = axios.create({
  baseURL: '/api',
  timeout: 30_000,
  headers: { 'Content-Type': 'application/json' },
});

// Flag to prevent multiple concurrent refresh attempts
let isRefreshing = false;
// Queue of requests waiting for a fresh token
let failedQueue: Array<{
  resolve: (token: string) => void;
  reject: (err: unknown) => void;
}> = [];

function processQueue(error: unknown, token: string | null = null) {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token!);
    }
  });
  failedQueue = [];
}

// ── Helpers to read/write tokens (avoid circular store import) ──────────
function getAccessToken(): string | null {
  return localStorage.getItem('access_token') || sessionStorage.getItem('access_token');
}

function getRefreshToken(): string | null {
  return localStorage.getItem('refresh_token') || sessionStorage.getItem('refresh_token');
}

function persistTokens(access: string, refresh: string) {
  // Keep same storage that was originally used
  if (localStorage.getItem('access_token') !== null) {
    localStorage.setItem('access_token', access);
    localStorage.setItem('refresh_token', refresh);
  } else {
    sessionStorage.setItem('access_token', access);
    sessionStorage.setItem('refresh_token', refresh);
  }
}

function clearTokens() {
  localStorage.removeItem('access_token');
  localStorage.removeItem('refresh_token');
  sessionStorage.removeItem('access_token');
  sessionStorage.removeItem('refresh_token');
}

// ── Request Interceptor ─────────────────────────────────────────────────────
api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = getAccessToken();
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error),
);

// ── Response Interceptor (auto-refresh on 401) ──────────────────────────────
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    // Only attempt refresh if we got a 401, haven't retried yet, and it's not the refresh call itself
    if (
      error.response?.status === 401 &&
      !originalRequest._retry &&
      !originalRequest.url?.includes('/auth/refresh-token')
    ) {
      if (isRefreshing) {
        // Another refresh is in-flight — queue this request
        return new Promise((resolve, reject) => {
          failedQueue.push({
            resolve: (token: string) => {
              originalRequest.headers.Authorization = `Bearer ${token}`;
              resolve(api(originalRequest));
            },
            reject: (err: unknown) => reject(err),
          });
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      const refreshToken = getRefreshToken();
      if (!refreshToken) {
        clearTokens();
        window.location.href = '/login';
        return Promise.reject(error);
      }

      try {
        const { data } = await axios.post('/api/auth/refresh-token', { refreshToken });

        if (data.success && data.accessToken) {
          persistTokens(data.accessToken, data.refreshToken ?? refreshToken);
          processQueue(null, data.accessToken);

          originalRequest.headers.Authorization = `Bearer ${data.accessToken}`;
          return api(originalRequest);
        }
        throw new Error('Refresh failed');
      } catch (refreshError) {
        processQueue(refreshError, null);
        clearTokens();
        window.location.href = '/login';
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  },
);

export default api;
