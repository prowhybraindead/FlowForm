import React, { useEffect } from 'react';
import { onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { useAuthStore } from '../store/useAuthStore';
import { Button } from './ui/button';
import { LogIn, LogOut } from 'lucide-react';

export const AuthWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading, setUser, setLoading } = useAuthStore();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser) {
        setUser({
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          displayName: firebaseUser.displayName,
          photoURL: firebaseUser.photoURL,
        });
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [setUser, setLoading]);

  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error('Login error:', error);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
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
      <div className="flex h-screen flex-col items-center justify-center space-y-4 bg-muted/30">
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-bold tracking-tight">FormFlow</h1>
          <p className="text-muted-foreground">Create and share powerful forms effortlessly.</p>
        </div>
        <Button onClick={handleLogin} size="lg" className="rounded-full px-8">
          <LogIn className="mr-2 h-4 w-4" />
          Sign in with Google
        </Button>
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
