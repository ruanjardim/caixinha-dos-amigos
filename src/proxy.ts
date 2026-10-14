import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";
import { generateNonce, pageCsp } from "@/lib/csp";

const PROTECTED = ["/admin", "/minha-caixinha", "/seguranca"];

/**
 * 1. CSP com nonce novo a cada requisição (o Next.js aplica o nonce aos próprios scripts).
 * 2. Barreira otimista: sem cookie de sessão, áreas privadas nem chegam a renderizar.
 *    NÃO é a verificação de segurança — cada página/ação valida sessão e permissão
 *    no servidor (ver modules/auth/session.ts).
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isProtected = PROTECTED.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (isProtected && !getSessionCookie(request, { cookiePrefix: "caixinha" })) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const nonce = generateNonce();
  const csp = pageCsp(nonce, process.env.NODE_ENV === "production");
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    {
      // Páginas: tudo, exceto APIs, arquivos estáticos e PWA.
      source: "/((?!api|_next/static|_next/image|favicon.ico|sw.js|manifest.webmanifest|pwa-icon|logo.svg).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
