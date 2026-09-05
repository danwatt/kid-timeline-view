import { defineConfig } from 'vite';

// `base` is set from the VITE_BASE env var in CI (GitHub Pages serves a project
// site under /<repo>/). Falls back to '/' for local dev and `vite preview`.
export default defineConfig({
  base: process.env.VITE_BASE || '/',
});
