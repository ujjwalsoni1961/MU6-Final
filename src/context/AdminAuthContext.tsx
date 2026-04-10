import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ── Admin credentials (hardcoded for now) ──
const ADMIN_CREDENTIALS = [
    { username: 'admin', password: 'admin123' },
];

const ADMIN_SESSION_KEY = '@mu6_admin_session';

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

export function AdminAuthProvider({ children }: { children: React.ReactNode }) {
    const [adminSession, setAdminSession] = useState<AdminSession | null>(null);
    const [isAdminLoading, setIsAdminLoading] = useState(true);

    // Load session on mount
    useEffect(() => {
        (async () => {
            try {
                const stored = await AsyncStorage.getItem(ADMIN_SESSION_KEY);
                if (stored) {
                    setAdminSession(JSON.parse(stored));
                }
            } catch {
                // ignore
            } finally {
                setIsAdminLoading(false);
            }
        })();
    }, []);

    const adminLogin = useCallback(async (username: string, password: string) => {
        const match = ADMIN_CREDENTIALS.find(
            (c) => c.username === username && c.password === password,
        );
        if (!match) {
            return { success: false, error: 'Invalid username or password' };
        }
        const session: AdminSession = {
            username: match.username,
            loggedInAt: new Date().toISOString(),
        };
        await AsyncStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(session));
        setAdminSession(session);
        return { success: true };
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
