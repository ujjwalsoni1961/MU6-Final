/**
 * PDF #13 — Account Suspended screen.
 *
 * Shown when the admin has marked `profiles.is_blocked = true`.
 * The user is blocked from every authenticated route by the root
 * redirect in `app/index.tsx` and by each protected layout's guard.
 *
 * We intentionally keep this screen dependency-light:
 *  - no DB/blockchain access
 *  - only a sign-out action so the user can disconnect their wallet
 *  - a support contact line so they can appeal the suspension
 */

import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { Shield, LogOut, Mail } from 'lucide-react-native';
import { useAuth } from '../src/context/AuthContext';
import { useTheme } from '../src/context/ThemeContext';
import AnimatedPressable from '../src/components/shared/AnimatedPressable';

const SUPPORT_EMAIL = 'support@mu6.app';

export default function SuspendedScreen() {
    const { signOut, walletAddress } = useAuth();
    const { colors, isDark } = useTheme();

    return (
        <View
            style={[
                styles.root,
                { backgroundColor: isDark ? '#030711' : '#f8fafc' },
            ]}
        >
            <View
                style={[
                    styles.card,
                    {
                        backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#ffffff',
                        borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.08)',
                    },
                ]}
            >
                <View
                    style={[
                        styles.iconWrap,
                        { backgroundColor: 'rgba(239, 68, 68, 0.12)' },
                    ]}
                >
                    <Shield size={32} color="#ef4444" strokeWidth={2} />
                </View>

                <Text style={[styles.title, { color: colors.text.primary }]}>
                    Account Suspended
                </Text>

                <Text style={[styles.body, { color: colors.text.secondary }]}>
                    Your MU6 account has been suspended by an administrator. You will not
                    be able to stream music, purchase NFTs, or list items on the
                    marketplace while this suspension is active.
                </Text>

                <Text style={[styles.body, { color: colors.text.secondary, marginTop: 12 }]}>
                    If you believe this is a mistake, please contact our support team
                    with your wallet address and we will review your account.
                </Text>

                {walletAddress ? (
                    <View
                        style={[
                            styles.walletPill,
                            { borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(15,23,42,0.1)' },
                        ]}
                    >
                        <Text
                            style={{
                                color: colors.text.muted,
                                fontSize: 11,
                                fontFamily: Platform.OS === 'web' ? 'monospace' : undefined,
                            }}
                        >
                            {walletAddress}
                        </Text>
                    </View>
                ) : null}

                <View style={styles.actions}>
                    <AnimatedPressable
                        preset="button"
                        style={[
                            styles.btn,
                            {
                                backgroundColor: 'rgba(56, 180, 186, 0.12)',
                                borderColor: 'rgba(56, 180, 186, 0.35)',
                            },
                        ]}
                        onPress={() => {
                            const subject = encodeURIComponent('MU6 Account Suspension Appeal');
                            const body = encodeURIComponent(
                                `Wallet: ${walletAddress || '(not connected)'}\n\nReason for appeal:\n`,
                            );
                            const url = `mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`;
                            if (Platform.OS === 'web' && typeof window !== 'undefined') {
                                window.location.href = url;
                            }
                        }}
                    >
                        <Mail size={16} color={colors.accent.cyan} />
                        <Text style={[styles.btnLabel, { color: colors.accent.cyan }]}>
                            Contact Support
                        </Text>
                    </AnimatedPressable>

                    <AnimatedPressable
                        preset="button"
                        style={[
                            styles.btn,
                            {
                                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                                borderColor: 'rgba(239, 68, 68, 0.35)',
                            },
                        ]}
                        onPress={async () => {
                            await signOut();
                        }}
                    >
                        <LogOut size={16} color="#ef4444" />
                        <Text style={[styles.btnLabel, { color: '#ef4444' }]}>
                            Sign Out
                        </Text>
                    </AnimatedPressable>
                </View>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    root: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
    },
    card: {
        width: '100%',
        maxWidth: 440,
        borderRadius: 20,
        borderWidth: 1,
        padding: 28,
        alignItems: 'center',
    },
    iconWrap: {
        width: 64,
        height: 64,
        borderRadius: 32,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 16,
    },
    title: {
        fontSize: 22,
        fontWeight: '700',
        marginBottom: 12,
        textAlign: 'center',
    },
    body: {
        fontSize: 14,
        lineHeight: 21,
        textAlign: 'center',
    },
    walletPill: {
        marginTop: 16,
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 999,
        borderWidth: 1,
    },
    actions: {
        width: '100%',
        marginTop: 24,
        gap: 10,
    },
    btn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingVertical: 12,
        borderRadius: 12,
        borderWidth: 1,
    },
    btnLabel: {
        fontSize: 14,
        fontWeight: '600',
    },
});
