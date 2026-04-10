/**
 * Upload Track — Multi-Step Wizard (Bug #006)
 *
 * 4-step progressive disclosure:
 *   Step 1: Track Basics (title, genre, duration, files)
 *   Step 2: Rights & Ownership (track type, master, composition, samples, releases)
 *   Step 3: Split Sheet (contributor royalties)
 *   Step 4: Review & Submit (consolidated legal, publish/draft)
 */
import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, ScrollView, Platform, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
    Plus, Trash2, Info, Music, Send, Save,
    ChevronRight, ChevronLeft, Check, ExternalLink,
} from 'lucide-react-native';
import { useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import AnimatedPressable from '../../src/components/shared/AnimatedPressable';
import {
    FormField,
    TextFormInput,
    RadioGroup,
    SelectField,
    CheckboxField,
    FilePickerField,
    SectionHeader,
} from '../../src/components/form';
import {
    GENRES,
    TRACK_TYPES,
    OWNERSHIP_OPTIONS,
    COMPOSITION_OPTIONS,
    SPLIT_ROLES,
    LEGAL_CONFIRMATIONS,
    type UploadFormState,
    type SplitEntry,
    type SampleEntry,
    createInitialUploadFormState,
} from '../../src/types/creator';
import { useTheme } from '../../src/context/ThemeContext';
import { useAuth } from '../../src/context/AuthContext';
import { createSong, upsertSplitSheet } from '../../src/services/database';

const isWeb = Platform.OS === 'web';
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const STEP_LABELS = ['Track Basics', 'Rights & Ownership', 'Split Sheet', 'Review & Submit'];

function SectionCard({ children, style }: { children: React.ReactNode; style?: any }) {
    const { isDark } = useTheme();
    return (
        <View style={[{
            backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : '#ffffff',
            borderRadius: 16,
            padding: isWeb ? 32 : 20,
            marginBottom: isWeb ? 32 : 24,
            borderWidth: 1,
            borderColor: isDark ? 'rgba(255,255,255,0.06)' : '#e2e8f0',
            ...(isWeb && !isDark ? {
                shadowColor: '#64748b',
                shadowOffset: { width: 0, height: 6 },
                shadowOpacity: 0.08,
                shadowRadius: 16,
            } : {}),
        }, style]}>
            {children}
        </View>
    );
}

// ── File handling ──

interface PickedFile {
    uri: string;
    name: string;
    mimeType?: string;
    size?: number;
}

async function pickAudioFile(): Promise<PickedFile | null> {
    try {
        const result = await DocumentPicker.getDocumentAsync({ type: ['audio/*'], copyToCacheDirectory: true });
        if (result.canceled || !result.assets?.length) return null;
        const asset = result.assets[0];
        return { uri: asset.uri, name: asset.name, mimeType: asset.mimeType || 'audio/mpeg', size: asset.size };
    } catch (err) {
        console.error('[upload] pickAudioFile error:', err);
        return null;
    }
}

async function pickCoverImage(): Promise<PickedFile | null> {
    try {
        const result = await DocumentPicker.getDocumentAsync({ type: ['image/*'], copyToCacheDirectory: true });
        if (result.canceled || !result.assets?.length) return null;
        const asset = result.assets[0];
        return { uri: asset.uri, name: asset.name, mimeType: asset.mimeType || 'image/jpeg', size: asset.size };
    } catch (err) {
        console.error('[upload] pickCoverImage error:', err);
        return null;
    }
}

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

async function uploadToStorage(
    bucket: string, filePath: string, fileUri: string, contentType: string, walletAddress?: string,
): Promise<string | null> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60_000); // 60s upload timeout
    try {
        const response = await fetch(fileUri);
        const blob = await response.blob();
        const formData = new FormData();
        formData.append('file', blob, filePath.split('/').pop() || 'file');
        formData.append('bucket', bucket);
        formData.append('path', filePath);
        formData.append('walletAddress', walletAddress || '');
        formData.append('contentType', contentType);

        const res = await fetch(`${SUPABASE_URL}/functions/v1/upload-file`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
            body: formData,
            signal: controller.signal,
        });
        clearTimeout(timeoutId);
        const result = await res.json();
        if (!res.ok || !result.success) {
            console.error(`[upload] Edge Function error (${bucket}/${filePath}):`, result.error || result);
            return null;
        }
        return result.path || filePath;
    } catch (err: any) {
        clearTimeout(timeoutId);
        console.error(`[upload] Storage upload exception (${bucket}/${filePath}):`, err?.message || err);
        return null;
    }
}

function parseDuration(duration: string): number | null {
    const match = duration.match(/^(\d{1,3}):(\d{2})$/);
    if (!match) return null;
    return parseInt(match[1]) * 60 + parseInt(match[2]);
}

function parseDate(dateStr: string): string | null {
    const match = dateStr.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!match) return null;
    return `${match[3]}-${match[2]}-${match[1]}`;
}

