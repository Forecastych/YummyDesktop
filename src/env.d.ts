/// <reference types="svelte" />
/// <reference types="vite/client" />

declare const __APP_VERSION__: string

interface ImportMetaEnv {
  /** Публичный токен приложения YummyAnime (X-Application), подставляется при сборке. */
  readonly VITE_YUMMY_APP_TOKEN?: string
}
