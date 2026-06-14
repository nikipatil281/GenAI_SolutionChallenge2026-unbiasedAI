import { signInWithPopup, signOut, onAuthStateChanged, User, createUserWithEmailAndPassword, signInWithEmailAndPassword, OAuthProvider } from 'firebase/auth';
import { auth, googleProvider } from './firebase';

export type AuthMode = 'login' | 'signup';
export type AuthProvider = 'password' | 'google' | 'yahoo';

export interface AuthSession {
  email: string;
  provider: AuthProvider;
  createdAt: string;
  uid: string;
}

export function readAuthSession(): Promise<AuthSession | null> {
  return new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(auth, (user: User | null) => {
      unsubscribe();
      if (user && user.email) {
        resolve({
          email: user.email,
          provider: 'google', // Just defaulting to google for legacy sessions, though not strictly accurate it's fine for UI
          createdAt: user.metadata.creationTime || new Date().toISOString(),
          uid: user.uid
        });
      } else {
        resolve(null);
      }
    });
  });
}

export async function signInWithEmail(email: string, pass: string): Promise<AuthSession> {
  const result = await signInWithEmailAndPassword(auth, email, pass);
  if (!result.user.email) throw new Error("No email returned.");
  return {
    email: result.user.email,
    provider: 'password',
    createdAt: result.user.metadata.creationTime || new Date().toISOString(),
    uid: result.user.uid
  };
}

export async function signUpWithEmail(email: string, pass: string): Promise<AuthSession> {
  const result = await createUserWithEmailAndPassword(auth, email, pass);
  if (!result.user.email) throw new Error("No email returned.");
  return {
    email: result.user.email,
    provider: 'password',
    createdAt: result.user.metadata.creationTime || new Date().toISOString(),
    uid: result.user.uid
  };
}

export async function signInWithGoogle(): Promise<AuthSession> {
  const result = await signInWithPopup(auth, googleProvider);
  const user = result.user;
  if (!user.email) throw new Error("No email returned from Google auth.");
  return {
    email: user.email,
    provider: 'google',
    createdAt: user.metadata.creationTime || new Date().toISOString(),
    uid: user.uid
  };
}

export async function signInWithYahoo(): Promise<AuthSession> {
  const yahooProvider = new OAuthProvider('yahoo.com');
  const result = await signInWithPopup(auth, yahooProvider);
  const user = result.user;
  if (!user.email) throw new Error("No email returned from Yahoo auth.");
  return {
    email: user.email,
    provider: 'yahoo',
    createdAt: user.metadata.creationTime || new Date().toISOString(),
    uid: user.uid
  };
}

export async function clearAuthSession() {
  await signOut(auth);
}

export async function getIdToken(): Promise<string | null> {
  const user = auth.currentUser;
  if (!user) return null;
  return await user.getIdToken();
}
