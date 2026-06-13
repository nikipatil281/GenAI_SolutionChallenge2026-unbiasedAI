import { readJsonValue, removeValue, writeJsonValue } from './persistence';

export type AuthMode = 'login' | 'signup';
export type AuthProvider = 'password' | 'google';

export interface AuthSession {
  email: string;
  provider: AuthProvider;
  createdAt: string;
}

export const AUTH_SESSION_KEY = 'biasscope.auth.session';

export async function readAuthSession(): Promise<AuthSession | null> {
  const parsedSession = await readJsonValue<Partial<AuthSession>>(AUTH_SESSION_KEY);
  if (
    !parsedSession ||
    typeof parsedSession.email !== 'string' ||
    typeof parsedSession.provider !== 'string' ||
    typeof parsedSession.createdAt !== 'string'
  ) {
    return null;
  }

  return {
    email: parsedSession.email,
    provider: parsedSession.provider,
    createdAt: parsedSession.createdAt,
  };
}

export async function writeAuthSession(session: AuthSession) {
  await writeJsonValue(AUTH_SESSION_KEY, session);
}

export async function clearAuthSession() {
  await removeValue(AUTH_SESSION_KEY);
}

export function createPasswordSession(email: string): AuthSession {
  return {
    email,
    provider: 'password',
    createdAt: new Date().toISOString(),
  };
}
