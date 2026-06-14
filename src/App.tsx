/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { MainWorkspace } from './components/MainWorkspace';
import { LandingPage } from './components/LandingPage';
import { ModelAuditPage } from './components/ModelAuditPage';
import { AuthPage } from './components/AuthPage';
import { AuditProvider } from './context/AuditContext';
import { Toaster, toast } from 'sonner';
import { clearAuthSession, readAuthSession, signInWithGoogle, signInWithYahoo, signInWithEmail, signUpWithEmail, type AuthMode, type AuthSession, type AuthProvider as AuthProviderType } from './lib/auth';

export default function App() {
  const [session, setSession] = useState<AuthSession | null | undefined>(undefined);
  const [flow, setFlow] = useState<'landing' | 'tabular' | 'model'>('landing');
  const sessionReady = session !== undefined;

  useEffect(() => {
    let cancelled = false;

    const loadSession = async () => {
      const nextSession = await readAuthSession();
      if (!cancelled) {
        setSession(nextSession);
      }
    };

    void loadSession();

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleAuthenticate(email: string, pass: string, mode: AuthMode, provider: AuthProviderType = 'password') {
    try {
      let nextSession;
      if (provider === 'google') {
        nextSession = await signInWithGoogle();
      } else if (provider === 'yahoo') {
        nextSession = await signInWithYahoo();
      } else {
        if (mode === 'login') {
          nextSession = await signInWithEmail(email, pass);
        } else {
          nextSession = await signUpWithEmail(email, pass);
        }
      }
      setSession(nextSession);
      setFlow('landing');
      toast.success('Successfully authenticated!');
    } catch (error: any) {
      toast.error(`Authentication failed: ${error.message}`);
    }
  }

  function handleSignOut() {
    void clearAuthSession();
    setSession(null);
    setFlow('landing');
    toast.message('Signed out of BiasScope.');
  }

  return (
    <AuditProvider userEmail={session?.email ?? null}>
      {sessionReady && !session && <AuthPage onAuthenticate={handleAuthenticate} />}

      {sessionReady && session && flow === 'landing' && (
        <LandingPage
          userEmail={session.email}
          onSelectFlow={setFlow}
          onSignOut={handleSignOut}
        />
      )}
      
      {sessionReady && session && flow === 'model' && <ModelAuditPage onBack={() => setFlow('landing')} userEmail={session.email} />}

      {sessionReady && session && flow === 'tabular' && (
        <div className="flex h-screen bg-[#E4E3E0] text-[#141414] font-sans">
          <Sidebar 
            className="w-56 border-r border-[#141414] bg-[#141414] shrink-0" 
            onBackToHome={() => setFlow('landing')} 
          />
          <MainWorkspace className="flex-1 overflow-hidden" />
        </div>
      )}
      
      <Toaster />
    </AuditProvider>
  )
}
