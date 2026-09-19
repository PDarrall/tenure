/// <reference types="vite/client" />

/** Set by the Pages workflow at build time (`.github/workflows/pages.yml`); absent in a local build. */
interface ImportMetaEnv {
  readonly VITE_COMMIT?: string
  readonly VITE_DEPLOYED?: string
}
