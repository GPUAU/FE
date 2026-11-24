import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

// 새 Vue 화면은 /app/ 아래에서 서비스한다. 기존 화면(/, /static/)은 이전이 끝날 때까지 그대로 둔다.
// 개발 서버는 /api/v1을 Spring으로 넘긴다(기본: 로컬 Spring 18092, GPU_SPRING_BASE_URL로 변경).
export default defineConfig({
  base: '/app/',
  plugins: [vue()],
  server: {
    port: 5173,
    proxy: {
      '/api/v1': process.env.GPU_SPRING_BASE_URL || 'http://127.0.0.1:18092',
    },
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
  },
});
