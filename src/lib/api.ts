import axios from 'axios';
import { getIdToken } from './auth';

const rawApiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim() || '';

export const API_BASE_URL = rawApiBaseUrl.replace(/\/+$/, '');

export function apiUrl(path: string) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return API_BASE_URL ? `${API_BASE_URL}${normalizedPath}` : normalizedPath;
}

axios.interceptors.request.use(async (config) => {
  if (config.url?.startsWith('/api') || (API_BASE_URL && config.url?.includes(API_BASE_URL))) {
    const token = await getIdToken();
    if (token) {
      config.headers['Authorization'] = `Bearer ${token}`;
    }
  }
  return config;
});

const originalFetch = window.fetch;
window.fetch = async (input, init = {}) => {
  let url = '';
  if (typeof input === 'string') {
    url = input;
  } else if (input instanceof URL) {
    url = input.toString();
  } else if (input instanceof Request) {
    url = input.url;
  }

  if (url.startsWith('/api') || (API_BASE_URL && url.includes(API_BASE_URL))) {
    const token = await getIdToken();
    if (token) {
      init.headers = {
        ...init.headers,
        'Authorization': `Bearer ${token}`
      };
    }
  }
  return originalFetch(input, init);
};

