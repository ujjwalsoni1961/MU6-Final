/**
 * AdminAuthContext — Supabase Auth backed (SEC-05)
 *
 * Replaces the previous static admin/admin123 verify_admin_login RPC flow.
 *
 * Now:
 *   * adminLogin(email, password) uses supabase.auth.signInWithPassword().
 *   * Admin status is derived from profiles.role='admin' (via is_admin() RPC
 *     or equivalent profile lookup).
 *   * Session is managed entirely by supabase-js (persisted in AsyncStorage
 *     via the Supabase client's built-in storage adapter) — no custom
 *     @mu6_admin_session key to juggle.
 *   * The exposed context API (adminLogin / adminLogout / isAdminLoggedIn /
 *     isAdminLoading) is preserved so existing admin screens compile without
 *     changes. `username` in AdminSession is now the email.
 *
 * This matches the full-stack design where:
 *   * Edge functions verify the caller's JWT and check is_admin() via
 *     SECURITY DEFINER.
 *   * RLS policies use is_admin() which returns true iff auth.uid() is a
 *     profile with role='admin'.
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

export interface AdminSession {
    username: string; // email, retained field name for backward compatibility
    userId: string;
    loggedInAt: string;
}

interface AdminAuthContextType {
    adminSession: AdminSession | null;
    isAdminLoading: boolean;
    isAdminLoggedIn: boolean;
    adminLogin: (username: string, password: string) => Promise<{ success: boolean; error?: string }>;
    adminLogout: () => Promise<void>;
}

const AdminAuthContext = createContext<AdminAuthContextType | undefined>(undefined);

/**
 * Check whether the signed-in user has profiles.role = 'admin'.
 * We use a direct profiles SELECT rather than a helper RPC because the
 * regular `profiles_select` RLS policy already allows the signed-in user
 * to read their own row (id = auth.uid()).
 */
async function fetchIsAdminForCurrentUser(userId: string): Promise<boolean> {
    const { data, error } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', userId)
        .maybeSingle();
    if (error) {
        console.error('[AdminAuth] role lookup error:', error.message);
        return false;
    }
    return data?.role === 'admin';
}

export function AdminAuthProvider({ children }: { children: React.ReactNode }) {
    const [adminSession, setAdminSession] = useState<AdminSession | null>(null);
    const [isAdminLoading, setIsAdminLoading] = useState(true);

    // On mount: check existing Supabase session and verify admin role.
    // Also subscribe to auth state changes so sign-in / sign-out in any
    // other surface of the app stays consistent.
    useEffect(() => {
        let active = true;

        async function hydrateFromSession() {
            try {
                const { data: { session } } = await supabase.auth.getSession();
                if (!session?.user) {
                    if (active) {
                        setAdminSession(null);
                        setIsAdminLoading(false);
                    }
                    return;
                }
                const isAdmin = await fetchIsAdminForCurrentUser(session.user.id);
                if (!active) return;
                if (isAdmin) {
                    setAdminSession({
                        username: session.user.email ?? '',
                        userId: session.user.id,
                        loggedInAt: new Date(session.user.last_sign_in_at ?? new Date().toISOString()).toISOString(),
                    });
                } else {
                    setAdminSession(null);
                }
            } catch (e) {
                console.error('[AdminAuth] hydrate error:', e);
                if (active) setAdminSession(null);
            } finally {
                if (active) setIsAdminLoading(false);
            }
        }

        hydrateFromSession();

        const { data: subscription } = supabase.auth.onAuthStateChange(async (event, session) => {
            if (!active) return;
            if (event === 'SIGNED_OUT' || !session?.user) {
                setAdminSession(null);
                return;
            }
            const isAdmin = await fetchIsAdminForCurrentUser(session.user.id);
            if (!active) return;
            if (isAdmin) {
                setAdminSession({
                    username: session.user.email ?? '',
                    userId: session.user.id,
                    loggedInAt: new Date().toISOString(),
                });
            } else {
                setAdminSession(null);
            }
        });

        return () => {
            active = false;
            subscription.subscription.unsubscribe();
        };
    }, []);

    const adminLogin = useCallback(async (username: string, password: string) => {
        try {
            // `username` parameter is kept for API-compat but is now an email.
            const { data, error } = await supabase.auth.signInWithPassword({
                email: username,
                password,
            });

            if (error || !data?.user) {
                console.error('[AdminAuth] sign-in error:', error?.message);
                return { success: false, error: 'Invalid email or password' };
            }

            const isAdmin = await fetchIsAdminForCurrentUser(data.user.id);
            if (!isAdmin) {
                // Not an admin — sign out immediately so we do not leave a
                // regular user session hanging around inside the admin shell.
                await supabase.auth.signOut();
                return { success: false, error: 'Account is not authorised for admin access' };
            }

            setAdminSession({
                username: data.user.email ?? username,
                userId: data.user.id,
                loggedInAt: new Date().toISOString(),
            });
            return { success: true };
        } catch (err: any) {
            console.error('[AdminAuth] login exception:', err);
            return { success: false, error: 'Network error. Please try again.' };
        }
    }, []);

    const adminLogout = useCallback(async () => {
        try {
            await supabase.auth.signOut();
        } catch (e) {
            console.error('[AdminAuth] signOut error:', e);
        }
        setAdminSession(null);
    }, []);

    return (
        <AdminAuthContext.Provider
            value={{
                adminSession,
                isAdminLoading,
                isAdminLoggedIn: !!adminSession,
                adminLogin,
                adminLogout,
            }}
        >
            {children}
        </AdminAuthContext.Provider>
    );
}

export function useAdminAuth() {
    const ctx = useContext(AdminAuthContext);
    if (!ctx) throw new Error('useAdminAuth must be used within AdminAuthProvider');
    return ctx;
}
