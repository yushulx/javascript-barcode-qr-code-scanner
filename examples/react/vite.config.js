import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // HTTPS is required for camera access in browsers
    https: false,
    port: 3000,
  },
});
