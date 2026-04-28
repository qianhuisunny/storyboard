// vite.config.ts
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'url'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiProxyTarget = env.VITE_API_PROXY_TARGET || 'http://localhost:8001'

  return {
    plugins: [react()],
    // Base path for GitHub Pages deployment
    base: process.env.GITHUB_PAGES ? '/storyboard-hackathon/' : '/',
    resolve: {
      alias: {
        "@": fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      port: 3000,
      proxy: {
        '/api': apiProxyTarget,
      }
    }
  }
})
