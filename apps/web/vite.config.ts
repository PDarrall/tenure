import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/** Served from https://pdarrall.github.io/tenure/, so every asset path starts with /tenure/. */
export default defineConfig({
  base: '/tenure/',
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022',
  },
})
