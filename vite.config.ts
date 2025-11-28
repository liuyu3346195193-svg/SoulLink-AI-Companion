import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  const env = loadEnv(mode, (process as any).cwd(), '');

  return {
    plugins: [react()],
    build: {
      outDir: 'dist',
    },
    define: {
      // Robustly polyfill process.env
      // 1. Prevents "process is not defined" error in browser
      // 2. Injects environment variables
      'process.env': JSON.stringify(env),
    }
  };
});