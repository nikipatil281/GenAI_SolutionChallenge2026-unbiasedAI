import React, { FormEvent, useState } from 'react';
import { ArrowRight, Globe, LockKeyhole, Mail, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import type { AuthMode, AuthProvider } from '../lib/auth';

interface AuthPageProps {
  onAuthenticate: (email: string, password: string, mode: AuthMode, provider: AuthProvider) => void;
}

const AUTH_COPY: Record<AuthMode, { title: string; subtitle: string; cta: string }> = {
  login: {
    title: 'Welcome Back',
    subtitle: 'Access your audit workspace and continue where your review left off.',
    cta: 'Sign In',
  },
  signup: {
    title: 'Create Your Workspace',
    subtitle: 'Set up your BiasScope account to start auditing AI systems securely.',
    cta: 'Create Account',
  },
};

export function AuthPage({ onAuthenticate }: AuthPageProps) {
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const copy = AUTH_COPY[mode];

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const normalizedEmail = email.trim();
    const trimmedPassword = password.trim();

    if (!normalizedEmail || !trimmedPassword) {
      toast.error('Enter both an email and password to continue.');
      return;
    }

    if (!normalizedEmail.includes('@')) {
      toast.error('Please enter a valid email address.');
      return;
    }

    onAuthenticate(normalizedEmail, trimmedPassword, mode, 'password');
  }

  function handleGoogleLogin() {
    onAuthenticate('', '', mode, 'google');
  }

  function handleYahooLogin() {
    onAuthenticate('', '', mode, 'yahoo');
  }

  return (
    <div className="min-h-screen overflow-hidden bg-[#141414] text-[#E4E3E0]">
      <div className="relative mx-auto grid min-h-screen max-w-7xl gap-10 px-6 py-8 lg:grid-cols-[1.1fr_0.9fr] lg:px-10">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(242,125,38,0.18),_transparent_28%),radial-gradient(circle_at_bottom_right,_rgba(59,130,246,0.15),_transparent_24%)]" />

        <section className="relative flex flex-col justify-center gap-10 py-6">
          <div className="space-y-10">
            <div className="inline-flex w-fit items-center gap-3 border border-white/10 bg-white/5 px-4 py-3 backdrop-blur-sm">
              <div className="flex h-11 w-11 items-center justify-center border border-[#F27D26]/30 bg-[#F27D26]/10">
                <ShieldCheck className="h-6 w-6 text-[#F27D26]" />
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-[0.35em] text-[#F27D26]">BiasScope Access</p>
                <p className="text-sm text-white">Identity Secured Gateway</p>
              </div>
            </div>

            <div className="max-w-2xl space-y-6">
              <h1 className="text-5xl font-black uppercase leading-none tracking-[-0.06em] text-white md:text-7xl">
                Audit AI systems behind a proper sign-in wall.
              </h1>
              <p className="max-w-xl text-base leading-7 text-[#E4E3E0]/65 md:text-lg">
                Your workspace is secured using production-grade identity. Choose to create an account via Email, Google, or Yahoo to securely access your audits.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="border border-[#F27D26]/30 bg-[#F27D26]/10 p-4">
                <p className="text-[10px] uppercase tracking-[0.25em] text-[#F27D26]">Active</p>
                <p className="mt-3 text-lg font-semibold text-white">Multiple Providers</p>
                <p className="mt-2 text-sm leading-6 text-[#E4E3E0]/70">
                  Fully wired to Firebase Authentication for secure identity management via Google, Yahoo, or Email.
                </p>
              </div>
              <div className="border border-white/10 bg-white/5 p-4">
                <p className="text-[10px] uppercase tracking-[0.25em] text-[#F27D26]">Active</p>
                <p className="mt-3 text-lg font-semibold text-white">Real sessions</p>
                <p className="mt-2 text-sm leading-6 text-[#E4E3E0]/55">
                  Persistent token-based sessions ensure you don't lose your work.
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-3 text-[10px] uppercase tracking-[0.3em] text-[#E4E3E0]/35 mt-10">
            <span>Tabular dataset audits</span>
            <span>Model file diagnostics</span>
            <span>Governance reporting</span>
          </div>
        </section>

        <section className="relative flex items-center py-6">
          <Card className="w-full border-[#141414] bg-[#E4E3E0] text-[#141414] shadow-[10px_10px_0px_rgba(242,125,38,0.9)]">
            <CardHeader className="gap-4 border-b border-[#141414] bg-[linear-gradient(135deg,rgba(242,125,38,0.08),rgba(20,20,20,0))]">
              <div>
                <div>
                  <CardTitle className="mt-2 uppercase tracking-tight">{copy.title}</CardTitle>
                  <CardDescription className="mt-2 max-w-md text-[#141414]/60">
                    {copy.subtitle}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>

            <CardContent className="space-y-6 pt-6">
              <Tabs value={mode} onValueChange={(value) => setMode(value as AuthMode)} className="gap-5">
                <TabsList className="w-full bg-white border border-[#141414]">
                  <TabsTrigger value="login">Login</TabsTrigger>
                  <TabsTrigger value="signup">Sign Up</TabsTrigger>
                </TabsList>

                <TabsContent value="login" className="mt-6">
                  <AuthForm
                    mode="login"
                    email={email}
                    password={password}
                    cta={AUTH_COPY.login.cta}
                    onEmailChange={setEmail}
                    onPasswordChange={setPassword}
                    onSubmit={handleSubmit}
                  />
                </TabsContent>

                <TabsContent value="signup" className="mt-6">
                  <AuthForm
                    mode="signup"
                    email={email}
                    password={password}
                    cta={AUTH_COPY.signup.cta}
                    onEmailChange={setEmail}
                    onPasswordChange={setPassword}
                    onSubmit={handleSubmit}
                  />
                </TabsContent>
              </Tabs>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-[#141414]/20" />
                </div>
                <div className="relative flex justify-center text-xs uppercase tracking-widest">
                  <span className="bg-[#E4E3E0] px-2 text-[#141414]/60">Or continue with</span>
                </div>
              </div>

              <div className="space-y-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleGoogleLogin}
                  className="h-auto w-full justify-center border-[#141414] bg-white px-4 py-3 text-center shadow-[2px_2px_0px_#141414] hover:bg-gray-50 transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <svg viewBox="0 0 24 24" className="h-5 w-5" xmlns="http://www.w3.org/2000/svg">
                      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                    </svg>
                    <span className="font-bold text-[#141414]">Google</span>
                  </span>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleYahooLogin}
                  className="h-auto w-full justify-center border-[#141414] bg-white px-4 py-3 text-center shadow-[2px_2px_0px_#141414] hover:bg-gray-50 transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <svg viewBox="0 0 24 24" className="h-5 w-5" xmlns="http://www.w3.org/2000/svg">
                      <path d="M22.77 0H1.23C.55 0 0 .55 0 1.23v21.54C0 23.45.55 24 1.23 24h21.54c.68 0 1.23-.55 1.23-1.23V1.23C24 .55 23.45 0 22.77 0zm-8.8 15.65v5.04c0 .35-.29.64-.64.64h-2.66c-.35 0-.64-.29-.64-.64v-5.04L4.72 4.14c-.16-.3-.04-.66.25-.8l2.91-1.39c.28-.13.62-.02.77.26l3.35 6.42L15.35 2.2c.16-.28.5-.38.78-.24l2.89 1.41c.29.14.41.49.25.79l-5.3 11.49z" fill="#6001D2"/>
                    </svg>
                    <span className="font-bold text-[#141414]">Yahoo</span>
                  </span>
                </Button>
              </div>
              <p className="text-center text-xs text-[#141414]/60">
                By signing in, you agree to the BiasScope terms of service and privacy policy.
              </p>
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  );
}

