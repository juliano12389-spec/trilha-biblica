import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { fetchProfile, type Profile } from '../../data/profile';
import { supabase } from '../../lib/supabase';
import { errorMessage } from '../../lib/errors';

type AuthState =
  | { status: 'loading' }
  | { status: 'signed-out' }
  /** Signed in, but the user has no organization yet. */
  | { status: 'needs-organization'; session: Session }
  | { status: 'ready'; session: Session; profile: Profile }
  | { status: 'error'; message: string };

interface AuthContextValue {
  state: AuthState;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' });

  const resolveSession = useCallback(async (session: Session | null) => {
    if (!session) {
      setState({ status: 'signed-out' });
      return;
    }
    try {
      const profile = await fetchProfile(session.user.id);
      setState(profile ? { status: 'ready', session, profile } : { status: 'needs-organization', session });
    } catch (error) {
      setState({
        status: 'error',
        message: errorMessage(error, 'Não foi possível carregar o seu perfil.'),
      });
    }
  }, []);

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (active) void resolveSession(data.session);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) void resolveSession(session);
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, [resolveSession]);

  const refreshProfile = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    await resolveSession(data.session);
  }, [resolveSession]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const value = useMemo(() => ({ state, refreshProfile, signOut }), [state, refreshProfile, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth precisa estar dentro de AuthProvider');
  }
  return context;
}

/** Maps Supabase Auth error messages to text the user can act on. */
export function friendlyAuthError(message: string): string {
  const normalized = message.toLowerCase();
  if (normalized.includes('invalid login credentials')) {
    return 'E-mail ou senha inválidos.';
  }
  if (normalized.includes('email not confirmed')) {
    return 'Confirme o seu e-mail antes de entrar. Verifique a caixa de entrada.';
  }
  if (normalized.includes('already registered') || normalized.includes('already been registered')) {
    return 'Já existe uma conta com este e-mail. Tente entrar.';
  }
  if (normalized.includes('password should be at least')) {
    return 'A senha precisa ter pelo menos 6 caracteres.';
  }
  if (normalized.includes('network') || normalized.includes('fetch')) {
    return 'Sem conexão com o servidor. Verifique a internet e tente de novo.';
  }
  return message;
}
