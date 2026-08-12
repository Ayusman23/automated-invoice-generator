import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,   // Expose on all network interfaces (0.0.0.0) — allows mobile/other-device access
    port: 5173,
  },
})
