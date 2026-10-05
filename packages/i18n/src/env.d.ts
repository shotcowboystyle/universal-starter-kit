/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Whether Frappe app exists — controls translation backend tree-shaking ("true" | "false") */
  readonly VITE_FRAPPE_ENABLED: string;
}
