import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    ScrollView,
    Platform,
    ActivityIndicator,
    TextInput,
    Alert,
} from 'react-native';
import AnimatedPressable from '../../src/components/shared/AnimatedPressable';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
    ArrowLeft,
    Plus,
    Trash2,
    Check,
    AlertCircle,
    Users,
    Percent,
} from 'lucide-react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useAuth } from '../../src/context/AuthContext';
import { useSongSplitSheet, useUpsertSplitSheet, useCreatorSongs } from '../../src/hooks/useData';
import { lookupProfileByEmail, createSplitInvitation } from '../../src/services/database';
import { useTheme } from '../../src/context/ThemeContext';

const isWeb = Platform.OS === 'web';

/* ─── Types ─── */
interface SplitRow {
    partyName: string;
    partyEmail: string;
    role: string;
    sharePercent: string; // Keep as string for text input
    linkedProfileId?: string;
    linkedWalletAddress?: string;
    emailStatus: 'unchecked' | 'checking' | 'registered' | 'unregistered';
}

const ROLE_OPTIONS = ['Artist', 'Producer', 'Songwriter', 'Publisher', 'Featured', 'Other'];

/* ─── Role Pill ─── */
function RolePicker({ value, onChange, colors, isDark }: {
    value: string; onChange: (v: string) => void; colors: any; isDark: boolean;
}) {
    return (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
            {ROLE_OPTIONS.map((role) => {
                const active = value === role;
                return (
                    <AnimatedPressable
                        key={role}
                        preset="button"
                        hapticType="light"
                        onPress={() => onChange(role)}
                        style={{
                            paddingHorizontal: 12,
                            paddingVertical: 6,
                            borderRadius: 8,
                            backgroundColor: active
                                ? 'rgba(56,180,186,0.15)'
                                : isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                            borderWidth: 1,
                            borderColor: active ? 'rgba(56,180,186,0.3)' : 'transparent',
                        }}
                    >
                        <Text style={{
                            fontSize: 12,
                            fontWeight: active ? '700' : '500',
                            color: active ? '#38b4ba' : colors.text.secondary,
                        }}>
                            {role}
                        </Text>
                    </AnimatedPressable>
                );
            })}
        </View>
    );
}

