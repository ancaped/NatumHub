import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';
import { execSync } from 'child_process';
import pkg from './package.json';

function resolveVersion(): string {
  if (process.env.APP_VERSION) {
    return process.env.APP_VERSION;
  }
  try {
    const count = execSync('git rev-list --count HEAD', { encoding: 'utf8' }).trim();
    const hash = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
    return `0.2.${count}-${hash}`;
  } catch {
    return pkg.version || '0.2.0';
  }
}

const appVersion = resolveVersion();

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  clearScreen: false,
  server: { port: 5175, strictPort: true },
  envPrefix: ['VITE_', 'TAURI_'],
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
});
