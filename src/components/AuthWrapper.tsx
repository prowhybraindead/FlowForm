'use client';

import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/useAuthStore';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { LogIn, LogOut } from 'lucide-react';

export const AuthWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading, setUser, setLoading } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);

  useEffect(() => {
    const setSessionUser = (sessionUser: Awaited<ReturnType<typeof supabase.auth.getUser>>['data']['user']) => {
      if (sessionUser) {
        setUser({
          uid: sessionUser.id,
          email: sessionUser.email ?? null,
          displayName: sessionUser.user_metadata?.full_name ?? sessionUser.user_metadata?.name ?? null,
          photoURL: sessionUser.user_metadata?.avatar_url ?? null,
        });
      } else {
        setUser(null);
      }
    };

    supabase.auth.getUser().then(({ data }) => {
      setSessionUser(data.user);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSessionUser(session?.user ?? null);
      setLoading(false);
    });

    return () => listener.subscription.unsubscribe();
  }, [setUser, setLoading]);

  const handleLogin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoginError('');
    setLoggingIn(true);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        setLoginError(error.message);
      }
    } catch (error) {
      console.error('Login error:', error);
      setLoginError('Unable to sign in. Please try again.');
    } finally {
      setLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-muted/30 px-6">
        <form onSubmit={handleLogin} className="w-full max-w-sm space-y-6 rounded-[32px] border border-natural-border bg-white p-8 shadow-sm">
          <div className="space-y-2 text-center">
            <h1 className="text-4xl font-bold tracking-tight">FlowForm</h1>
            <p className="text-sm text-muted-foreground">Sign in with your workspace account.</p>
          </div>

          <div className="space-y-3">
            <Input
              type="email"
              autoComplete="email"
              placeholder="Email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              className="h-12 rounded-2xl bg-natural-bg px-4"
            />
            <Input
              type="password"
              autoComplete="current-password"
              placeholder="Password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              className="h-12 rounded-2xl bg-natural-bg px-4"
            />
          </div>

          {loginError && (
            <p className="rounded-2xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              {loginError}
            </p>
          )}

          <Button type="submit" size="lg" disabled={loggingIn} className="btn-natural h-12 w-full">
            <LogIn className="mr-2 h-4 w-4" />
            {loggingIn ? 'Signing in...' : 'Sign in'}
          </Button>
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-natural-bg text-natural-text font-sans">
      <header className="sticky top-0 z-50 w-full border-b border-natural-border bg-white flex items-center justify-between px-6 h-16 shrink-0">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-natural-primary rounded-xl flex items-center justify-center text-white">
            <span className="font-bold">F</span>
          </div>
          <div>
            <h1 className="text-sm font-semibold text-[#2D2D2A]">FormFlow</h1>
            <p className="text-[10px] text-natural-muted uppercase tracking-wider">Form Builder Pro</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs font-medium text-natural-muted hidden sm:inline-block">
            {user.email}
          </span>
          <Button variant="ghost" size="sm" onClick={handleLogout} className="rounded-full hover:bg-natural-accent text-natural-muted hover:text-natural-primary">
            <LogOut className="mr-2 h-4 w-4" />
            Sign Out
          </Button>
        </div>
      </header>
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
};
