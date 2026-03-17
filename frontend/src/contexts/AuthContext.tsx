import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import type { SessionState, UserProfile, Role, EffectiveUser } from '../types';
import type { Session } from '@supabase/supabase-js';

interface AuthContextType {
  sessionState: SessionState;
  profileLoading: boolean;
  user: UserProfile | null;
  effectiveUser: EffectiveUser | null;
  login: (email: string, password?: string) => Promise<{ error: Error | null; success: boolean }>;
  logout: () => Promise<void>;
  // Method meant to be called by TenantContext to set the impersonated view
  _setImpersonatedUser: (user: UserProfile | null) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [sessionState, setSessionState] = useState<SessionState>('loading');
  const [profileLoading, setProfileLoading] = useState(false);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [impersonated, setImpersonated] = useState<UserProfile | null>(null);

  useEffect(() => {
    let mounted = true;

    // Use ONLY onAuthStateChange to handle ALL session events.
    // Previously we also called getSession() separately, but React StrictMode
    // double-mounts components, causing two concurrent lock requests on the
    // Supabase auth token. The second request "steals" the lock, aborting the first
    // and leaving sessionState stuck on 'loading'.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!mounted) return;

      if (session) {
        await handleSessionUpdate(session);
      } else {
        setUser(null);
        setSessionState('unauthenticated');
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const handleSessionUpdate = async (session: Session | null) => {
    if (!session) {
      console.log('[Auth] No session, setting unauthenticated');
      setUser(null);
      setSessionState('unauthenticated');
      return;
    }

    console.log('[Auth] Session found for user:', session.user.id);

    // Mark profile as loading so Guards hold the redirect until role is known
    setProfileLoading(true);

    // Fetch the extended profile — set authenticated only after role is confirmed
    try {
      const { data: profile, error } = await Promise.race([
        supabase
          .from('user_profiles')
          .select('id, full_name, avatar_url, system_role')
          .eq('id', session.user.id)
          .single(),
        new Promise<{ data: null; error: Error }>((resolve) =>
          setTimeout(() => resolve({ data: null, error: new Error('Profile fetch timeout') }), 8000)
        ),
      ]);

      if (!error && profile) {
        console.log('[Auth] Profile loaded:', profile.full_name, profile.system_role);
        setUser({
          id: profile.id,
          email: session.user.email || '',
          full_name: profile.full_name,
          avatar_url: profile.avatar_url,
          role: (profile.system_role === 'platform_admin' ? 'system_admin' : profile.system_role) as Role,
        });
      } else {
        console.warn('[Auth] Profile fetch failed, using fallback role:', error?.message);
        setUser({
          id: session.user.id,
          email: session.user.email || '',
          full_name: session.user.user_metadata?.full_name || 'Usuário',
          avatar_url: undefined,
          role: 'agent',
        });
      }
    } catch (err) {
      console.error('[Auth] Unexpected error fetching profile:', err);
      setUser({
        id: session.user.id,
        email: session.user.email || '',
        full_name: session.user.user_metadata?.full_name || 'Usuário',
        avatar_url: undefined,
        role: 'agent',
      });
    } finally {
      setProfileLoading(false);
      setSessionState('authenticated');
      console.log('[Auth] State set to authenticated');
    }
  };

  // Magic Link or Password Login implementation
  const login = async (email: string, password?: string): Promise<{ error: Error | null; success: boolean }> => {
    setSessionState('loading');
    
    if (password) {
      // Real password auth
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (error) {
         setSessionState('unauthenticated');
         return { error, success: false };
      }

      // We successfully logged in. The onAuthStateChange listener will handle setting the profile.
      return { error: null, success: true };

    } else {
      // Magic Link Login
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          // Redirection handled naturally
        }
      });

      if (error) {
         setSessionState('unauthenticated');
         return { error, success: false };
      }

      // For OTP, they are technically unauthenticated until they click the link,
      // but we shouldn't show a spinner indefinitely.
      setSessionState('unauthenticated');
      return { error: null, success: true };
    }
  };

  const logout = async () => {
    setSessionState('loading');
    await supabase.auth.signOut();
    setUser(null);
    setImpersonated(null);
    setSessionState('unauthenticated');
  };

  const effectiveUser: EffectiveUser | null = user 
    ? {
        ...(impersonated || user),
        isImpersonated: !!impersonated,
        trueUserId: user.id
      } 
    : null;

  return (
    <AuthContext.Provider value={{ 
      sessionState,
      profileLoading,
      user, 
      effectiveUser, 
      login, 
      logout,
      _setImpersonatedUser: setImpersonated 
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
