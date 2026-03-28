import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    base: '/reader/',
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // 保留这个开关，方便在特殊运行环境里关闭 HMR，避免频繁热更新影响调试。
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
