import React, { useState } from 'react';
import { View, Text, ScrollView, Platform, Alert, StyleSheet, Switch } from 'react-native';
import AnimatedPressable from '../../src/components/shared/AnimatedPressable';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
    ChevronLeft, ChevronRight,
    User, Wallet, Bell, Headphones, Palette,
    Shield, Lock, HelpCircle, Bug, FileText, Eye,
    LogOut, Moon, Sun
} from 'lucide-react-native';

const isWeb = Platform.OS === 'web';

import { useTheme } from '../../src/context/ThemeContext';

/* ─── Setting Row ─── */
function SettingRow({ icon, label, subtitle, danger, onPress, isSwitch, switchValue, onSwitchChange }: {
    icon: React.ReactNode; label: string; subtitle?: string; danger?: boolean; onPress?: () => void;
    isSwitch?: boolean; switchValue?: boolean; onSwitchChange?: (val: boolean) => void;
}) {
    const { isDark, colors } = useTheme();
    return (
        <AnimatedPressable preset="row" onPress={onPress} style={styles.settingRow} disabled={isSwitch}>
            <View style={[styles.settingIcon, { backgroundColor: danger ? 'rgba(239,68,68,0.1)' : (isDark ? 'rgba(56,180,186,0.15)' : 'rgba(56,180,186,0.1)') }]}>
                {icon}
            </View>
            <View style={styles.settingTextContainer}>
                <Text style={[styles.settingLabel, { color: danger ? '#ef4444' : colors.text.primary }]}>{label}</Text>
                {subtitle ? <Text style={[styles.settingSubtitle, { color: colors.text.secondary }]}>{subtitle}</Text> : null}
            </View>
            {isSwitch ? (
                <Switch
                    value={switchValue}
                    onValueChange={onSwitchChange}
                    trackColor={{ false: '#767577', true: '#38b4ba' }}
                    thumbColor={Platform.OS === 'ios' ? '#fff' : (switchValue ? '#fff' : '#f4f3f4')}
                    ios_backgroundColor="#3e3e3e"
                />
            ) : (
                !danger ? <ChevronRight size={16} color={colors.text.tertiary} /> : null
            )}
        </AnimatedPressable>
    );
}

/* ─── Section Header ─── */
function SectionHeader({ title }: { title: string }) {
    const { colors } = useTheme();
    return <Text style={[styles.sectionHeader, { color: colors.text.tertiary }]}>{title}</Text>;
}

/* ─── Section Card Wrapper ─── */
function SectionCard({ children }: { children: React.ReactNode }) {
    const { isDark, colors } = useTheme();
    return (
        <View style={[styles.sectionCard, {
            backgroundColor: isWeb ? (isDark ? colors.bg.card : '#fff') : (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.55)'),
            borderColor: isWeb ? (isDark ? colors.border.base : '#f1f5f9') : (isDark ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.5)')
        }]}>
            {children}
        </View>
    );
}

function Divider() {
    const { isDark } = useTheme();
    return <View style={[styles.divider, { backgroundColor: isWeb ? (isDark ? 'rgba(255,255,255,0.05)' : '#f8fafc') : 'rgba(0,0,0,0.04)' }]} />;
}

