import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages project sites are served from /REPOSITORY_NAME/.
// After creating your repo, set VITE_BASE_PATH in GitHub repo settings if needed.
// Example: VITE_BASE_PATH=/scout-flag-routes/
export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE_PATH || './',
})
