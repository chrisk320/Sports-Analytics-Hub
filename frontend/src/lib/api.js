import axios from 'axios';

// Single source of truth for the backend base URL.
// Override locally with frontend/.env -> VITE_API_BASE_URL=http://localhost:5000
export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || 'https://sports-analytics-hub-7hse.onrender.com';

// Pre-configured axios instance — use this for all backend calls.
export const api = axios.create({ baseURL: API_BASE_URL });

export default api;
