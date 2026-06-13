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
import { clearAuthSession, createPasswordSession, readAuthSession, writeAuthSession, type AuthMode, type AuthSession } from './lib/auth';

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

  function handleAuthenticate(email: string, _password: string, mode: AuthMode) {
    const nextSession = createPasswordSession(email);
    void writeAuthSession(nextSession);
    setSession(nextSession);
    setFlow('landing');
    toast.success(mode === 'signup' ? 'Workspace created.' : 'Signed in successfully.');
  }

  function handleSignOut() {
    void clearAuthSession();
    setSession(null);
    setFlow('landing');
    toast.message('Signed out of the local prototype session.');
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
