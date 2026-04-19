import React, { useState } from 'react';
import {
    View, Text, ScrollView, Platform, Alert, StyleSheet, Switch,
    Modal, Linking,
} from 'react-native';
import { useResponsive } from '../../src/hooks/useResponsive';
import AnimatedPressable from '../../src/components/shared/AnimatedPressable';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
    ChevronLeft, ChevronRight, X,
    User, Wallet, Bell, Headphones, Palette,
    Shield, Lock, HelpCircle, Bug, FileText, Eye,
    LogOut, Moon, Sun, Brush, Building2
} from 'lucide-react-native';

import { useTheme } from '../../src/context/ThemeContext';
import { useAuth } from '../../src/context/AuthContext';
import { useCurrency } from '../../src/hooks/useCurrency';
import { SelectField } from '../../src/components/form';

const CURRENCY_OPTIONS = [
    { value: 'EUR', label: '€ EUR — Euro' },
    { value: 'USD', label: '$ USD — US Dollar' },
    { value: 'GBP', label: '£ GBP — British Pound' },
];

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
    const { isDesktopLayout } = useResponsive();
    return (
        <View style={[styles.sectionCard, {
            backgroundColor: isDesktopLayout ? (isDark ? colors.bg.card : '#fff') : (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.55)'),
            borderColor: isDesktopLayout ? (isDark ? colors.border.base : '#f1f5f9') : (isDark ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.5)')
        }]}>
            {children}
        </View>
    );
}

function Divider() {
    const { isDark } = useTheme();
    const { isDesktopLayout } = useResponsive();
    return <View style={[styles.divider, { backgroundColor: isDesktopLayout ? (isDark ? 'rgba(255,255,255,0.05)' : '#f8fafc') : 'rgba(0,0,0,0.04)' }]} />;
}

/* ─── Bottom Sheet Modal ─── */
function SettingsModal({ visible, onClose, title, children }: {
    visible: boolean; onClose: () => void; title: string; children: React.ReactNode;
}) {
    const { isDark, colors } = useTheme();
    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
            <AnimatedPressable
                preset="icon"
                onPress={onClose}
                style={styles.modalOverlay}
            >
                <View />
            </AnimatedPressable>
            <View style={[styles.modalContainer, {
                backgroundColor: isDark ? '#0f172a' : '#fff',
                borderColor: isDark ? 'rgba(255,255,255,0.1)' : '#e2e8f0',
            }]}>
                {/* Handle bar */}
                <View style={styles.modalHandle}>
                    <View style={[styles.handleBar, { backgroundColor: isDark ? 'rgba(255,255,255,0.2)' : '#cbd5e1' }]} />
                </View>

                {/* Header */}
                <View style={styles.modalHeader}>
                    <Text style={[styles.modalTitle, { color: colors.text.primary }]}>{title}</Text>
                    <AnimatedPressable preset="icon" onPress={onClose} style={[styles.modalCloseBtn, {
                        backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : '#f1f5f9',
                    }]}>
                        <X size={18} color={colors.text.secondary} />
                    </AnimatedPressable>
                </View>

                {/* Content */}
                <View style={{ paddingHorizontal: 20, paddingBottom: 40 }}>
                    {children}
                </View>
            </View>
        </Modal>
    );
}

/* ─── Toggle Setting Row (for modals) ─── */
function ToggleRow({ label, subtitle, value, onToggle }: {
    label: string; subtitle?: string; value: boolean; onToggle: (v: boolean) => void;
}) {
    const { isDark, colors } = useTheme();
    return (
        <View style={styles.toggleRow}>
            <View style={{ flex: 1 }}>
                <Text style={[styles.toggleLabel, { color: colors.text.primary }]}>{label}</Text>
                {subtitle && <Text style={[styles.toggleSubtitle, { color: colors.text.secondary }]}>{subtitle}</Text>}
            </View>
            <Switch
                value={value}
                onValueChange={onToggle}
                trackColor={{ false: '#767577', true: '#38b4ba' }}
                thumbColor={Platform.OS === 'ios' ? '#fff' : (value ? '#fff' : '#f4f3f4')}
                ios_backgroundColor="#3e3e3e"
            />
        </View>
    );
}

