import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // process.cwd() is available in the Vite config environment (Node.js)
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [react()],
    build: {
      outDir: 'dist',
    },
    define: {
      // Polyfill process.env for client-side compatibility
      'process.env': JSON.stringify(env),
      'process.env.API_KEY': JSON.stringify(env.API_KEY),
    }
  };
});