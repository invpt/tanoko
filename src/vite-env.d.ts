/// <reference types="svelte" />
/// <reference types="vite/client" />

interface ViteTypeOptions {
  strictImportMetaEnv: unknown;
}

interface ImportMetaEnv {
  readonly VITE_DATAFILE_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
