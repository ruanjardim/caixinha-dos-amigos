/**
 * Content-Security-Policy das páginas (gerada a cada requisição no proxy).
 * Scripts: somente os do próprio site que carregam o nonce desta resposta ('strict-dynamic'
 * repassa a confiança aos módulos que eles importam). Sem 'unsafe-inline' para scripts.
 * Estilos: 'unsafe-inline' é mantido porque atributos style (React/gráficos) não aceitam nonce;
 * estilos não executam código.
 */
export function pageCsp(nonce: string, isProduction: boolean): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isProduction ? "" : " 'unsafe-eval'"}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self'",
    "worker-src 'self'",
    "manifest-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    ...(isProduction ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
}

/** Respostas de API (JSON, PDF, planilhas, imagens): nada é executado nem embutido. */
export const API_CSP = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";

export function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}
