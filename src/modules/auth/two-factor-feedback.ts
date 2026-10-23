type AuthError = { status?: number; code?: string };

/** Mantém falhas de sessão/servidor separadas de um código realmente recusado. */
export function twoFactorErrorMessage(error: AuthError): string {
  if (error.status === 0) return TWO_FACTOR_CONNECTION_ERROR;
  if (error.status && error.status >= 500) {
    return "O servidor não conseguiu concluir a verificação. Tente novamente em instantes.";
  }
  switch (error.code) {
    case "ACCOUNT_TEMPORARILY_LOCKED":
      return "A verificação foi bloqueada temporariamente após várias tentativas. Aguarde 15 minutos e entre novamente.";
    case "TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE":
      return "O limite de tentativas desta verificação foi atingido. Entre novamente com e-mail e senha.";
    case "INVALID_CODE":
      return "Código inválido para esta configuração. Use o código atual da Caixinha dos Amigos no autenticador.";
    case "INVALID_BACKUP_CODE":
      return "Código de recuperação inválido ou já utilizado.";
    case "INVALID_PASSWORD":
      return "Senha incorreta. Confirme a senha de acesso à Caixinha dos Amigos.";
    case "TOTP_ALREADY_ENABLED":
      return "A verificação em duas etapas já está ativa. Entre novamente com e-mail, senha e o código do autenticador.";
    case "TOTP_NOT_ENABLED":
    case "TWO_FACTOR_NOT_ENABLED":
      return "A configuração do autenticador não está disponível nesta sessão. Entre novamente para continuar.";
    case "INVALID_TWO_FACTOR_COOKIE":
    case "SESSION_EXPIRED":
    case "SESSION_NOT_FRESH":
      return "Sua sessão de verificação expirou. Entre novamente com e-mail e senha.";
  }
  if (error.status === 429) return "Muitas tentativas. Aguarde um minuto e tente novamente.";
  if (error.status === 401) return "Sua sessão expirou. Entre novamente com e-mail e senha.";
  if (error.status === 403)
    return "O aplicativo recusou esta operação. Entre novamente; se persistir, contate a administração.";
  return "Não foi possível concluir a verificação. Tente novamente; se persistir, contate a administração.";
}

export const TWO_FACTOR_CONNECTION_ERROR =
  "Não foi possível conectar ao aplicativo. Confira a conexão e tente novamente.";
