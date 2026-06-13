import React, { FormEvent, useState } from 'react';
import { ArrowRight, Globe, LockKeyhole, Mail, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import type { AuthMode } from '../lib/auth';

interface AuthPageProps {
  onAuthenticate: (email: string, password: string, mode: AuthMode) => void;
}

const AUTH_COPY: Record<AuthMode, { title: string; subtitle: string; cta: string }> = {
  login: {
    title: 'Welcome Back',
    subtitle: 'Access your audit workspace and continue where your review left off.',
    cta: 'Sign In',
  },
  signup: {
    title: 'Create Your Workspace',
    subtitle: 'Set up your BiasScope account now and swap in real auth providers later.',
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
      toast.error('Use an email-style value so the future auth flow stays compatible.');
      return;
    }

    onAuthenticate(normalizedEmail, trimmedPassword, mode);
  }

  function handleGooglePlaceholder() {
    toast.message('Google auth is not wired yet. Use any email and password for now.');
  }

  return (
    <div className="min-h-screen overflow-hidden bg-[#141414] text-[#E4E3E0]">
      <div className="relative mx-auto grid min-h-screen max-w-7xl gap-10 px-6 py-8 lg:grid-cols-[1.1fr_0.9fr] lg:px-10">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(242,125,38,0.18),_transparent_28%),radial-gradient(circle_at_bottom_right,_rgba(59,130,246,0.15),_transparent_24%)]" />

        <section className="relative flex flex-col justify-between gap-10 py-6">
          <div className="space-y-10">
            <div className="inline-flex w-fit items-center gap-3 border border-white/10 bg-white/5 px-4 py-3 backdrop-blur-sm">
              <div className="flex h-11 w-11 items-center justify-center border border-[#F27D26]/30 bg-[#F27D26]/10">
                <ShieldCheck className="h-6 w-6 text-[#F27D26]" />
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-[0.35em] text-[#F27D26]">BiasScope Access</p>
                <p className="text-sm text-white">Provider-ready authentication gateway</p>
              </div>
            </div>

            <div className="max-w-2xl space-y-6">
              <h1 className="text-5xl font-black uppercase leading-none tracking-[-0.06em] text-white md:text-7xl">
                Audit AI systems behind a proper sign-in wall.
              </h1>
              <p className="max-w-xl text-base leading-7 text-[#E4E3E0]/65 md:text-lg">
                Start with lightweight email and password entry now, then layer in Google OAuth and production-grade identity later without redesigning the front door.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="border border-white/10 bg-white/5 p-4">
                <p className="text-[10px] uppercase tracking-[0.25em] text-[#F27D26]">Now</p>
                <p className="mt-3 text-lg font-semibold text-white">Mock email auth</p>
                <p className="mt-2 text-sm leading-6 text-[#E4E3E0]/55">
                  Accepts any email-style credential so we can unblock the flow immediately.
                </p>
              </div>
              <div className="border border-white/10 bg-white/5 p-4">
                <p className="text-[10px] uppercase tracking-[0.25em] text-[#F27D26]">Next</p>
                <p className="mt-3 text-lg font-semibold text-white">Google sign-in</p>
                <p className="mt-2 text-sm leading-6 text-[#E4E3E0]/55">
                  Dedicated provider slot is already reserved for OAuth without reworking the UI.
                </p>
              </div>
              <div className="border border-white/10 bg-white/5 p-4">
                <p className="text-[10px] uppercase tracking-[0.25em] text-[#F27D26]">Later</p>
                <p className="mt-3 text-lg font-semibold text-white">Real sessions</p>
                <p className="mt-2 text-sm leading-6 text-[#E4E3E0]/55">
                  Local session storage can be replaced with backend tokens or Firebase/Auth0.
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-3 text-[10px] uppercase tracking-[0.3em] text-[#E4E3E0]/35">
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
                  <p className="text-[10px] uppercase tracking-[0.3em] text-[#141414]/45">Authentication</p>
                  <CardTitle className="mt-2 uppercase tracking-tight">{copy.title}</CardTitle>
                  <CardDescription className="mt-2 max-w-md text-[#141414]/60">
                    {copy.subtitle}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>

            <CardContent className="space-y-8 pt-6">
              <div className="space-y-3">
                <Label className="text-[#141414]/70">Preferred Provider</Label>
                <div>
                  <Button
                    type="button"
                    variant="secondary"
                    size="lg"
                    onClick={handleGooglePlaceholder}
                    className="h-auto w-full justify-between border-[#141414] bg-white px-4 py-4 text-left shadow-[3px_3px_0px_#141414]"
                  >
                    <span className="flex items-center gap-3">
                      <Globe className="h-4 w-4" />
                      <span className="space-y-1">
                        <span className="block text-[10px] uppercase tracking-[0.25em] text-[#141414]/45">Future</span>
                        <span className="block text-sm font-semibold normal-case tracking-normal">Continue with Google</span>
                      </span>
                    </span>
                    <span className="text-[10px] uppercase tracking-[0.2em] text-[#F27D26]">Soon</span>
                  </Button>
                </div>
              </div>

              <Tabs value={mode} onValueChange={(value) => setMode(value as AuthMode)} className="gap-5">
                <TabsList className="w-full bg-white">
                  <TabsTrigger value="login">Login</TabsTrigger>
                  <TabsTrigger value="signup">Sign Up</TabsTrigger>
                </TabsList>

                <TabsContent value="login">
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

                <TabsContent value="signup">
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
            placeholder="Any password works for this prototype"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          />
        </div>
      </div>

      <Button type="submit" size="lg" className="w-full">
        {cta}
        <ArrowRight className="ml-2 h-4 w-4" />
      </Button>
    </form>
  );
}
