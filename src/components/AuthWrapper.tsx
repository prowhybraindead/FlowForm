'use client';

import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { ensureUserProfile, isValidAvatarUrl, upsertUserProfile } from '../lib/profilesApi';
import { useAuthStore } from '../store/useAuthStore';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { LogIn, LogOut, UserRound } from 'lucide-react';
import { toast } from 'sonner';

export const AuthWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading, setUser, setLoading } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileName, setProfileName] = useState('');
  const [profileAvatarUrl, setProfileAvatarUrl] = useState('');
  const [profileError, setProfileError] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);

  useEffect(() => {
    let active = true;

    const isMissingSessionError = (error: unknown) => {
      if (!error || typeof error !== 'object') return false;
      const candidate = error as { name?: string; code?: string; message?: string };
      return (
        candidate.name === 'AuthSessionMissingError'
        || candidate.code === 'session_not_found'
        || candidate.message?.toLowerCase().includes('auth session missing')
      );
    };

    const setSessionUser = async (sessionUser: Awaited<ReturnType<typeof supabase.auth.getUser>>['data']['user']) => {
      if (sessionUser) {
        const fallbackName = sessionUser.user_metadata?.full_name ?? sessionUser.user_metadata?.name ?? sessionUser.email ?? null;
        const fallbackAvatarUrl = sessionUser.user_metadata?.avatar_url ?? null;

        try {
          const profile = await ensureUserProfile({
            userId: sessionUser.id,
            email: sessionUser.email,
            displayName: fallbackName,
            avatarUrl: fallbackAvatarUrl,
          });

          setUser({
            uid: sessionUser.id,
            email: sessionUser.email ?? null,
            displayName: profile.displayName,
            photoURL: profile.avatarUrl ?? null,
          });
          setProfileName(profile.displayName);
          setProfileAvatarUrl(profile.avatarUrl ?? '');
        } catch (error) {
          console.error('Profile load error:', error);
          setUser({
            uid: sessionUser.id,
            email: sessionUser.email ?? null,
            displayName: fallbackName,
            photoURL: fallbackAvatarUrl,
          });
          setProfileName(fallbackName || '');
          setProfileAvatarUrl(fallbackAvatarUrl || '');
        }
      } else {
        setUser(null);
        setProfileName('');
        setProfileAvatarUrl('');
      }
    };

    const initializeAuth = async () => {
      try {
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;

        const sessionUser = sessionData.session?.user ?? null;
        await setSessionUser(sessionUser);
      } catch (error) {
        if (!isMissingSessionError(error)) {
          console.error('Initial auth check failed:', error);
        }
        if (active) {
          setUser(null);
          setProfileName('');
          setProfileAvatarUrl('');
        }
      } finally {
        if (active) setLoading(false);
      }
    };
    void initializeAuth();

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      void (async () => {
        try {
          await setSessionUser(session?.user ?? null);
        } catch (error) {
          console.error('Auth state update failed:', error);
        } finally {
          if (active) setLoading(false);
        }
      })();
    });

    const failSafeTimer = window.setTimeout(() => {
      if (active) {
        setLoading(false);
      }
    }, 8000);

    return () => {
      active = false;
      window.clearTimeout(failSafeTimer);
      listener.subscription.unsubscribe();
    };
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

  const handleSaveProfile = async () => {
    if (!user) return;

    const displayName = profileName.trim();
    const avatarUrl = profileAvatarUrl.trim();

    if (!displayName) {
      setProfileError('Display name is required.');
      return;
    }

    if (avatarUrl.toLowerCase().startsWith('data:')) {
      setProfileError('Avatar must be a URL, not a base64 data string.');
      return;
    }

    if (!isValidAvatarUrl(avatarUrl)) {
      setProfileError('Avatar URL must start with http:// or https://.');
      return;
    }

    setSavingProfile(true);
    setProfileError('');
    try {
      const profile = await upsertUserProfile({
        userId: user.uid,
        displayName,
        avatarUrl: avatarUrl || undefined,
      });
      setUser({
        ...user,
        displayName: profile.displayName,
        photoURL: profile.avatarUrl ?? null,
      });
      setProfileName(profile.displayName);
      setProfileAvatarUrl(profile.avatarUrl ?? '');
      setProfileOpen(false);
      toast.success('Profile updated');
    } catch (error: any) {
      console.error('Profile save error:', error);
      setProfileError(error.message || 'Unable to save profile.');
    } finally {
      setSavingProfile(false);
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
      <header className="sticky top-0 z-50 w-full border-b border-natural-border/80 bg-white/90 backdrop-blur supports-[backdrop-filter]:bg-white/80 h-16 shrink-0">
        <div className="mx-auto flex h-full w-full max-w-[1400px] items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="relative h-10 w-10 rounded-xl bg-gradient-to-br from-natural-primary to-[#181C14] text-white shadow-sm flex items-center justify-center ring-1 ring-black/5">
              <span className="font-bold text-sm tracking-wide">FF</span>
              <span className="absolute -bottom-1 -right-1 h-3 w-3 rounded-full bg-emerald-500 border-2 border-white" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-sm sm:text-base font-semibold tracking-tight text-[#1f211d] leading-none">FlowForm</h1>
                <span className="inline-flex items-center rounded-full border border-natural-border bg-natural-accent px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-natural-muted">
                  Studio
                </span>
              </div>
              <p className="text-[10px] text-natural-muted uppercase tracking-[0.2em] leading-none mt-1 hidden sm:block">Build Forms That Convert</p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-2.5">
          <Dialog open={profileOpen} onOpenChange={setProfileOpen}>
            <DialogTrigger
              render={
                <Button
                  variant="ghost"
                  size="sm"
                  className="rounded-full hover:bg-natural-accent text-natural-muted hover:text-natural-primary max-w-[200px]"
                />
              }
            >
              {user.photoURL ? (
                <img src={user.photoURL} alt="" className="h-6 w-6 rounded-full object-contain bg-white" />
              ) : (
                <UserRound className="h-4 w-4" />
              )}
              <span className="hidden sm:inline-block truncate max-w-[130px]">
                {user.displayName || user.email || 'Profile'}
              </span>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md bg-white border border-natural-border p-6 shadow-xl" showCloseButton={true}>
              <DialogHeader className="mb-2">
                <DialogTitle className="text-xl font-serif text-natural-text">Profile</DialogTitle>
                <DialogDescription className="text-natural-muted">
                  This information can be shown on public forms when enabled in form settings.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-5 py-2">
                <div className="flex items-center gap-4">
                  <div className="h-14 w-14 overflow-hidden rounded-full border border-natural-border bg-natural-bg flex items-center justify-center">
                    {profileAvatarUrl && isValidAvatarUrl(profileAvatarUrl) ? (
                      <img src={profileAvatarUrl} alt="" className="h-full w-full object-contain bg-white" />
                    ) : (
                      <UserRound className="h-6 w-6 text-natural-muted" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-natural-text truncate">{profileName || user.email}</p>
                    <p className="text-xs text-natural-muted truncate">{user.email}</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="profile-display-name" className="text-sm font-medium text-natural-text">Display name</Label>
                  <Input
                    id="profile-display-name"
                    value={profileName}
                    onChange={(event) => setProfileName(event.target.value)}
                    placeholder="Your public name"
                    className="h-11 rounded-xl bg-natural-bg"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="profile-avatar-url" className="text-sm font-medium text-natural-text">Avatar URL</Label>
                  <Input
                    id="profile-avatar-url"
                    value={profileAvatarUrl}
                    onChange={(event) => {
                      const value = event.target.value;
                      setProfileAvatarUrl(value);
                      if (value.trim().toLowerCase().startsWith('data:')) {
                        setProfileError('Avatar must be a URL, not a base64 data string.');
                      } else if (value.trim() && !isValidAvatarUrl(value)) {
                        setProfileError('Avatar URL must start with http:// or https://.');
                      } else {
                        setProfileError('');
                      }
                    }}
                    placeholder="https://example.com/avatar.png"
                    className="h-11 rounded-xl bg-natural-bg"
                  />
                  <p className="text-xs text-natural-muted">Use a direct http(s) image URL. Base64 data URLs are not accepted.</p>
                </div>

                {profileError && (
                  <p className="rounded-xl border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                    {profileError}
                  </p>
                )}
              </div>

              <DialogFooter className="bg-transparent border-t-0 -mx-0 -mb-0 p-0">
                <Button variant="outline" onClick={() => setProfileOpen(false)} disabled={savingProfile}>
                  Cancel
                </Button>
                <Button onClick={handleSaveProfile} disabled={savingProfile} className="btn-natural">
                  {savingProfile ? 'Saving...' : 'Save profile'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <Button variant="ghost" size="sm" onClick={handleLogout} className="rounded-full hover:bg-natural-accent text-natural-muted hover:text-natural-primary">
            <LogOut className="mr-2 h-4 w-4" />
            <span className="hidden sm:inline">Sign Out</span>
          </Button>
          </div>
        </div>
      </header>
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
};