export default function SettingsScreen() {
    const router = useRouter();
    const { isDark, colors, toggleTheme } = useTheme();
    const Container = isWeb ? View : SafeAreaView;

    const handleLogout = () => {
        if (isWeb) {
            router.replace('/(auth)/login');
        } else {
            Alert.alert('Log Out', 'Are you sure you want to log out?', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Log Out', style: 'destructive', onPress: () => router.replace('/(auth)/login') },
            ]);
        }
    };

    return (
        <Container style={{ flex: 1, backgroundColor: isWeb ? colors.bg.base : 'transparent' }}>
            <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={{
                    maxWidth: isWeb ? 600 : undefined,
                    width: '100%',
                    alignSelf: 'center',
                    paddingHorizontal: isWeb ? 32 : 16,
                    paddingBottom: 60,
                }}
                showsVerticalScrollIndicator={false}
            >
                {/* Header */}
                <View style={styles.header}>
                    <AnimatedPressable preset="icon" onPress={() => router.back()} style={[
                        styles.backButton,
                        {
                            backgroundColor: isWeb ? (isDark ? colors.bg.card : '#fff') : (isDark ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.5)'),
                            borderColor: isWeb ? (isDark ? colors.border.base : '#f1f5f9') : (isDark ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.4)'),
                        }
                    ] as any}>
                        <ChevronLeft size={20} color={colors.text.primary} />
                    </AnimatedPressable>
                    <Text style={[styles.headerTitle, { color: colors.text.primary }]}>Settings</Text>
                </View>

                {/* Account */}
                <SectionHeader title="Account" />
                <SectionCard>
                    <SettingRow icon={<User size={18} color="#38b4ba" />} label="Edit Profile" subtitle="Name, avatar, bio" />
                    <Divider />
                    <SettingRow icon={<Wallet size={18} color="#38b4ba" />} label="Wallet" subtitle="Connected wallets & transactions" />
                </SectionCard>

                {/* Preferences */}
                <SectionHeader title="Preferences" />
                <SectionCard>
                    <SettingRow icon={<Bell size={18} color="#38b4ba" />} label="Notifications" subtitle="Alerts, updates, recommendations" />
                    <Divider />
                    <SettingRow icon={<Headphones size={18} color="#38b4ba" />} label="Audio Quality" subtitle="Streaming & download quality" />
                    <Divider />
                    <SettingRow
                        icon={isDark ? <Moon size={18} color="#38b4ba" /> : <Sun size={18} color="#38b4ba" />}
                        label="Dark Mode"
                        subtitle={isDark ? "Dark mode is on" : "Light mode is on"}
                        isSwitch
                        switchValue={isDark}
                        onSwitchChange={(val) => toggleTheme(val ? 'dark' : 'light')}
                    />
                </SectionCard>

                {/* Privacy & Security */}
                <SectionHeader title="Privacy & Security" />
                <SectionCard>
                    <SettingRow icon={<Eye size={18} color="#38b4ba" />} label="Privacy" subtitle="Profile visibility, listening activity" />
                    <Divider />
                    <SettingRow icon={<Lock size={18} color="#38b4ba" />} label="Security" subtitle="Two-factor authentication" />
                </SectionCard>

                {/* Support */}
                <SectionHeader title="Support" />
                <SectionCard>
                    <SettingRow icon={<HelpCircle size={18} color="#38b4ba" />} label="Help Center" subtitle="FAQs & support articles" />
                    <Divider />
                    <SettingRow icon={<Bug size={18} color="#38b4ba" />} label="Report a Bug" />
                    <Divider />
                    <SettingRow icon={<FileText size={18} color="#38b4ba" />} label="Terms of Service" />
                    <Divider />
                    <SettingRow icon={<Shield size={18} color="#38b4ba" />} label="Privacy Policy" />
                </SectionCard>

                {/* Log Out */}
                <View style={{ marginTop: 32 }}>
                    <SectionCard>
                        <SettingRow icon={<LogOut size={18} color="#ef4444" />} label="Log Out" danger onPress={handleLogout} />
                    </SectionCard>
                </View>

                {/* Version */}
                <Text style={styles.version}>MU6 v1.0.0 • Powered by thirdweb</Text>
            </ScrollView>
        </Container>
    );
}

const styles = StyleSheet.create({
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: isWeb ? 8 : 16,
        marginBottom: 24,
    },
    backButton: {
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
        borderWidth: 1,
    },
    headerTitle: {
        fontSize: 24,
        fontWeight: '800',
        letterSpacing: -0.5,
    },
    sectionHeader: {
        fontSize: 11,
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: 1.5,
        paddingHorizontal: 4,
        marginTop: 24,
        marginBottom: 8,
    },
    sectionCard: {
        borderRadius: 16,
        borderWidth: 1,
        overflow: 'hidden',
    },
    settingRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 14,
        paddingHorizontal: 16,
    },
    settingIcon: {
        width: 36,
        height: 36,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 14,
    },
    settingTextContainer: {
        flex: 1,
    },
    settingLabel: {
        fontWeight: '600',
        fontSize: 14,
    },
    settingSubtitle: {
        fontSize: 11,
        marginTop: 2,
    },
    divider: {
        height: 1,
        marginHorizontal: 16,
    },
    version: {
        color: '#cbd5e1',
        fontSize: 11,
        textAlign: 'center',
        marginTop: 24,
    },
});
