/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE?: string;
  readonly VITE_API_ENABLED?: string;
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_DOCS_BASE?: string;
  readonly VITE_QUESTION_BANK_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module "mammoth" {
  const mammoth: {
    extractRawText(input: { arrayBuffer: ArrayBuffer }): Promise<{ value: string }>;
  };
  export default mammoth;
}
