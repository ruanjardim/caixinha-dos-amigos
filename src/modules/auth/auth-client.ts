"use client";

import { createAuthClient } from "better-auth/react";

/** Cliente de autenticação para componentes do navegador (mesma origem). */
export const authClient = createAuthClient();
