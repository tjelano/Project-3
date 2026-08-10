/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // .glb isn't in Vite's default asset list — without this, importing one
  // statically (the same "fails the build if missing" discipline every
  // other asset in this project already gets) doesn't work.
  assetsInclude: ['**/*.glb'],
  server: {
    // Vite's default `localhost` bound IPv6-only on this machine ([::1]),
    // so Chrome — which resolves localhost to 127.0.0.1 — got connection
    // refused while editor-embedded browsers (IPv6) worked fine. Binding
    // all interfaces listens on both stacks.
    //
    // Note: this also makes the dev server reachable from other devices on
    // your network. That's handy for testing on a phone; drop it back to
    // '127.0.0.1' if you'd rather keep it strictly local.
    host: true,
  },
  resolve: {
    // stats-gl (a drei dependency) pins its own three@0.170, which loaded
    // alongside the root three@0.185 and produced "Multiple instances of
    // Three.js being imported". Two copies means instanceof checks across
    // the boundary silently fail — exactly the kind of bug that surfaces
    // later as an unexplained material or raycast failure. Force one copy.
    dedupe: ['three'],
  },
  test: {
    // The game-logic layer (src/game, src/data) is pure and framework-free,
    // so it needs no DOM environment — keeps the suite fast enough to run
    // on every save.
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
})
