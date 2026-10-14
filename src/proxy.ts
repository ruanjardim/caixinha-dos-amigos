import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Barreira otimista: sem cookie de sessão, nem chega a renderizar áreas privadas.
 * NÃO é a verificação de segurança — cada página/ação valida sessão e permissão
 * no servidor (ver modules/auth/session.ts).
 */
export function proxy(request: NextRequest) {
  const hasSession = getSessionCookie(request, { cookiePrefix: "caixinha" });
  if (!hasSession) {
    const url = new URL("/login", request.url);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/minha-caixinha/:path*"],
};
