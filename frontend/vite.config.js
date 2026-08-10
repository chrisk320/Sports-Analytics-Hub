import path from 'path'
import { fileURLToPath } from 'url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    // The suite deliberately covers only the pure logic in src/lib — the betting
    // math is the product, and a wrong de-vig or EV number is a silent,
    // confidently-wrong answer rather than a crash. No jsdom needed.
    environment: 'node',
    include: ['src/**/*.test.js'],
  },
})
