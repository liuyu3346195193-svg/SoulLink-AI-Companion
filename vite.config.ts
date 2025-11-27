import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  // Set the third parameter to '' to load all env regardless of the `VITE_` prefix.
  const env = loadEnv(mode, (process as any).cwd(), '');

  return {
    plugins: [react()],
    build: {
      outDir: 'dist',
    },
    define: {
      // Robustly polyfill process.env for the Gemini SDK and other libs
      'process.env': JSON.stringify(env),
      // Specifically ensure API_KEY is available
      'process.env.API_KEY': JSON.stringify(env.API_KEY),
    }
  };
});