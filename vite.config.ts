import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/v1': 'http://127.0.0.1:3000' } },
  test: { environment: 'node', exclude: ['tests/e2e/**', 'node_modules/**'] },
})