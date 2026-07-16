import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Capa 3 (interfaz). Deploy en GitHub Pages bajo /atlas/.
// https://vite.dev/config/
export default defineConfig({
  base: '/atlas/',
  plugins: [react()],
})