interface AuthFormProps {
  cta: string;
  email: string;
  mode: AuthMode;
  password: string;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

function AuthForm({
  cta,
  email,
  mode,
  password,
  onEmailChange,
  onPasswordChange,
  onSubmit,
}: AuthFormProps) {
  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div className="grid gap-5">
        <div className="grid gap-2">
          <Label htmlFor={`${mode}-email`}>
            <Mail className="h-3.5 w-3.5" />
            Email Address
          </Label>
          <Input
            id={`${mode}-email`}
            type="email"
            value={email}
            onChange={(event) => onEmailChange(event.target.value)}
            placeholder="name@organization.com"
            autoComplete="email"
            className="border-[#141414] focus-visible:ring-[#F27D26]"
          />
        </div>

        <div className="grid gap-2">
          <Label htmlFor={`${mode}-password`}>
            <LockKeyhole className="h-3.5 w-3.5" />
            Password
          </Label>
          <Input
            id={`${mode}-password`}
            type="password"
            value={password}
            onChange={(event) => onPasswordChange(event.target.value)}
            placeholder="Secure password"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            className="border-[#141414] focus-visible:ring-[#F27D26]"
          />
        </div>
      </div>

      <Button type="submit" className="w-full bg-[#141414] text-white hover:bg-black">
        {cta}
        <ArrowRight className="ml-2 h-4 w-4" />
      </Button>
    </form>
  );
}