/* ─── Quality Option (for Audio Quality modal) ─── */
function QualityOption({ label, subtitle, selected, onPress }: {
    label: string; subtitle: string; selected: boolean; onPress: () => void;
}) {
    const { isDark, colors } = useTheme();
    return (
        <AnimatedPressable preset="row" onPress={onPress} style={[styles.qualityRow, {
            backgroundColor: selected ? (isDark ? 'rgba(56,180,186,0.1)' : 'rgba(56,180,186,0.06)') : 'transparent',
            borderColor: selected ? '#38b4ba' : (isDark ? 'rgba(255,255,255,0.06)' : '#f1f5f9'),
        }]}>
            <View style={{ flex: 1 }}>
                <Text style={[styles.toggleLabel, { color: selected ? '#38b4ba' : colors.text.primary }]}>{label}</Text>
                <Text style={[styles.toggleSubtitle, { color: colors.text.secondary }]}>{subtitle}</Text>
            </View>
            {selected && <View style={styles.qualityDot} />}
        </AnimatedPressable>
    );
}

export default function SettingsScreen() {
    const router = useRouter();
    const { isDark, colors, toggleTheme } = useTheme();
    const { signOut, role } = useAuth();
    const { displayCurrency, updateCurrency } = useCurrency();
    const { isDesktopLayout } = useResponsive();
    const Container = isDesktopLayout ? View : SafeAreaView;

    // Modal states
    const [notifModal, setNotifModal] = useState(false);
    const [audioModal, setAudioModal] = useState(false);
    const [privacyModal, setPrivacyModal] = useState(false);
    const [securityModal, setSecurityModal] = useState(false);

    // Notification preferences
    const [notifNewReleases, setNotifNewReleases] = useState(true);
    const [notifUpdates, setNotifUpdates] = useState(true);
    const [notifRecommendations, setNotifRecommendations] = useState(false);
    const [notifNFTActivity, setNotifNFTActivity] = useState(true);

    // Audio quality
    const [audioQuality, setAudioQuality] = useState<'low' | 'normal' | 'high' | 'lossless'>('high');

    // Privacy
    const [profilePublic, setProfilePublic] = useState(true);
    const [showListeningActivity, setShowListeningActivity] = useState(true);

    const doLogout = async () => {
        await signOut();
        router.replace('/(auth)/login');
    };

    const handleLogout = () => {
        if (isDesktopLayout) {
            doLogout();
        } else {
            Alert.alert('Log Out', 'Are you sure you want to log out?', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Log Out', style: 'destructive', onPress: doLogout },
            ]);
        }
    };

    const openExternalLink = (url: string) => {
        Linking.openURL(url).catch(() => {
            Alert.alert('Error', 'Could not open link.');
        });
    };

    return (
        <Container style={{ flex: 1, backgroundColor: Platform.OS === 'web' ? (isDark ? colors.bg.base : '#f8fafc') : 'transparent' }}>
            <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={{
                    maxWidth: isDesktopLayout ? 600 : undefined,
                    width: '100%',
                    alignSelf: 'center',
                    paddingHorizontal: isDesktopLayout ? 32 : 16,
                    paddingBottom: 60,
                    paddingTop: Platform.OS === 'web' ? 80 : undefined,
                }}
                showsVerticalScrollIndicator={false}
            >
                {/* Header */}
                <View style={styles.header}>
                    <AnimatedPressable preset="icon" onPress={() => router.back()} style={[
                        styles.backButton,
                        {
                            backgroundColor: isDesktopLayout ? (isDark ? colors.bg.card : '#fff') : (isDark ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.5)'),
                            borderColor: isDesktopLayout ? (isDark ? colors.border.base : '#f1f5f9') : (isDark ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.4)'),
                        }
                    ] as any}>
                        <ChevronLeft size={20} color={colors.text.primary} />
                    </AnimatedPressable>
                    <Text style={[styles.headerTitle, { color: colors.text.primary }]}>Settings</Text>
                </View>

                {/* Account */}
                <SectionHeader title="Account" />
                <SectionCard>
                    <SettingRow
                        icon={<User size={18} color="#38b4ba" />}
                        label="Edit Profile"
                        subtitle="Name, avatar, bio"
                        onPress={() => router.push('/(consumer)/edit-profile')}
                    />
                    <Divider />
                    <SettingRow
                        icon={<Wallet size={18} color="#38b4ba" />}
                        label="Wallet"
                        subtitle="Connected wallets & transactions"
                        onPress={() => router.push('/(consumer)/wallet')}
                    />
                    <Divider />
                    <SettingRow
                        icon={<Building2 size={18} color="#38b4ba" />}
                        label="Bank Details"
                        subtitle="Manage bank account for withdrawals"
                        onPress={() => router.push('/(consumer)/bank-details')}
                    />
                    {/* Become a Creator: desktop-only (hidden on mobile per UX spec) */}
                    {role === 'listener' && isDesktopLayout && (
                        <>
                            <Divider />
                            <SettingRow
                                icon={<Brush size={18} color="#8b5cf6" />}
                                label="Become a Creator"
                                subtitle="Upload music, mint NFTs, earn royalties"
                                onPress={() => router.push('/(auth)/creator-register')}
                            />
                        </>
                    )}
                </SectionCard>

                {/* Preferences */}
                <SectionHeader title="Preferences" />
                <SectionCard>
                    <SettingRow
                        icon={<Bell size={18} color="#38b4ba" />}
                        label="Notifications"
                        subtitle="Alerts, updates, recommendations"
                        onPress={() => setNotifModal(true)}
                    />
                    <Divider />
                    <SettingRow
                        icon={<Headphones size={18} color="#38b4ba" />}
                        label="Audio Quality"
                        subtitle="Streaming & download quality"
                        onPress={() => setAudioModal(true)}
                    />
                    <Divider />
                    <View style={{ paddingVertical: 14, paddingHorizontal: 16, zIndex: 20 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
                            <View style={[styles.settingIcon, { backgroundColor: isDark ? 'rgba(56,180,186,0.15)' : 'rgba(56,180,186,0.1)' }]}>
                                <Wallet size={18} color="#38b4ba" />
                            </View>
                            <View style={styles.settingTextContainer}>
                                <Text style={[styles.settingLabel, { color: colors.text.primary }]}>Display Currency</Text>
                                <Text style={[styles.settingSubtitle, { color: colors.text.secondary }]}>How prices are shown</Text>
                            </View>
                        </View>
                        <SelectField
                            options={CURRENCY_OPTIONS}
                            value={displayCurrency}
                            onChange={(val) => updateCurrency(val as any)}
                            placeholder="Select currency"
                        />
                    </View>
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
                    <SettingRow
                        icon={<Eye size={18} color="#38b4ba" />}
                        label="Privacy"
                        subtitle="Profile visibility, listening activity"
                        onPress={() => setPrivacyModal(true)}
                    />
                    <Divider />
                    <SettingRow
                        icon={<Lock size={18} color="#38b4ba" />}
                        label="Security"
                        subtitle="Two-factor authentication"
                        onPress={() => setSecurityModal(true)}
                    />
                </SectionCard>

                {/* Support */}
                <SectionHeader title="Support" />
                <SectionCard>
                    <SettingRow
                        icon={<HelpCircle size={18} color="#38b4ba" />}
                        label="Help Center"
                        subtitle="FAQs & support articles"
                        onPress={() => openExternalLink('mailto:support@mu6.app?subject=Help Request')}
                    />
                    <Divider />
                    <SettingRow
                        icon={<Bug size={18} color="#38b4ba" />}
                        label="Report a Bug"
                        onPress={() => openExternalLink('mailto:support@mu6.app?subject=Bug Report&body=Please describe the bug you encountered:')}
                    />
                    <Divider />
                    <SettingRow
                        icon={<FileText size={18} color="#38b4ba" />}
                        label="Terms of Service"
                        onPress={() => openExternalLink('https://mu6.app/terms')}
                    />
                    <Divider />
                    <SettingRow
                        icon={<Shield size={18} color="#38b4ba" />}
                        label="Privacy Policy"
                        onPress={() => openExternalLink('https://mu6.app/privacy')}
                    />
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

            {/* ─── Notifications Modal ─── */}
            <SettingsModal visible={notifModal} onClose={() => setNotifModal(false)} title="Notifications">
                <ToggleRow
                    label="New Releases"
                    subtitle="Get notified when artists you follow release new music"
                    value={notifNewReleases}
                    onToggle={setNotifNewReleases}
                />
                <ToggleRow
                    label="App Updates"
                    subtitle="Important updates and announcements"
                    value={notifUpdates}
                    onToggle={setNotifUpdates}
                />
                <ToggleRow
                    label="Recommendations"
                    subtitle="Personalized music recommendations"
                    value={notifRecommendations}
                    onToggle={setNotifRecommendations}
                />
                <ToggleRow
                    label="NFT Activity"
                    subtitle="Price changes, sales, and transfers"
                    value={notifNFTActivity}
                    onToggle={setNotifNFTActivity}
                />
            </SettingsModal>

            {/* ─── Audio Quality Modal ─── */}
            <SettingsModal visible={audioModal} onClose={() => setAudioModal(false)} title="Audio Quality">
                <Text style={{ color: colors.text.secondary, fontSize: 13, marginBottom: 16 }}>
                    Higher quality uses more data. Choose the best option for your connection.
                </Text>
                <QualityOption
                    label="Low"
                    subtitle="64 kbps • Saves data"
                    selected={audioQuality === 'low'}
                    onPress={() => setAudioQuality('low')}
                />
                <QualityOption
                    label="Normal"
                    subtitle="128 kbps • Balanced"
                    selected={audioQuality === 'normal'}
                    onPress={() => setAudioQuality('normal')}
                />
                <QualityOption
                    label="High"
                    subtitle="256 kbps • Recommended"
                    selected={audioQuality === 'high'}
                    onPress={() => setAudioQuality('high')}
                />
                <QualityOption
                    label="Lossless"
                    subtitle="FLAC • Studio quality"
                    selected={audioQuality === 'lossless'}
                    onPress={() => setAudioQuality('lossless')}
                />
            </SettingsModal>

            {/* ─── Privacy Modal ─── */}
            <SettingsModal visible={privacyModal} onClose={() => setPrivacyModal(false)} title="Privacy">
                <ToggleRow
                    label="Public Profile"
                    subtitle="Allow other users to see your profile and collection"
                    value={profilePublic}
                    onToggle={setProfilePublic}
                />
                <ToggleRow
                    label="Listening Activity"
                    subtitle="Show what you're currently listening to"
                    value={showListeningActivity}
                    onToggle={setShowListeningActivity}
                />
            </SettingsModal>

            {/* ─── Security Modal ─── */}
            <SettingsModal visible={securityModal} onClose={() => setSecurityModal(false)} title="Security">
                <View style={[styles.securityInfoCard, {
                    backgroundColor: isDark ? 'rgba(56,180,186,0.08)' : 'rgba(56,180,186,0.05)',
                    borderColor: isDark ? 'rgba(56,180,186,0.2)' : 'rgba(56,180,186,0.15)',
                }]}>
                    <Shield size={24} color="#38b4ba" />
                    <Text style={{ color: colors.text.primary, fontWeight: '700', fontSize: 15, marginTop: 12 }}>
                        Wallet-Based Security
                    </Text>
                    <Text style={{ color: colors.text.secondary, fontSize: 13, marginTop: 8, textAlign: 'center', lineHeight: 20 }}>
                        Your account is secured by your Web3 wallet. There are no passwords to manage — authentication is handled through your connected wallet or email verification.
                    </Text>
                </View>
                <View style={[styles.securityInfoCard, {
                    backgroundColor: isDark ? 'rgba(139,92,246,0.08)' : 'rgba(139,92,246,0.05)',
                    borderColor: isDark ? 'rgba(139,92,246,0.2)' : 'rgba(139,92,246,0.15)',
                    marginTop: 12,
                }]}>
                    <Lock size={24} color="#8b5cf6" />
                    <Text style={{ color: colors.text.primary, fontWeight: '700', fontSize: 15, marginTop: 12 }}>
                        Two-Factor Authentication
                    </Text>
                    <Text style={{ color: colors.text.secondary, fontSize: 13, marginTop: 8, textAlign: 'center', lineHeight: 20 }}>
                        2FA is built into your wallet. When you sign in with email, a one-time verification code provides your second factor.
                    </Text>
                </View>
            </SettingsModal>
        </Container>
    );
}

const styles = StyleSheet.create({
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 16,
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
    // Modal styles
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
    },
    modalContainer: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        borderWidth: 1,
        borderBottomWidth: 0,
        maxHeight: '70%',
    },
    modalHandle: {
        alignItems: 'center',
        paddingVertical: 12,
    },
    handleBar: {
        width: 40,
        height: 4,
        borderRadius: 2,
    },
    modalHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingBottom: 16,
    },
    modalTitle: {
        fontSize: 20,
        fontWeight: '800',
        letterSpacing: -0.5,
    },
    modalCloseBtn: {
        width: 32,
        height: 32,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
    },
    toggleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 14,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.04)',
    },
    toggleLabel: {
        fontWeight: '600',
        fontSize: 14,
    },
    toggleSubtitle: {
        fontSize: 11,
        marginTop: 2,
    },
    qualityRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 14,
        paddingHorizontal: 16,
        borderRadius: 12,
        borderWidth: 1,
        marginBottom: 8,
    },
    qualityDot: {
        width: 10,
        height: 10,
        borderRadius: 5,
        backgroundColor: '#38b4ba',
    },
    securityInfoCard: {
        alignItems: 'center',
        padding: 24,
        borderRadius: 16,
        borderWidth: 1,
    },
});
