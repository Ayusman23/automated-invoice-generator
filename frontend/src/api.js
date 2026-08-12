/**
 * api.js — Central API base URL
 *
 * Uses VITE_API_URL from the .env file if set.
 * Falls back to localhost for same-machine development.
 *
 * To make the app reachable from other devices (phones, other laptops):
 *   1. Set VITE_API_URL=http://<your-local-ip>:5000 in frontend/.env
 *   2. Set FRONTEND_URL=http://<your-local-ip>:5173 in backend/.env
 *   3. Restart both servers
 */
const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export default API;
