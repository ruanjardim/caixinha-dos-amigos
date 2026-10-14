/**
 * Símbolo da marca em JSX simples, para gerar PNG com `ImageResponse`
 * (ícones do PWA e do iPhone). Escala com `size`.
 */
export function IconImage({ size, maskable = false }: { size: number; maskable?: boolean }) {
  // Ícones "maskable" precisam de margem de segurança (~10%).
  const inner = maskable ? size * 0.8 : size;
  return (
    <div
      style={{
        width: size,
        height: size,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: maskable ? "#039855" : "transparent",
      }}
    >
      <svg width={inner} height={inner} viewBox="0 0 48 48">
        <rect width="48" height="48" rx={maskable ? 0 : 12} fill="#039855" />
        <circle cx="19.5" cy="12" r="5" fill="#a6f4c5" />
        <circle cx="28.5" cy="12" r="5" fill="#ffffff" stroke="#039855" strokeWidth="1.5" />
        <rect x="8.5" y="19" width="31" height="6" rx="2.5" fill="#ffffff" />
        <rect x="18" y="21" width="12" height="2" rx="1" fill="#027a48" />
        <path d="M11 26h26v9.5a3.5 3.5 0 0 1-3.5 3.5h-19A3.5 3.5 0 0 1 11 35.5z" fill="#ffffff" />
        <path d="M19 30.5q5 4 10 0" fill="none" stroke="#039855" strokeWidth="2.2" strokeLinecap="round" />
      </svg>
    </div>
  );
}