/* ─── Split Party Card ─── */
function SplitPartyCard({ index, row, total, onChange, onRemove, onEmailBlur, canRemove, colors, isDark }: {
    index: number;
    row: SplitRow;
    total: number;
    onChange: (field: keyof SplitRow, value: string) => void;
    onRemove: () => void;
    onEmailBlur: () => void;
    canRemove: boolean;
    colors: any;
    isDark: boolean;
}) {
    const pct = parseFloat(row.sharePercent) || 0;

    return (
        <View style={{
            padding: isWeb ? 20 : 16,
            borderRadius: 14,
            backgroundColor: isWeb
                ? (isDark ? colors.bg.card : '#fff')
                : (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.4)'),
            borderWidth: 1,
            borderColor: isDark ? 'rgba(255,255,255,0.06)' : (isWeb ? '#f1f5f9' : 'rgba(255,255,255,0.4)'),
            marginBottom: 12,
        }}>
            {/* Header row */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <View style={{
                        width: 28, height: 28, borderRadius: 14,
                        backgroundColor: 'rgba(56,180,186,0.1)',
                        alignItems: 'center', justifyContent: 'center',
                    }}>
                        <Text style={{ fontSize: 13, fontWeight: '700', color: '#38b4ba' }}>
                            {index + 1}
                        </Text>
                    </View>
                    <Text style={{ fontSize: 15, fontWeight: '700', color: colors.text.primary, marginLeft: 10 }}>
                        {row.partyName || 'New Party'}
                    </Text>
                </View>
                {canRemove && (
                    <AnimatedPressable
                        preset="icon"
                        hapticType="light"
                        onPress={onRemove}
                        style={{
                            width: 32, height: 32, borderRadius: 8,
                            backgroundColor: 'rgba(239,68,68,0.1)',
                            alignItems: 'center', justifyContent: 'center',
                        }}
                    >
                        <Trash2 size={14} color="#ef4444" />
                    </AnimatedPressable>
                )}
            </View>

            {/* Name */}
            <Text style={{ fontSize: 11, fontWeight: '600', color: colors.text.secondary, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
                Name
            </Text>
            <TextInput
                value={row.partyName}
                onChangeText={(v) => onChange('partyName', v)}
                placeholder="Full name"
                placeholderTextColor={colors.text.muted}
                style={{
                    fontSize: 14, color: colors.text.primary,
                    paddingHorizontal: 12, paddingVertical: 10,
                    borderRadius: 10,
                    backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
                    borderWidth: 1,
                    borderColor: isDark ? 'rgba(255,255,255,0.08)' : '#e2e8f0',
                    marginBottom: 12,
                }}
            />

            {/* Email */}
            <Text style={{ fontSize: 11, fontWeight: '600', color: colors.text.secondary, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
                Email
            </Text>
            <TextInput
                value={row.partyEmail}
                onChangeText={(v) => onChange('partyEmail', v)}
                onBlur={onEmailBlur}
                placeholder="email@example.com"
                placeholderTextColor={colors.text.muted}
                keyboardType="email-address"
                autoCapitalize="none"
                style={{
                    fontSize: 14, color: colors.text.primary,
                    paddingHorizontal: 12, paddingVertical: 10,
                    borderRadius: 10,
                    backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
                    borderWidth: 1,
                    borderColor: isDark ? 'rgba(255,255,255,0.08)' : '#e2e8f0',
                    marginBottom: row.emailStatus === 'unchecked' || row.emailStatus === 'checking' ? 12 : 4,
                }}
            />
            {/* Email status badge */}
            {row.emailStatus === 'checking' && (
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                    <ActivityIndicator size="small" color="#38b4ba" style={{ marginRight: 6 }} />
                    <Text style={{ fontSize: 11, color: colors.text.muted }}>Checking...</Text>
                </View>
            )}
            {row.emailStatus === 'registered' && (
                <View style={{
                    flexDirection: 'row', alignItems: 'center', marginBottom: 12,
                    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6,
                    backgroundColor: 'rgba(34,197,94,0.1)', alignSelf: 'flex-start',
                }}>
                    <Check size={12} color="#22c55e" />
                    <Text style={{ fontSize: 11, fontWeight: '600', color: '#22c55e', marginLeft: 4 }}>
                        Registered user
                    </Text>
                </View>
            )}
            {row.emailStatus === 'unregistered' && (
                <View style={{
                    flexDirection: 'row', alignItems: 'center', marginBottom: 12,
                    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6,
                    backgroundColor: 'rgba(245,158,11,0.1)', alignSelf: 'flex-start',
                }}>
                    <AlertCircle size={12} color="#f59e0b" />
                    <Text style={{ fontSize: 11, fontWeight: '600', color: '#f59e0b', marginLeft: 4 }}>
                        Not registered — will receive invitation
                    </Text>
                </View>
            )}

            {/* Role */}
            <Text style={{ fontSize: 11, fontWeight: '600', color: colors.text.secondary, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 2 }}>
                Role
            </Text>
            <RolePicker value={row.role} onChange={(v) => onChange('role', v)} colors={colors} isDark={isDark} />

            {/* Share Percent */}
            <Text style={{ fontSize: 11, fontWeight: '600', color: colors.text.secondary, textTransform: 'uppercase', letterSpacing: 1, marginTop: 14, marginBottom: 6 }}>
                Share
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View style={{ width: 100, flexDirection: 'row', alignItems: 'center' }}>
                    <TextInput
                        value={row.sharePercent}
                        onChangeText={(v) => onChange('sharePercent', v)}
                        placeholder="0"
                        placeholderTextColor={colors.text.muted}
                        keyboardType="decimal-pad"
                        style={{
                            width: 80,
                            fontSize: 18, fontWeight: '700', color: colors.text.primary,
                            paddingHorizontal: 12, paddingVertical: 8,
                            borderRadius: 10,
                            backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
                            borderWidth: 1,
                            borderColor: isDark ? 'rgba(255,255,255,0.08)' : '#e2e8f0',
                            textAlign: 'center',
                        }}
                    />
                    <Percent size={14} color={colors.text.muted} style={{ marginLeft: 6 }} />
                </View>

                {/* Progress bar */}
                <View style={{
                    flex: 1, height: 6, borderRadius: 3, marginLeft: 12,
                    backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
                }}>
                    <View style={{
                        width: `${Math.min(pct, 100)}%`,
                        height: '100%', borderRadius: 3,
                        backgroundColor: pct > 0 ? '#38b4ba' : 'transparent',
                    }} />
                </View>
            </View>
        </View>
    );
}

/* ─── Main Screen ─── */
export default function SplitEditorScreen() {
    const router = useRouter();
    const params = useLocalSearchParams<{ songId?: string }>();
    const { profile } = useAuth();
    const { isDark, colors } = useTheme();

    // Song picker state (if no songId provided)
    const { data: mySongs, loading: loadingSongs } = useCreatorSongs();
    const [selectedSongId, setSelectedSongId] = useState<string | undefined>(params.songId);
    const selectedSong = mySongs.find((s) => s.id === selectedSongId);

    // Split sheet data
    const { data: existingSplits, loading: loadingSplits, refresh: refreshSplits } = useSongSplitSheet(selectedSongId);
    const { loading: saving, error: saveError, success: saveSuccess, execute: saveSplits, reset: resetSave } = useUpsertSplitSheet();

    // Editable rows
    const [rows, setRows] = useState<SplitRow[]>([]);
    const [initialized, setInitialized] = useState(false);

    // Initialize rows from existing splits or default to creator
    useEffect(() => {
        if (loadingSplits || initialized) return;

        if (existingSplits && existingSplits.length > 0) {
            setRows(existingSplits.map((s) => ({
                partyName: s.partyName,
                partyEmail: s.partyEmail,
                role: s.role,
                sharePercent: String(s.sharePercent),
                linkedProfileId: s.linkedProfileId || undefined,
                emailStatus: s.linkedProfileId ? 'registered' as const : 'unchecked' as const,
            })));
        } else if (profile && selectedSongId) {
            // Default: creator gets 100%
            setRows([{
                partyName: profile.displayName || '',
                partyEmail: profile.email || '',
                role: 'Artist',
                sharePercent: '100',
                linkedProfileId: profile.id,
                emailStatus: 'registered' as const,
            }]);
        }
        setInitialized(true);
    }, [existingSplits, loadingSplits, profile, selectedSongId, initialized]);

    // Reset initialization when song changes
    useEffect(() => {
        setInitialized(false);
        resetSave();
    }, [selectedSongId]);

    // Computed
    const totalPercent = rows.reduce((sum, r) => sum + (parseFloat(r.sharePercent) || 0), 0);
    const isValid = Math.abs(totalPercent - 100) < 0.01 && rows.length > 0 && rows.every((r) => r.partyName.trim() && r.partyEmail.trim());
    const remaining = 100 - totalPercent;

    // Email lookup handler
    const handleEmailBlur = async (index: number) => {
        const email = rows[index]?.partyEmail?.trim();
        if (!email || !email.includes('@')) return;

        setRows((prev) => prev.map((r, i) => i === index ? { ...r, emailStatus: 'checking' as const } : r));

        const result = await lookupProfileByEmail(email);
        if (!result) {
            setRows((prev) => prev.map((r, i) => i === index ? { ...r, emailStatus: 'unchecked' as const } : r));
            return;
        }

        if (result.exists) {
            setRows((prev) => prev.map((r, i) => i === index ? {
                ...r,
                emailStatus: 'registered' as const,
                linkedProfileId: result.profileId,
                linkedWalletAddress: result.walletAddress,
                partyName: r.partyName || result.displayName || r.partyName,
            } : r));
        } else {
            setRows((prev) => prev.map((r, i) => i === index ? {
                ...r,
                emailStatus: 'unregistered' as const,
                linkedProfileId: undefined,
                linkedWalletAddress: undefined,
            } : r));
        }
    };

    // Handlers
    const updateRow = (index: number, field: keyof SplitRow, value: string) => {
        setRows((prev) => {
            const updated = prev.map((r, i) => i === index ? { ...r, [field]: value } : r);

            // Auto-adjust other percentages when share changes
            if (field === 'sharePercent') {
                const changedPct = parseFloat(value) || 0;
                const remaining = 100 - changedPct;
                const otherRows = updated.filter((_, i) => i !== index);
                const otherTotal = otherRows.reduce((s, r) => s + (parseFloat(r.sharePercent) || 0), 0);

                if (otherRows.length > 0 && remaining >= 0) {
                    if (otherTotal > 0) {
                        return updated.map((r, i) => {
                            if (i === index) return r;
                            const ratio = (parseFloat(r.sharePercent) || 0) / otherTotal;
                            return { ...r, sharePercent: (remaining * ratio).toFixed(2) };
                        });
                    } else {
                        const equalShare = remaining / otherRows.length;
                        return updated.map((r, i) => {
                            if (i === index) return r;
                            return { ...r, sharePercent: equalShare.toFixed(2) };
                        });
                    }
                }
            }

            // Reset email status when email changes
            if (field === 'partyEmail') {
                return updated.map((r, i) => i === index ? { ...r, emailStatus: 'unchecked' as const, linkedProfileId: undefined, linkedWalletAddress: undefined } : r);
            }

            return updated;
        });
        if (saveSuccess) resetSave();
    };

    const addRow = () => {
        setRows((prev) => [...prev, { partyName: '', partyEmail: '', role: 'Other', sharePercent: '', emailStatus: 'unchecked' }]);
    };

    const removeRow = (index: number) => {
        setRows((prev) => prev.filter((_, i) => i !== index));
        if (saveSuccess) resetSave();
    };

    const handleSave = async () => {
        if (!selectedSongId || !isValid || !profile) return;

        const splits = rows.map((r) => ({
            partyEmail: r.partyEmail.trim(),
            partyName: r.partyName.trim(),
            role: r.role,
            sharePercent: parseFloat(r.sharePercent) || 0,
            linkedProfileId: r.linkedProfileId || (r.partyEmail === profile?.email ? profile?.id : undefined),
            linkedWalletAddress: r.linkedWalletAddress,
        }));

        const result = await saveSplits(selectedSongId, splits);
        if (result) {
            // Create invitations for unregistered users
            const unregistered = rows.filter((r) => r.emailStatus === 'unregistered');
            for (const r of unregistered) {
                await createSplitInvitation({
                    songId: selectedSongId,
                    inviterProfileId: profile.id,
                    inviteeEmail: r.partyEmail.trim(),
                    inviteeName: r.partyName.trim(),
                    role: r.role,
                    sharePercent: parseFloat(r.sharePercent) || 0,
                });
            }
            if (unregistered.length > 0) {
                Alert.alert(
                    'Invitations Created',
                    `${unregistered.length} invitation${unregistered.length > 1 ? 's' : ''} created for unregistered collaborators. They'll be auto-linked when they sign up.`,
                );
            }
            refreshSplits();
        }
    };

    const Container = isWeb ? View : SafeAreaView;

    /* ─── Song Picker (if no songId in params) ─── */
    if (!selectedSongId) {
        return (
            <Container style={{ flex: 1, backgroundColor: isWeb ? (isDark ? colors.bg.base : '#f8fafc') : 'transparent' }}>
                <ScrollView
                    style={{ flex: 1 }}
                    contentContainerStyle={{ padding: isWeb ? 32 : 16, paddingBottom: 40 }}
                >
                    {/* Header */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 24 }}>
                        <AnimatedPressable
                            preset="icon"
                            hapticType="light"
                            onPress={() => router.back()}
                            style={{
                                width: 36, height: 36, borderRadius: 10,
                                backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                                alignItems: 'center', justifyContent: 'center', marginRight: 12,
                            }}
                        >
                            <ArrowLeft size={18} color={colors.text.secondary} />
                        </AnimatedPressable>
                        <View>
                            <Text style={{ fontSize: isWeb ? 24 : 20, fontWeight: '800', color: colors.text.primary, letterSpacing: -0.5 }}>
                                Split Sheets
                            </Text>
                            <Text style={{ fontSize: 13, color: colors.text.secondary, marginTop: 2 }}>
                                Select a song to manage splits
                            </Text>
                        </View>
                    </View>

                    {loadingSongs ? (
                        <ActivityIndicator size="large" color="#38b4ba" style={{ marginTop: 40 }} />
                    ) : mySongs.length === 0 ? (
                        <View style={{ padding: 40, alignItems: 'center' }}>
                            <Users size={40} color={colors.text.muted} />
                            <Text style={{ fontSize: 16, fontWeight: '600', color: colors.text.secondary, marginTop: 12 }}>
                                No songs yet
                            </Text>
                            <Text style={{ fontSize: 13, color: colors.text.muted, marginTop: 4, textAlign: 'center' }}>
                                Upload a song first, then manage split sheets here.
                            </Text>
                        </View>
                    ) : (
                        mySongs.map((song) => (
                            <AnimatedPressable
                                key={song.id}
                                preset="row"
                                hapticType="light"
                                onPress={() => setSelectedSongId(song.id)}
                                style={{
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                    padding: isWeb ? 16 : 12,
                                    borderRadius: 12,
                                    backgroundColor: isWeb
                                        ? (isDark ? colors.bg.card : '#fff')
                                        : (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.4)'),
                                    borderWidth: 1,
                                    borderColor: isDark ? 'rgba(255,255,255,0.06)' : (isWeb ? '#f1f5f9' : 'rgba(255,255,255,0.4)'),
                                    marginBottom: 8,
                                }}
                            >
                                <View style={{
                                    width: 44, height: 44, borderRadius: 10,
                                    backgroundColor: 'rgba(56,180,186,0.1)',
                                    alignItems: 'center', justifyContent: 'center',
                                    marginRight: 12,
                                }}>
                                    <Users size={20} color="#38b4ba" />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={{ fontSize: 15, fontWeight: '600', color: colors.text.primary }}>
                                        {song.title}
                                    </Text>
                                    <Text style={{ fontSize: 12, color: colors.text.secondary, marginTop: 2 }}>
                                        {song.genre} · {song.duration}
                                    </Text>
                                </View>
                                <ArrowLeft size={16} color={colors.text.muted} style={{ transform: [{ rotate: '180deg' }] }} />
                            </AnimatedPressable>
                        ))
                    )}
                </ScrollView>
            </Container>
        );
    }

    /* ─── Split Editor ─── */
    return (
        <Container style={{ flex: 1, backgroundColor: isWeb ? (isDark ? colors.bg.base : '#f8fafc') : 'transparent' }}>
            <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={{ padding: isWeb ? 32 : 16, paddingBottom: 60 }}
                showsVerticalScrollIndicator={false}
            >
                {/* Header */}
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                    <AnimatedPressable
                        preset="icon"
                        hapticType="light"
                        onPress={() => {
                            setSelectedSongId(undefined);
                            setRows([]);
                            setInitialized(false);
                        }}
                        style={{
                            width: 36, height: 36, borderRadius: 10,
                            backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                            alignItems: 'center', justifyContent: 'center', marginRight: 12,
                        }}
                    >
                        <ArrowLeft size={18} color={colors.text.secondary} />
                    </AnimatedPressable>
                    <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: isWeb ? 24 : 20, fontWeight: '800', color: colors.text.primary, letterSpacing: -0.5 }}>
                            Split Sheet
                        </Text>
                        <Text style={{ fontSize: 13, color: colors.text.secondary, marginTop: 2 }}>
                            {selectedSong?.title || 'Song'}
                        </Text>
                    </View>
                </View>

                {/* Total indicator */}
                <View style={{
                    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                    marginTop: 20, marginBottom: 16, paddingHorizontal: 4,
                }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        {Math.abs(totalPercent - 100) < 0.01 ? (
                            <View style={{
                                width: 24, height: 24, borderRadius: 12,
                                backgroundColor: 'rgba(34,197,94,0.15)',
                                alignItems: 'center', justifyContent: 'center', marginRight: 8,
                            }}>
                                <Check size={14} color="#22c55e" />
                            </View>
                        ) : (
                            <View style={{
                                width: 24, height: 24, borderRadius: 12,
                                backgroundColor: 'rgba(245,158,11,0.15)',
                                alignItems: 'center', justifyContent: 'center', marginRight: 8,
                            }}>
                                <AlertCircle size={14} color="#f59e0b" />
                            </View>
                        )}
                        <Text style={{
                            fontSize: 15, fontWeight: '700',
                            color: Math.abs(totalPercent - 100) < 0.01 ? '#22c55e' : '#f59e0b',
                        }}>
                            {totalPercent.toFixed(2)}% allocated
                        </Text>
                    </View>

                    {remaining !== 0 && (
                        <Text style={{ fontSize: 13, color: colors.text.secondary }}>
                            {remaining > 0 ? `${remaining.toFixed(2)}% remaining` : `${Math.abs(remaining).toFixed(2)}% over`}
                        </Text>
                    )}
                </View>

                {/* Total progress bar */}
                <View style={{
                    height: 8, borderRadius: 4, marginBottom: 24,
                    backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
                    overflow: 'hidden',
                }}>
                    <View style={{
                        width: `${Math.min(totalPercent, 100)}%`,
                        height: '100%', borderRadius: 4,
                        backgroundColor: Math.abs(totalPercent - 100) < 0.01
                            ? '#22c55e'
                            : totalPercent > 100 ? '#ef4444' : '#f59e0b',
                    }} />
                </View>

                {/* Loading state */}
                {loadingSplits ? (
                    <ActivityIndicator size="large" color="#38b4ba" style={{ marginTop: 40 }} />
                ) : (
                    <>
                        {/* Split party cards */}
                        {rows.map((row, i) => (
                            <SplitPartyCard
                                key={i}
                                index={i}
                                row={row}
                                total={totalPercent}
                                onChange={(field, value) => updateRow(i, field, value)}
                                onRemove={() => removeRow(i)}
                                onEmailBlur={() => handleEmailBlur(i)}
                                canRemove={rows.length > 1}
                                colors={colors}
                                isDark={isDark}
                            />
                        ))}

                        {/* Add party button */}
                        <AnimatedPressable
                            preset="button"
                            hapticType="light"
                            onPress={addRow}
                            style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                justifyContent: 'center',
                                paddingVertical: 14,
                                borderRadius: 12,
                                borderWidth: 1.5,
                                borderStyle: 'dashed',
                                borderColor: isDark ? 'rgba(56,180,186,0.3)' : 'rgba(56,180,186,0.3)',
                                backgroundColor: isDark ? 'rgba(56,180,186,0.04)' : 'rgba(56,180,186,0.02)',
                                marginBottom: 24,
                            }}
                        >
                            <Plus size={16} color="#38b4ba" />
                            <Text style={{ fontSize: 14, fontWeight: '600', color: '#38b4ba', marginLeft: 8 }}>
                                Add Split Party
                            </Text>
                        </AnimatedPressable>

                        {/* Error */}
                        {saveError && (
                            <View style={{
                                flexDirection: 'row', alignItems: 'center',
                                padding: 12, borderRadius: 10, marginBottom: 16,
                                backgroundColor: 'rgba(239,68,68,0.1)',
                                borderWidth: 1, borderColor: 'rgba(239,68,68,0.2)',
                            }}>
                                <AlertCircle size={16} color="#ef4444" />
                                <Text style={{ fontSize: 13, color: '#ef4444', fontWeight: '600', marginLeft: 8, flex: 1 }}>
                                    {saveError}
                                </Text>
                            </View>
                        )}

                        {/* Success */}
                        {saveSuccess && (
                            <View style={{
                                flexDirection: 'row', alignItems: 'center',
                                padding: 12, borderRadius: 10, marginBottom: 16,
                                backgroundColor: 'rgba(34,197,94,0.1)',
                                borderWidth: 1, borderColor: 'rgba(34,197,94,0.2)',
                            }}>
                                <Check size={16} color="#22c55e" />
                                <Text style={{ fontSize: 13, color: '#22c55e', fontWeight: '600', marginLeft: 8 }}>
                                    Split sheet saved successfully
                                </Text>
                            </View>
                        )}

                        {/* Save button */}
                        <AnimatedPressable
                            preset="button"
                            hapticType="medium"
                            onPress={handleSave}
                            disabled={!isValid || saving}
                            style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                justifyContent: 'center',
                                paddingVertical: 16,
                                borderRadius: 14,
                                backgroundColor: isValid && !saving ? '#38b4ba' : (isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'),
                                opacity: isValid && !saving ? 1 : 0.5,
                            }}
                        >
                            {saving ? (
                                <ActivityIndicator size="small" color="#fff" />
                            ) : (
                                <>
                                    <Check size={18} color={isValid ? '#fff' : colors.text.muted} />
                                    <Text style={{
                                        fontSize: 16, fontWeight: '700',
                                        color: isValid ? '#fff' : colors.text.muted,
                                        marginLeft: 8,
                                    }}>
                                        Save Split Sheet
                                    </Text>
                                </>
                            )}
                        </AnimatedPressable>

                        {/* Invariant note */}
                        <Text style={{
                            fontSize: 12, color: colors.text.muted, textAlign: 'center',
                            marginTop: 12, lineHeight: 18,
                        }}>
                            Split percentages must total exactly 100%.{'\n'}
                            Royalties from streams and NFT sales will be distributed accordingly.
                        </Text>
                    </>
                )}
            </ScrollView>
        </Container>
    );
}
