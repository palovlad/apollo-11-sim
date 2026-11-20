import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Base path derived from git remote origin: palovlad/apollo-11-sim
export default defineConfig({
  plugins: [react()],
  base: '/apollo-11-sim/',
});
