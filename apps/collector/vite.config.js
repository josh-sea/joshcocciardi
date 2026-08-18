import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Served from https://www.joshcocciardi.com/projects/collector by the
// portfolio hosting target (apps/collector/dist is copied into
// apps/portfolio/public/projects/collector at deploy time — see deploy.sh).
// https://vite.dev/config/
export default defineConfig({
  base: '/projects/collector',
  plugins: [react()],
})
