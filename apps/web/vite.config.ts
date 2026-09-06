import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Relative asset URLs allow the compiled React app to run inside a VS Code Webview.
  base: './',
  server: {
    port: 5173,
  },
});
