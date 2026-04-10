import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';

const ADMIN_SESSION_KEY = '@mu6_admin_session';
const SESSION_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

export interface AdminSession {
    username: string;
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

function isSessionExpired(session: AdminSession): boolean {
    const loginTime = new Date(session.loggedInAt).getTime();
    return Date.now() - loginTime > SESSION_EXPIRY_MS;
}

export function AdminAuthProvider({ children }: { children: React.ReactNode }) {
    const [adminSession, setAdminSession] = useState<AdminSession | null>(null);
    const [isAdminLoading, setIsAdminLoading] = useState(true);

    // Load session on mount, check expiry
    useEffect(() => {
        (async () => {
            try {
                const stored = await AsyncStorage.getItem(ADMIN_SESSION_KEY);
                if (stored) {
                    const session: AdminSession = JSON.parse(stored);
                    if (isSessionExpired(session)) {
                        await AsyncStorage.removeItem(ADMIN_SESSION_KEY);
                    } else {
                        setAdminSession(session);
                    }
                }
            } catch {
                // ignore
            } finally {
                setIsAdminLoading(false);
            }
        })();
    }, []);

    const adminLogin = useCallback(async (username: string, password: string) => {
        try {
            const { data, error } = await supabase.rpc('verify_admin_login', {
                p_username: username,
                p_password: password,
            });

            if (error) {
                console.error('[AdminAuth] RPC error:', error.message);
                return { success: false, error: 'Login failed. Please try again.' };
            }

            if (!data) {
                return { success: false, error: 'Invalid username or password' };
            }

            const session: AdminSession = {
                username,
                loggedInAt: new Date().toISOString(),
            };
            await AsyncStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(session));
            setAdminSession(session);
            return { success: true };
        } catch (err: any) {
            console.error('[AdminAuth] Login exception:', err);
            return { success: false, error: 'Network error. Please try again.' };
        }
    }, []);

    const adminLogout = useCallback(async () => {
        await AsyncStorage.removeItem(ADMIN_SESSION_KEY);
        setAdminSession(null);
    }, []);

    return (
        <AdminAuthContext.Provider
            value={{
                adminSession,
                isAdminLoading,
                isAdminLoggedIn: !!adminSession && !isSessionExpired(adminSession),
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
