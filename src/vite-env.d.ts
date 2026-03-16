/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly APP_URL?: string;
  readonly GEMINI_API_KEY?: string;
  readonly VITE_GEMINI_API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