/* ─── Step Indicator ─── */
function StepIndicator({ current, total }: { current: number; total: number }) {
    const { isDark, colors } = useTheme();
    return (
        <View style={{ marginBottom: 28 }}>
            {/* Progress bar */}
            <View style={{
                height: 4, borderRadius: 2, overflow: 'hidden',
                backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#e2e8f0',
                marginBottom: 16,
            }}>
                <View style={{
                    height: 4, borderRadius: 2,
                    width: `${((current + 1) / total) * 100}%`,
                    backgroundColor: '#38b4ba',
                }} />
            </View>
            {/* Step labels */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                {STEP_LABELS.map((label, i) => {
                    const isActive = i === current;
                    const isDone = i < current;
                    return (
                        <View key={i} style={{ alignItems: 'center', flex: 1 }}>
                            <View style={{
                                width: 28, height: 28, borderRadius: 14,
                                backgroundColor: isDone ? '#38b4ba' : isActive ? 'rgba(56,180,186,0.15)' : (isDark ? 'rgba(255,255,255,0.06)' : '#f1f5f9'),
                                borderWidth: isActive ? 2 : 0,
                                borderColor: '#38b4ba',
                                alignItems: 'center', justifyContent: 'center', marginBottom: 6,
                            }}>
                                {isDone ? (
                                    <Check size={14} color="#fff" />
                                ) : (
                                    <Text style={{
                                        fontSize: 12, fontWeight: '700',
                                        color: isActive ? '#38b4ba' : colors.text.muted,
                                    }}>{i + 1}</Text>
                                )}
                            </View>
                            <Text style={{
                                fontSize: isWeb ? 11 : 9, fontWeight: isActive ? '700' : '500',
                                color: isActive ? '#38b4ba' : isDone ? colors.text.secondary : colors.text.muted,
                                textAlign: 'center',
                            }} numberOfLines={1}>{label}</Text>
                        </View>
                    );
                })}
            </View>
        </View>
    );
}

/* ─── Main Upload Screen ─── */
export default function CreatorUploadScreen() {
    const router = useRouter();
    const { isDark, colors } = useTheme();
    const { profile } = useAuth();
    const [form, setForm] = useState<UploadFormState>(createInitialUploadFormState);
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [submitted, setSubmitted] = useState(false);
    const [publishing, setPublishing] = useState(false);
    const [savingDraft, setSavingDraft] = useState(false);
    const [step, setStep] = useState(0);
    const [showLegalDetails, setShowLegalDetails] = useState(false);
    const [legalAccepted, setLegalAccepted] = useState(false);

    const [audioFile, setAudioFile] = useState<PickedFile | null>(null);
    const [coverFile, setCoverFile] = useState<PickedFile | null>(null);

    // Pre-fill from profile
    useEffect(() => {
        if (profile) {
            setForm((prev) => ({
                ...prev,
                stageName: prev.stageName || profile.displayName || '',
                email: prev.email || profile.email || '',
                country: prev.country || profile.country || '',
                splits: prev.splits.length === 1 && !prev.splits[0].name
                    ? [{ name: profile.displayName || '', role: 'Artist' as const, percentage: '100', email: profile.email || '' }]
                    : prev.splits,
            }));
        }
    }, [profile]);

    const set = useCallback(<K extends keyof UploadFormState>(key: K, value: UploadFormState[K]) => {
        setForm((prev) => ({ ...prev, [key]: value }));
        if (submitted) setErrors((prev) => { const next = { ...prev }; delete next[key]; return next; });
    }, [submitted]);

    const updateSplit = useCallback((index: number, field: keyof SplitEntry, value: string) => {
        setForm((prev) => {
            const splits = [...prev.splits];
            splits[index] = { ...splits[index], [field]: value };
            return { ...prev, splits };
        });
    }, []);

    const addSplit = useCallback(() => {
        setForm((prev) => ({
            ...prev,
            splits: [...prev.splits, { name: '', role: 'Artist' as const, percentage: '', email: '' }],
        }));
    }, []);

    const removeSplit = useCallback((index: number) => {
        setForm((prev) => ({ ...prev, splits: prev.splits.filter((_, i) => i !== index) }));
    }, []);

    const updateSample = useCallback((index: number, field: keyof SampleEntry, value: string) => {
        setForm((prev) => {
            const samples = [...prev.samples];
            samples[index] = { ...samples[index], [field]: value };
            return { ...prev, samples };
        });
    }, []);

    const splitTotal = form.splits.reduce((sum, s) => sum + (parseFloat(s.percentage) || 0), 0);

    const handlePickAudio = async () => {
        const file = await pickAudioFile();
        if (file) { setAudioFile(file); set('audioFileName', file.name); }
        else if (audioFile) { setAudioFile(null); set('audioFileName', ''); }
    };

    const handlePickCover = async () => {
        const file = await pickCoverImage();
        if (file) setCoverFile(file);
    };

    // ── Step-specific validation ──
    const validateStep = (stepIdx: number): boolean => {
        const e: Record<string, string> = {};

        if (stepIdx === 0) {
            if (!form.trackTitle.trim()) e.trackTitle = 'Required';
            if (!form.genre) e.genre = 'Required';
            if (form.genre === 'Other' && !form.genreOther.trim()) e.genreOther = 'Required';
            if (!form.duration.trim()) e.duration = 'Required';
            if (!form.releaseDate.trim()) e.releaseDate = 'Required';
        }

        if (stepIdx === 2) {
            if (splitTotal !== 100) e.splits = `Split total is ${splitTotal}% — must equal 100%`;
            form.splits.forEach((s, i) => {
                if (!s.name.trim()) e[`split_${i}_name`] = 'Required';
                if (!s.percentage.trim()) e[`split_${i}_pct`] = 'Required';
            });
        }

        if (stepIdx === 3) {
            if (!legalAccepted) e.legal = 'You must accept the legal terms';
        }

        setErrors(e);
        return Object.keys(e).length === 0;
    };

    const validate = (isDraft: boolean): boolean => {
        const e: Record<string, string> = {};
        if (!form.trackTitle.trim()) e.trackTitle = 'Required';
        if (!isDraft) {
            if (!form.genre) e.genre = 'Required';
            if (form.genre === 'Other' && !form.genreOther.trim()) e.genreOther = 'Required';
            if (!form.duration.trim()) e.duration = 'Required';
            if (!form.releaseDate.trim()) e.releaseDate = 'Required';
            if (splitTotal !== 100) e.splits = `Split total is ${splitTotal}% — must equal 100%`;
            form.splits.forEach((s, i) => {
                if (!s.name.trim()) e[`split_${i}_name`] = 'Required';
                if (!s.percentage.trim()) e[`split_${i}_pct`] = 'Required';
            });
            if (!legalAccepted) e.legal = 'You must accept the legal terms';
        }
        setErrors(e);
        return Object.keys(e).length === 0;
    };

    const handleNext = () => {
        if (validateStep(step)) setStep((s) => Math.min(s + 1, 3));
    };
    const handleBack = () => setStep((s) => Math.max(s - 1, 0));

    // ── Save ──
    const saveSong = async (isPublished: boolean) => {
        if (!profile?.id) {
            const msg = 'You must be logged in as a creator to upload tracks.';
            Platform.OS === 'web' ? alert(msg) : Alert.alert('Error', msg);
            return;
        }
        const isDraft = !isPublished;
        setSubmitted(true);
        if (!validate(isDraft)) return;

        if (isPublished) setPublishing(true);
        else setSavingDraft(true);

        try {
            let audioPath: string | null = null;
            if (audioFile) {
                const ext = audioFile.name.split('.').pop() || 'mp3';
                const storagePath = `${profile.id}/${Date.now()}.${ext}`;
                audioPath = await uploadToStorage('audio', storagePath, audioFile.uri, audioFile.mimeType || 'audio/mpeg', profile.walletAddress);
                if (!audioPath) {
                    const msg = 'Failed to upload audio file. Please try again.';
                    Platform.OS === 'web' ? alert(msg) : Alert.alert('Upload Error', msg);
                    if (isPublished) setPublishing(false); else setSavingDraft(false);
                    return;
                }
            }

            let coverPath: string | null = null;
            if (coverFile) {
                const ext = coverFile.name.split('.').pop() || 'jpg';
                const storagePath = `${profile.id}/${Date.now()}-cover.${ext}`;
                coverPath = await uploadToStorage('covers', storagePath, coverFile.uri, coverFile.mimeType || 'image/jpeg', profile.walletAddress);
            }

            const durationSec = parseDuration(form.duration) || undefined;
            const releaseDate = parseDate(form.releaseDate) || undefined;
            const genre = form.genre === 'Other' ? form.genreOther : form.genre;

            const song = await createSong({
                creatorId: profile.id,
                title: form.trackTitle.trim(),
                album: form.albumEp || undefined,
                genre: genre || undefined,
                description: form.albumEp ? `${form.trackTitle} from ${form.albumEp}` : undefined,
                durationSeconds: durationSec,
                audioPath: audioPath || undefined,
                coverPath: coverPath || undefined,
                releaseDate,
                isPublished,
                trackType: form.trackType || undefined,
                masterOwnership: form.masterOwnership || undefined,
                masterOwnershipPct: form.masterOwnershipPercentage ? parseFloat(form.masterOwnershipPercentage) : undefined,
                compositionOwnership: form.compositionOwnership || undefined,
                compositionOwnerName: form.compositionOwnerName || undefined,
                compositionOwnershipPct: form.compositionOwnershipPercentage ? parseFloat(form.compositionOwnershipPercentage) : undefined,
            });

            if (!song) {
                const msg = 'Failed to save song. Please try again.';
                Platform.OS === 'web' ? alert(msg) : Alert.alert('Error', msg);
                if (isPublished) setPublishing(false); else setSavingDraft(false);
                return;
            }

            if (splitTotal === 100 && form.splits.length > 0) {
                const splitData = form.splits.map((s) => ({
                    partyEmail: s.email || profile.email || 'unknown@mu6.io',
                    partyName: s.name,
                    role: s.role.toLowerCase(),
                    sharePercent: parseFloat(s.percentage) || 0,
                    linkedProfileId: s.email === profile.email ? profile.id : undefined,
                    linkedWalletAddress: s.email === profile.email ? (profile.walletAddress || undefined) : undefined,
                }));
                await upsertSplitSheet(song.id, splitData);
            }

            const msg = isPublished ? 'Your track has been published on MU6!' : 'Your draft has been saved.';
            Platform.OS === 'web' ? alert(msg) : Alert.alert('Success', msg);
            router.replace('/(artist)/songs');
        } catch (err: any) {
            console.error('[upload] Save error:', err);
            const msg = err?.name === 'AbortError'
                ? 'Upload timed out. Please check your connection and try again.'
                : (err?.message || 'Could not save the song. Please try again.');
            Platform.OS === 'web' ? alert(msg) : Alert.alert('Upload Failed', msg);
        } finally {
            setPublishing(false);
            setSavingDraft(false);
        }
    };

    const isSaving = publishing || savingDraft;
    const errorCount = Object.keys(errors).length;
    const Container = isWeb ? View : SafeAreaView;

    return (
        <Container style={{ flex: 1, backgroundColor: isWeb ? (isDark ? '#030711' : '#f1f5f9') : 'transparent' }}>
            <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={{
                    padding: isWeb ? 40 : 16, paddingBottom: 80,
                    maxWidth: isWeb ? 860 : undefined,
                    width: '100%' as any, alignSelf: 'center' as any,
                }}
                showsVerticalScrollIndicator={false}
            >
                {/* ─── Page Header ─── */}
                <View style={{ marginBottom: 24 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                        <View style={{
                            width: 48, height: 48, borderRadius: 14,
                            backgroundColor: isDark ? 'rgba(56,180,186,0.15)' : 'rgba(56,180,186,0.1)',
                            alignItems: 'center', justifyContent: 'center', marginRight: 16,
                        }}>
                            <Music size={24} color="#38b4ba" />
                        </View>
                        <View>
                            <Text style={{ fontSize: isWeb ? 32 : 26, fontWeight: '800', color: isDark ? colors.text.primary : '#0f172a', letterSpacing: -0.8 }}>
                                Upload Track
                            </Text>
                        </View>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 }}>
                        <View style={{
                            backgroundColor: isDark ? 'rgba(139,92,246,0.15)' : 'rgba(139,92,246,0.08)',
                            borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4,
                            borderWidth: 1, borderColor: isDark ? 'rgba(139,92,246,0.3)' : 'rgba(139,92,246,0.2)',
                        }}>
                            <Text style={{ fontSize: 11, fontWeight: '700', color: '#8b5cf6', textTransform: 'uppercase', letterSpacing: 0.8 }}>
                                Creator: {profile?.displayName || 'Artist'}
                            </Text>
                        </View>
                    </View>
                </View>

                {/* ─── Step Indicator ─── */}
                <StepIndicator current={step} total={4} />

                {/* ════════════════════════════════════════════════ */}
                {/* ─── STEP 1: Track Basics ─── */}
                {/* ════════════════════════════════════════════════ */}
                {step === 0 && (
                    <SectionCard>
                        <SectionHeader number={1} title="Track Basics" subtitle="Core details about your track" />
                        <FormField label="Track Title" required error={errors.trackTitle}>
                            <TextFormInput value={form.trackTitle} onChangeText={(v) => set('trackTitle', v)} placeholder="Enter track title" />
                        </FormField>
                        <FormField label="Album / EP" error={errors.albumEp}>
                            <TextFormInput value={form.albumEp} onChangeText={(v) => set('albumEp', v)} placeholder="Optional — album or EP name" />
                        </FormField>
                        <FormField label="Genre" required error={errors.genre || errors.genreOther} style={{ zIndex: 10 }}>
                            <SelectField
                                options={GENRES.map((g) => ({ value: g, label: g }))}
                                value={form.genre}
                                onChange={(v) => set('genre', v as any)}
                                placeholder="Select genre"
                            />
                            {form.genre === 'Other' && (
                                <View style={{ marginTop: 10 }}>
                                    <TextFormInput value={form.genreOther} onChangeText={(v) => set('genreOther', v)} placeholder="Specify genre" />
                                </View>
                            )}
                        </FormField>
                        <View style={{ flexDirection: isWeb ? 'row' : 'column', gap: isWeb ? 14 : 0 }}>
                            <View style={{ flex: 1 }}>
                                <FormField label="Duration (MM:SS)" required error={errors.duration}>
                                    <TextFormInput value={form.duration} onChangeText={(v) => set('duration', v)} placeholder="03:45" />
                                </FormField>
                            </View>
                            <View style={{ flex: 1 }}>
                                <FormField label="Release Date (DD/MM/YYYY)" required error={errors.releaseDate}>
                                    <TextFormInput value={form.releaseDate} onChangeText={(v) => set('releaseDate', v)} placeholder="15/06/2026" />
                                </FormField>
                            </View>
                        </View>
                        <FormField label="First release anywhere?" error={errors.firstReleaseAnywhere}>
                            <RadioGroup
                                options={[{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }]}
                                value={form.firstReleaseAnywhere === null ? '' : form.firstReleaseAnywhere ? 'yes' : 'no'}
                                onChange={(v) => set('firstReleaseAnywhere', v === 'yes')}
                                horizontal
                            />
                        </FormField>
                        <FormField label="Audio File" error={errors.audioFileName}>
                            <FilePickerField
                                fileName={form.audioFileName}
                                onPress={handlePickAudio}
                                accept="WAV, FLAC, or MP3 — Max 50MB"
                            />
                        </FormField>
                        <FormField label="Cover Image" style={{ marginBottom: 0 }}>
                            <FilePickerField
                                fileName={coverFile?.name || ''}
                                onPress={handlePickCover}
                                accept="JPG or PNG — Recommended 1000x1000"
                                icon="document"
                            />
                        </FormField>
                    </SectionCard>
                )}

                {/* ════════════════════════════════════════════════ */}
                {/* ─── STEP 2: Rights & Ownership ─── */}
                {/* ════════════════════════════════════════════════ */}
                {step === 1 && (
                    <>
                        {/* Track Type */}
                        <SectionCard>
                            <SectionHeader number={2} title="Track Type" subtitle="What type of track is this?" />
                            <FormField label="Track Type" error={errors.trackType || errors.trackTypeOther} style={{ marginBottom: 0 }}>
                                <RadioGroup
                                    options={TRACK_TYPES}
                                    value={form.trackType}
                                    onChange={(v) => set('trackType', v as any)}
                                />
                                {form.trackType === 'other' && (
                                    <View style={{ marginTop: 10 }}>
                                        <TextFormInput value={form.trackTypeOther} onChangeText={(v) => set('trackTypeOther', v)} placeholder="Describe the track type" />
                                    </View>
                                )}
                            </FormField>
                        </SectionCard>

                        {/* Master Recording */}
                        <SectionCard>
                            <SectionHeader number={3} title="Master Recording" subtitle="Who owns the master recording rights?" />
                            <FormField label="Ownership" error={errors.masterOwnership} style={form.masterOwnership !== 'shared' ? { marginBottom: 0 } : undefined}>
                                <RadioGroup
                                    options={OWNERSHIP_OPTIONS}
                                    value={form.masterOwnership}
                                    onChange={(v) => set('masterOwnership', v as any)}
                                />
                            </FormField>
                            {form.masterOwnership === 'shared' && (
                                <FormField label="Your Ownership Percentage (%)" error={errors.masterOwnershipPercentage} style={{ marginBottom: 0 }}>
                                    <TextFormInput value={form.masterOwnershipPercentage} onChangeText={(v) => set('masterOwnershipPercentage', v)} placeholder="e.g. 50" keyboardType="numeric" />
                                </FormField>
                            )}
                        </SectionCard>

                        {/* Composition */}
                        <SectionCard>
                            <SectionHeader number={4} title="Composition & Songwriting" subtitle="Who owns the composition and lyrics?" />
                            <FormField label="Composition Ownership" error={errors.compositionOwnership}
                                style={form.compositionOwnership === 'i_own_100' || form.compositionOwnership === '' ? { marginBottom: 0 } : undefined}
                            >
                                <RadioGroup
                                    options={COMPOSITION_OPTIONS}
                                    value={form.compositionOwnership}
                                    onChange={(v) => set('compositionOwnership', v as any)}
                                />
                            </FormField>
                            {form.compositionOwnership !== 'i_own_100' && form.compositionOwnership !== '' && (
                                <>
                                    <FormField label="Owner Name" error={errors.compositionOwnerName}>
                                        <TextFormInput value={form.compositionOwnerName} onChangeText={(v) => set('compositionOwnerName', v)} placeholder="Name of the rights holder" />
                                    </FormField>
                                    <FormField label="Ownership Percentage (%)" error={errors.compositionOwnershipPercentage} style={{ marginBottom: 0 }}>
                                        <TextFormInput value={form.compositionOwnershipPercentage} onChangeText={(v) => set('compositionOwnershipPercentage', v)} placeholder="e.g. 50" keyboardType="numeric" />
                                    </FormField>
                                </>
                            )}
                        </SectionCard>

                        {/* Samples */}
                        <SectionCard>
                            <SectionHeader number={5} title="Samples & Interpolations" subtitle="Does this track contain samples?" />
                            <FormField label="Contains samples or interpolations?" error={errors.hasSamples}
                                style={!form.hasSamples ? { marginBottom: 0 } : undefined}
                            >
                                <RadioGroup
                                    options={[{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }]}
                                    value={form.hasSamples === null ? '' : form.hasSamples ? 'yes' : 'no'}
                                    onChange={(v) => set('hasSamples', v === 'yes')}
                                    horizontal
                                />
                            </FormField>
                            {form.hasSamples && form.samples.map((sample, i) => (
                                <View key={i} style={{
                                    backgroundColor: isDark ? 'rgba(255,255,255,0.02)' : '#fafcfd',
                                    borderRadius: 12, padding: 14, marginBottom: 10,
                                    borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.06)' : '#e8ecf1',
                                }}>
                                    <Text style={{ fontSize: 12, fontWeight: '700', color: isDark ? colors.text.secondary : '#64748b', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>
                                        Sample {i + 1}
                                    </Text>
                                    <FormField label="Original Track">
                                        <TextFormInput value={sample.originalTrack} onChangeText={(v) => updateSample(i, 'originalTrack', v)} placeholder="Name of the original track" />
                                    </FormField>
                                    <FormField label="Original Artist">
                                        <TextFormInput value={sample.originalArtist} onChangeText={(v) => updateSample(i, 'originalArtist', v)} placeholder="Original artist name" />
                                    </FormField>
                                    <FormField label="Rights Holder">
                                        <TextFormInput value={sample.rightsHolder} onChangeText={(v) => updateSample(i, 'rightsHolder', v)} placeholder="Who holds the rights?" />
                                    </FormField>
                                    <FormField label="Licensed?" style={{ marginBottom: 0 }}>
                                        <RadioGroup
                                            options={[{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }, { value: 'unsure', label: 'Unsure' }]}
                                            value={sample.licensed}
                                            onChange={(v) => updateSample(i, 'licensed', v)}
                                            horizontal
                                        />
                                    </FormField>
                                </View>
                            ))}
                            {form.hasSamples && (
                                <FormField label="License Documentation (PDF)" style={{ marginBottom: 0 }}>
                                    <FilePickerField
                                        fileName={form.licenseDocFileName}
                                        onPress={() => set('licenseDocFileName', form.licenseDocFileName ? '' : 'license.pdf')}
                                        accept="PDF files"
                                        icon="document"
                                    />
                                </FormField>
                            )}
                        </SectionCard>

                        {/* Previous Releases */}
                        <SectionCard>
                            <SectionHeader number={6} title="Previous Releases" subtitle="Has this track been released before?" />
                            <FormField label="Is this the first release?" error={errors.isFirstRelease}
                                style={form.isFirstRelease !== false ? { marginBottom: 0 } : undefined}
                            >
                                <RadioGroup
                                    options={[{ value: 'yes', label: 'Yes — completely new' }, { value: 'no', label: 'No — previously released' }]}
                                    value={form.isFirstRelease === null ? '' : form.isFirstRelease ? 'yes' : 'no'}
                                    onChange={(v) => set('isFirstRelease', v === 'yes')}
                                />
                            </FormField>
                            {form.isFirstRelease === false && (
                                <>
                                    <FormField label="Previous Platform">
                                        <TextFormInput value={form.previousPlatform} onChangeText={(v) => set('previousPlatform', v)} placeholder="e.g. Spotify, SoundCloud" />
                                    </FormField>
                                    <FormField label="Previous Release Date">
                                        <TextFormInput value={form.previousReleaseDate} onChangeText={(v) => set('previousReleaseDate', v)} placeholder="DD/MM/YYYY" />
                                    </FormField>
                                    <FormField label="Exclusive rights granted elsewhere?"
                                        style={!form.exclusiveRightsGranted ? { marginBottom: 0 } : undefined}
                                    >
                                        <RadioGroup
                                            options={[{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }]}
                                            value={form.exclusiveRightsGranted === null ? '' : form.exclusiveRightsGranted ? 'yes' : 'no'}
                                            onChange={(v) => set('exclusiveRightsGranted', v === 'yes')}
                                            horizontal
                                        />
                                    </FormField>
                                    {form.exclusiveRightsGranted && (
                                        <View style={{ flexDirection: isWeb ? 'row' : 'column', gap: isWeb ? 14 : 0 }}>
                                            <View style={{ flex: 1 }}>
                                                <FormField label="Exclusive Platform">
                                                    <TextFormInput value={form.exclusivePlatform} onChangeText={(v) => set('exclusivePlatform', v)} placeholder="Platform name" />
                                                </FormField>
                                            </View>
                                            <View style={{ flex: 1 }}>
                                                <FormField label="Exclusive Until" style={{ marginBottom: 0 }}>
                                                    <TextFormInput value={form.exclusiveUntilDate} onChangeText={(v) => set('exclusiveUntilDate', v)} placeholder="DD/MM/YYYY" />
                                                </FormField>
                                            </View>
                                        </View>
                                    )}
                                </>
                            )}
                        </SectionCard>
                    </>
                )}

                {/* ════════════════════════════════════════════════ */}
                {/* ─── STEP 3: Split Sheet ─── */}
                {/* ════════════════════════════════════════════════ */}
                {step === 2 && (
                    <SectionCard>
                        <SectionHeader number={7} title="Split-Sheet" subtitle="Distribute royalties among all contributors" />
                        <View style={{
                            backgroundColor: isDark ? 'rgba(56,180,186,0.06)' : '#f0fdfa',
                            borderRadius: 10, padding: 12, borderWidth: 1,
                            borderColor: isDark ? 'rgba(56,180,186,0.12)' : '#ccfbf1',
                            marginBottom: 16, flexDirection: 'row', alignItems: 'flex-start',
                        }}>
                            <Info size={15} color="#38b4ba" style={{ marginTop: 1, marginRight: 8 }} />
                            <Text style={{ fontSize: 12, color: isDark ? colors.text.secondary : '#475569', flex: 1, lineHeight: 18 }}>
                                Example: 50% Artist, 30% Producer, 20% Composer. Total must equal 100%.
                            </Text>
                        </View>

                        {form.splits.map((split, i) => (
                            <View key={i} style={{
                                backgroundColor: isDark ? 'rgba(255,255,255,0.02)' : '#fafcfd',
                                borderRadius: 12, padding: 14, marginBottom: 10,
                                borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.06)' : '#e8ecf1',
                            }}>
                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                    <Text style={{ fontSize: 12, fontWeight: '700', color: isDark ? colors.text.secondary : '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                                        Contributor {i + 1}
                                    </Text>
                                    {form.splits.length > 1 && (
                                        <AnimatedPressable preset="icon" hapticType="none" onPress={() => removeSplit(i)}>
                                            <Trash2 size={15} color="#ef4444" />
                                        </AnimatedPressable>
                                    )}
                                </View>
                                <View style={{ flexDirection: isWeb ? 'row' : 'column', gap: isWeb ? 10 : 0 }}>
                                    <View style={{ flex: 2 }}>
                                        <FormField label="Name" required error={errors[`split_${i}_name`]}>
                                            <TextFormInput value={split.name} onChangeText={(v) => updateSplit(i, 'name', v)} placeholder="Full name" />
                                        </FormField>
                                    </View>
                                    <View style={{ flex: 1, zIndex: 10 }}>
                                        <FormField label="Role">
                                            <SelectField
                                                options={SPLIT_ROLES.map((r) => ({ value: r, label: r }))}
                                                value={split.role}
                                                onChange={(v) => updateSplit(i, 'role', v)}
                                            />
                                        </FormField>
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <FormField label="%" required error={errors[`split_${i}_pct`]}>
                                            <TextFormInput value={split.percentage} onChangeText={(v) => updateSplit(i, 'percentage', v)} placeholder="50" keyboardType="numeric" />
                                        </FormField>
                                    </View>
                                    <View style={{ flex: 2 }}>
                                        <FormField label="Email" style={{ marginBottom: 0 }}>
                                            <TextFormInput value={split.email} onChangeText={(v) => updateSplit(i, 'email', v)} placeholder="email@example.com" keyboardType="email-address" />
                                        </FormField>
                                    </View>
                                </View>
                            </View>
                        ))}

                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                            <AnimatedPressable
                                preset="button"
                                onPress={addSplit}
                                style={{
                                    flexDirection: 'row', alignItems: 'center',
                                    paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8,
                                    borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.1)' : '#e2e8f0',
                                    backgroundColor: isDark ? 'transparent' : '#fff',
                                }}
                            >
                                <Plus size={14} color={isDark ? colors.text.secondary : '#64748b'} />
                                <Text style={{ color: isDark ? colors.text.secondary : '#475569', fontWeight: '600', fontSize: 13, marginLeft: 6 }}>Add Contributor</Text>
                            </AnimatedPressable>
                            <View style={{
                                flexDirection: 'row', alignItems: 'center',
                                backgroundColor: splitTotal === 100
                                    ? (isDark ? 'rgba(56,180,186,0.1)' : '#f0fdfa')
                                    : (isDark ? 'rgba(239,68,68,0.08)' : '#fef2f2'),
                                paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8,
                                borderWidth: 1,
                                borderColor: splitTotal === 100
                                    ? (isDark ? 'rgba(56,180,186,0.2)' : '#ccfbf1')
                                    : (isDark ? 'rgba(239,68,68,0.15)' : '#fecaca'),
                            }}>
                                <Text style={{ fontSize: 13, fontWeight: '700', color: splitTotal === 100 ? '#38b4ba' : '#ef4444' }}>
                                    {splitTotal}%
                                </Text>
                                {splitTotal === 100 && <Text style={{ marginLeft: 4, fontSize: 12, color: '#38b4ba' }}>✓</Text>}
                            </View>
                        </View>
                        {errors.splits && <Text style={{ fontSize: 12, color: '#ef4444', marginTop: 6, fontWeight: '500' }}>{errors.splits}</Text>}
                    </SectionCard>
                )}

                {/* ════════════════════════════════════════════════ */}
                {/* ─── STEP 4: Review & Submit ─── */}
                {/* ════════════════════════════════════════════════ */}
                {step === 3 && (
                    <>
                        {/* Summary */}
                        <SectionCard>
                            <SectionHeader number={8} title="Review" subtitle="Review your submission before publishing" />
                            <View style={{ gap: 10 }}>
                                {[
                                    { label: 'Track', value: form.trackTitle || '—' },
                                    { label: 'Genre', value: (form.genre === 'Other' ? form.genreOther : form.genre) || '—' },
                                    { label: 'Duration', value: form.duration || '—' },
                                    { label: 'Release Date', value: form.releaseDate || '—' },
                                    { label: 'Audio File', value: form.audioFileName || 'Not selected' },
                                    { label: 'Track Type', value: form.trackType || '—' },
                                    { label: 'Split Total', value: `${splitTotal}%` },
                                ].map(({ label, value }) => (
                                    <View key={label} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: isDark ? 'rgba(255,255,255,0.04)' : '#f1f5f9' }}>
                                        <Text style={{ fontSize: 13, color: colors.text.secondary, fontWeight: '500' }}>{label}</Text>
                                        <Text style={{ fontSize: 13, color: colors.text.primary, fontWeight: '600' }}>{value}</Text>
                                    </View>
                                ))}
                            </View>
                        </SectionCard>

                        {/* Consolidated Legal — single checkbox */}
                        <SectionCard>
                            <SectionHeader number={9} title="Legal Confirmations" subtitle="Accept terms to submit" />
                            <CheckboxField
                                checked={legalAccepted}
                                onChange={() => setLegalAccepted(!legalAccepted)}
                                label="I confirm that I have the rights to distribute this track, all information is accurate, and I agree to MU6's terms of service."
                            />
                            {errors.legal && <Text style={{ fontSize: 12, color: '#ef4444', marginTop: 6, fontWeight: '500' }}>{errors.legal}</Text>}

                            {/* View all 7 legal details */}
                            <AnimatedPressable
                                preset="row"
                                hapticType="none"
                                onPress={() => setShowLegalDetails(!showLegalDetails)}
                                style={{
                                    flexDirection: 'row', alignItems: 'center', marginTop: 12,
                                    paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8,
                                    backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : '#f8fafc',
                                    borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.06)' : '#e2e8f0',
                                }}
                            >
                                <ExternalLink size={14} color={colors.text.secondary} style={{ marginRight: 8 }} />
                                <Text style={{ fontSize: 13, color: colors.text.secondary, fontWeight: '600', flex: 1 }}>
                                    {showLegalDetails ? 'Hide full terms' : 'View full terms & confirmations'}
                                </Text>
                            </AnimatedPressable>

                            {showLegalDetails && (
                                <View style={{
                                    marginTop: 12, padding: 14, borderRadius: 10,
                                    backgroundColor: isDark ? 'rgba(255,255,255,0.02)' : '#fafcfd',
                                    borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.06)' : '#e8ecf1',
                                }}>
                                    {LEGAL_CONFIRMATIONS.map((text, i) => (
                                        <View key={i} style={{ flexDirection: 'row', marginBottom: i < LEGAL_CONFIRMATIONS.length - 1 ? 10 : 0 }}>
                                            <Text style={{ fontSize: 12, color: '#38b4ba', fontWeight: '700', marginRight: 8 }}>{i + 1}.</Text>
                                            <Text style={{ fontSize: 12, color: colors.text.secondary, flex: 1, lineHeight: 18 }}>{text}</Text>
                                        </View>
                                    ))}
                                </View>
                            )}
                        </SectionCard>

                        {/* Error summary */}
                        {submitted && errorCount > 0 && (
                            <View style={{
                                backgroundColor: isDark ? 'rgba(239,68,68,0.08)' : '#fef2f2',
                                borderRadius: 12, padding: 14, marginBottom: 16,
                                borderWidth: 1, borderColor: isDark ? 'rgba(239,68,68,0.15)' : '#fecaca',
                                flexDirection: 'row', alignItems: 'center',
                            }}>
                                <Info size={16} color="#ef4444" style={{ marginRight: 10 }} />
                                <Text style={{ fontSize: 13, color: '#ef4444', fontWeight: '600', flex: 1 }}>
                                    {errorCount} {errorCount === 1 ? 'field needs' : 'fields need'} attention. Please review previous steps.
                                </Text>
                            </View>
                        )}

                        {/* Submit Buttons */}
                        <View style={{ flexDirection: isWeb ? 'row' : 'column', gap: 12 }}>
                            <AnimatedPressable
                                preset="button"
                                onPress={() => saveSong(true)}
                                disabled={isSaving}
                                style={{
                                    flex: isWeb ? 1 : undefined, flexDirection: 'row',
                                    backgroundColor: publishing ? '#2d9a9f' : '#38b4ba',
                                    borderRadius: 12, paddingVertical: 14,
                                    alignItems: 'center', justifyContent: 'center',
                                    shadowColor: '#38b4ba', shadowOffset: { width: 0, height: 4 },
                                    shadowOpacity: 0.25, shadowRadius: 12,
                                    opacity: isSaving ? 0.7 : 1,
                                }}
                            >
                                {publishing ? (
                                    <ActivityIndicator size="small" color="#fff" />
                                ) : (
                                    <>
                                        <Send size={16} color="#fff" style={{ marginRight: 8 }} />
                                        <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Publish Song</Text>
                                    </>
                                )}
                            </AnimatedPressable>

                            <AnimatedPressable
                                preset="button"
                                onPress={() => saveSong(false)}
                                disabled={isSaving}
                                style={{
                                    flex: isWeb ? 1 : undefined, flexDirection: 'row',
                                    backgroundColor: isDark ? 'transparent' : '#fff',
                                    borderRadius: 12, paddingVertical: 14,
                                    alignItems: 'center', justifyContent: 'center',
                                    borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.1)' : '#e2e8f0',
                                    opacity: isSaving ? 0.7 : 1,
                                }}
                            >
                                {savingDraft ? (
                                    <ActivityIndicator size="small" color={isDark ? colors.text.secondary : '#64748b'} />
                                ) : (
                                    <>
                                        <Save size={16} color={isDark ? colors.text.secondary : '#64748b'} style={{ marginRight: 8 }} />
                                        <Text style={{ color: isDark ? colors.text.secondary : '#475569', fontWeight: '700', fontSize: 15 }}>Save Draft</Text>
                                    </>
                                )}
                            </AnimatedPressable>
                        </View>
                    </>
                )}

                {/* ─── Navigation Buttons ─── */}
                {step < 3 && (
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
                        {step > 0 ? (
                            <AnimatedPressable
                                preset="button"
                                onPress={handleBack}
                                style={{
                                    flexDirection: 'row', alignItems: 'center',
                                    paddingVertical: 12, paddingHorizontal: 20, borderRadius: 12,
                                    borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.1)' : '#e2e8f0',
                                    backgroundColor: isDark ? 'transparent' : '#fff',
                                }}
                            >
                                <ChevronLeft size={16} color={isDark ? colors.text.secondary : '#64748b'} style={{ marginRight: 6 }} />
                                <Text style={{ color: isDark ? colors.text.secondary : '#475569', fontWeight: '600', fontSize: 14 }}>Back</Text>
                            </AnimatedPressable>
                        ) : <View />}
                        <AnimatedPressable
                            preset="button"
                            onPress={handleNext}
                            style={{
                                flexDirection: 'row', alignItems: 'center',
                                paddingVertical: 12, paddingHorizontal: 24, borderRadius: 12,
                                backgroundColor: '#38b4ba',
                                shadowColor: '#38b4ba', shadowOffset: { width: 0, height: 4 },
                                shadowOpacity: 0.2, shadowRadius: 8,
                            }}
                        >
                            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14, marginRight: 6 }}>Next</Text>
                            <ChevronRight size={16} color="#fff" />
                        </AnimatedPressable>
                    </View>
                )}

            </ScrollView>
        </Container>
    );
}
