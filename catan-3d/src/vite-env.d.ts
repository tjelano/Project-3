/// <reference types="vite/client" />

// Not one of vite/client's built-in asset types — matches the
// assetsInclude entry in vite.config.ts that makes Vite actually bundle
// these at runtime; this half just makes tsc -b stop treating the import
// as an unresolvable module.
declare module '*.glb' {
  const url: string
  export default url
}

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_PUBLISHABLE_KEY: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
