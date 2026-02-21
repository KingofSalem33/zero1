/**
 * Authentication Context
 * Manages user authentication state and session across the app
 */

import React, { createContext, useContext, useEffect, useState } from "react";
import type { User, Session, SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signIn: (
    email: string,
    password: string,
  ) => Promise<{
    error: Error | null;
  }>;
  signUp: (
    email: string,
    password: string,
  ) => Promise<{
    error: Error | null;
  }>;
  signOut: () => Promise<void>;
  getAccessToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: React.ReactNode;
  client?: SupabaseClient;
}

export function AuthProvider({ children, client }: AuthProviderProps) {
  const authClient = client ?? supabase;
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Get initial session
    authClient.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = authClient.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [authClient]);

  const signIn = async (email: string, password: string) => {
    const { error } = await authClient.auth.signInWithPassword({
      email,
      password,
    });
    return { error };
  };

  const signUp = async (email: string, password: string) => {
    const { error } = await authClient.auth.signUp({
      email,
      password,
    });
    return { error };
  };

  const signOut = async () => {
    await authClient.auth.signOut();
  };

  const getAccessToken = async (): Promise<string | null> => {
    const {
      data: { session },
    } = await authClient.auth.getSession();
    return session?.access_token ?? null;
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        loading,
        signIn,
        signUp,
        signOut,
        getAccessToken,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
