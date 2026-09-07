/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_HUB_TOKEN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
