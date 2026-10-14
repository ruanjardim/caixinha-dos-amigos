import type { NextConfig } from "next";
import { API_CSP } from "./src/lib/csp";

const isProd = process.env.NODE_ENV === "production";

/**
 * Content-Security-Policy: as PÁGINAS recebem uma CSP com nonce gerada a cada requisição
 * em src/proxy.ts (src/lib/csp.ts). Aqui, só a CSP mínima das rotas de API.
 */

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  ...(isProd ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }] : []),
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  // Pacotes nativos/servidor que não devem ser empacotados.
  serverExternalPackages: ["@node-rs/argon2", "pg", "@react-pdf/renderer", "exceljs"],
  experimental: {
    // Comprovantes de até 5 MB enviados por Server Actions.
    serverActions: { bodySizeLimit: "6mb" },
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      { source: "/api/:path*", headers: [{ key: "Content-Security-Policy", value: API_CSP }] },
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default nextConfig;
