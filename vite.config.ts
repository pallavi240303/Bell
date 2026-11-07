import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import {fileURLToPath,URL} from 'node:url';
// Optional public read service for local UI development; credentials are never needed.
const readOrigin=process.env.BELL_API_ORIGIN;
const localRead=!!readOrigin&&['localhost','127.0.0.1','[::1]'].includes(new URL(readOrigin).hostname);
export default defineConfig({
 plugins:[react(),tailwindcss()],
 resolve:{alias:{'@':fileURLToPath(new URL('./src',import.meta.url))}},
 server:{proxy:{
  '/api':{target:readOrigin||'http://127.0.0.1:8787',changeOrigin:!!readOrigin&&!localRead,rewrite:path=>readOrigin?path:path.replace(/^\/api/,'')},
  '/rpc':{target:readOrigin||'http://127.0.0.1:8545',changeOrigin:!!readOrigin&&!localRead,rewrite:()=>readOrigin?'/rpc':'/'}
 }}
});
