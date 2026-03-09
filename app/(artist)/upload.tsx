import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, Platform, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Plus, Trash2, Info, Music, Send, Save } from 'lucide-react-native';
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
    PAYMENT_METHODS,
    LEGAL_CONFIRMATIONS,
    type UploadFormState,
    type SplitEntry,
    type SampleEntry,
    createInitialUploadFormState,
} from '../../src/types/creator';
import { useTheme } from '../../src/context/ThemeContext';

const isWeb = Platform.OS === 'web';
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function SectionCard({ children, style }: { children: React.ReactNode; style?: any }) {
    const { isDark } = useTheme();
    return (
        <View style={[{
            backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : '#ffffff',
            borderRadius: 16,
            padding: isWeb ? 32 : 20, // Increased padding
            marginBottom: isWeb ? 32 : 24, // Increased spacing
            borderWidth: 1,
            borderColor: isDark ? 'rgba(255,255,255,0.06)' : '#e2e8f0', // Darker border
            ...(isWeb && !isDark ? {
                shadowColor: '#64748b', // Stronger shadow
                shadowOffset: { width: 0, height: 6 },
                shadowOpacity: 0.08,
                shadowRadius: 16,
            } : {}),
        }, style]}>
            {children}
        </View>
    );
}

export default function CreatorUploadScreen() {
    const { isDark, colors } = useTheme();
    const [form, setForm] = useState<UploadFormState>(createInitialUploadFormState);
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [submitted, setSubmitted] = useState(false);

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
        setForm((prev) => ({
            ...prev,
            splits: prev.splits.filter((_, i) => i !== index),
        }));
    }, []);

    const updateSample = useCallback((index: number, field: keyof SampleEntry, value: string) => {
        setForm((prev) => {
            const samples = [...prev.samples];
            samples[index] = { ...samples[index], [field]: value };
            return { ...prev, samples };
        });
    }, []);

    const toggleLegal = useCallback((index: number) => {
        setForm((prev) => {
            const legalConfirmations = [...prev.legalConfirmations];
            legalConfirmations[index] = !legalConfirmations[index];
            return { ...prev, legalConfirmations };
        });
    }, []);

    const splitTotal = form.splits.reduce((sum, s) => sum + (parseFloat(s.percentage) || 0), 0);

    const validate = (): boolean => {
        const e: Record<string, string> = {};

        if (!form.legalFullName.trim()) e.legalFullName = 'Required';
        if (!form.stageName.trim()) e.stageName = 'Required';
        if (!form.email.trim()) e.email = 'Required';
        else if (!EMAIL_REGEX.test(form.email)) e.email = 'Invalid email';
        if (!form.country) e.country = 'Required';
        if (form.country === 'other' && !form.countryOther.trim()) e.countryOther = 'Required';

        if (!form.trackTitle.trim()) e.trackTitle = 'Required';
        if (!form.genre) e.genre = 'Required';
        if (form.genre === 'Other' && !form.genreOther.trim()) e.genreOther = 'Required';
        if (!form.duration.trim()) e.duration = 'Required';
        if (!form.releaseDate.trim()) e.releaseDate = 'Required';
        if (form.firstReleaseAnywhere === null) e.firstReleaseAnywhere = 'Required';

        if (!form.trackType) e.trackType = 'Required';
        if (form.trackType === 'other' && !form.trackTypeOther.trim()) e.trackTypeOther = 'Required';

        if (!form.masterOwnership) e.masterOwnership = 'Required';
        if (form.masterOwnership === 'shared' && !form.masterOwnershipPercentage.trim()) e.masterOwnershipPercentage = 'Required';

        if (!form.compositionOwnership) e.compositionOwnership = 'Required';

        if (splitTotal !== 100) e.splits = `Split total is ${splitTotal}% — must equal 100%`;
        form.splits.forEach((s, i) => {
            if (!s.name.trim()) e[`split_${i}_name`] = 'Required';
            if (!s.percentage.trim()) e[`split_${i}_pct`] = 'Required';
        });

        if (form.hasSamples === null) e.hasSamples = 'Required';
        if (form.isFirstRelease === null) e.isFirstRelease = 'Required';
        if (!form.paymentMethod) e.paymentMethod = 'Required';
        if (!form.accountHolderName.trim()) e.accountHolderName = 'Required';
        if (!form.ibanOrAddress.trim()) e.ibanOrAddress = 'Required';

        if (form.legalConfirmations.some((c) => !c)) e.legal = 'All confirmations must be checked';

        setErrors(e);
        return Object.keys(e).length === 0;
    };

    const handlePublish = () => {
        setSubmitted(true);
        if (validate()) {
            if (Platform.OS === 'web') {
                alert('Form validated! Backend integration coming soon.');
            } else {
                Alert.alert('Success', 'Form validated! Backend integration coming soon.');
            }
        }
    };

    const errorCount = Object.keys(errors).length;
    const Container = isWeb ? View : SafeAreaView;

    return (
        <Container style={{ flex: 1, backgroundColor: isWeb ? (isDark ? '#030711' : '#f1f5f9') : 'transparent' }}>
            <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={{
                    padding: isWeb ? 40 : 16,
                    paddingBottom: 80,
                    maxWidth: isWeb ? 860 : undefined, // Increased width
                    width: '100%' as any,
                    alignSelf: 'center' as any,
                }}
                showsVerticalScrollIndicator={false}
            >
                {/* ─── Page Header ─── */}
                <View style={{ marginBottom: 32 }}>
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
                                Creator: Artist
                            </Text>
                        </View>
                        <Text style={{ fontSize: 14, color: isDark ? colors.text.muted : '#475569' }}>
                            Fill out each section to publish your track on MU6.
                        </Text>
                    </View>
                </View>

                {/* ─── SECTION 1: Artist Basics ─── */}
                <SectionCard>
                    <SectionHeader number={1} title="Artist Basics" subtitle="Your identity as the primary creator" />
                    <FormField label="Legal Full Name" required error={errors.legalFullName}>
                        <TextFormInput value={form.legalFullName} onChangeText={(v) => set('legalFullName', v)} placeholder="Enter your full legal name" />
                    </FormField>
                    <FormField label="Stage / Artist Name" required error={errors.stageName}>
                        <TextFormInput value={form.stageName} onChangeText={(v) => set('stageName', v)} placeholder="Your artist or stage name" />
                    </FormField>
                    <FormField label="Email" required error={errors.email}>
                        <TextFormInput value={form.email} onChangeText={(v) => set('email', v)} placeholder="you@example.com" keyboardType="email-address" />
                    </FormField>
                    <FormField label="Country" required error={errors.country || errors.countryOther} style={{ marginBottom: 0 }}>
                        <RadioGroup
                            options={[{ value: 'finland', label: 'Finland' }, { value: 'other', label: 'Other' }]}
                            value={form.country}
                            onChange={(v) => set('country', v as 'finland' | 'other')}
                            horizontal
                        />
                        {form.country === 'other' && (
                            <View style={{ marginTop: 10 }}>
                                <TextFormInput value={form.countryOther} onChangeText={(v) => set('countryOther', v)} placeholder="Specify your country" />
                            </View>
                        )}
                    </FormField>
                </SectionCard>

                {/* ─── SECTION 2: Track Basics ─── */}
                <SectionCard>
                    <SectionHeader number={2} title="Track Basics" subtitle="Core details about your track" />
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
                    <FormField label="First release anywhere?" required error={errors.firstReleaseAnywhere}>
                        <RadioGroup
                            options={[{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }]}
                            value={form.firstReleaseAnywhere === null ? '' : form.firstReleaseAnywhere ? 'yes' : 'no'}
                            onChange={(v) => set('firstReleaseAnywhere', v === 'yes')}
                            horizontal
                        />
                    </FormField>
                    <FormField label="Audio File" error={errors.audioFileName} style={{ marginBottom: 0 }}>
                        <FilePickerField
                            fileName={form.audioFileName}
                            onPress={() => set('audioFileName', form.audioFileName ? '' : 'my-track.wav')}
                            accept="WAV, FLAC, or MP3 — Max 50MB"
                        />
                    </FormField>
                </SectionCard>

                {/* ─── SECTION 3: Track Type ─── */}
                <SectionCard>
                    <SectionHeader number={3} title="Track Type" subtitle="What type of track is this?" />
                    <FormField label="Track Type" required error={errors.trackType || errors.trackTypeOther} style={{ marginBottom: 0 }}>
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

                {/* ─── SECTION 4: Master Recording Ownership ─── */}
                <SectionCard>
                    <SectionHeader number={4} title="Master Recording" subtitle="Who owns the master recording rights?" />
                    <FormField label="Ownership" required error={errors.masterOwnership} style={form.masterOwnership !== 'shared' ? { marginBottom: 0 } : undefined}>
                        <RadioGroup
                            options={OWNERSHIP_OPTIONS}
                            value={form.masterOwnership}
                            onChange={(v) => set('masterOwnership', v as any)}
                        />
                    </FormField>
                    {form.masterOwnership === 'shared' && (
                        <FormField label="Your Ownership Percentage (%)" required error={errors.masterOwnershipPercentage} style={{ marginBottom: 0 }}>
                            <TextFormInput
                                value={form.masterOwnershipPercentage}
                                onChangeText={(v) => set('masterOwnershipPercentage', v)}
                                placeholder="e.g. 50"
                                keyboardType="numeric"
                            />
                        </FormField>
                    )}
                </SectionCard>

                {/* ─── SECTION 5: Composition & Songwriting ─── */}
                <SectionCard>
                    <SectionHeader number={5} title="Composition & Songwriting" subtitle="Who owns the composition and lyrics?" />
                    <FormField label="Composition Ownership" required error={errors.compositionOwnership}
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

                {/* ─── SECTION 6: Split-Sheet ─── */}
                <SectionCard>
                    <SectionHeader number={6} title="Split-Sheet" subtitle="Distribute royalties among all contributors" />

                    <View style={{
                        backgroundColor: isDark ? 'rgba(56,180,186,0.06)' : '#f0fdfa',
                        borderRadius: 10,
                        padding: 12,
                        borderWidth: 1,
                        borderColor: isDark ? 'rgba(56,180,186,0.12)' : '#ccfbf1',
                        marginBottom: 16,
                        flexDirection: 'row',
                        alignItems: 'flex-start',
                    }}>
                        <Info size={15} color="#38b4ba" style={{ marginTop: 1, marginRight: 8 }} />
                        <Text style={{ fontSize: 12, color: isDark ? colors.text.secondary : '#475569', flex: 1, lineHeight: 18 }}>
                            Example: 50% Artist, 30% Producer, 20% Composer. Total must equal 100%.
                        </Text>
                    </View>

                    {form.splits.map((split, i) => (
                        <View
                            key={i}
                            style={{
                                backgroundColor: isDark ? 'rgba(255,255,255,0.02)' : '#fafcfd',
                                borderRadius: 12,
                                padding: 14,
                                marginBottom: 10,
                                borderWidth: 1,
                                borderColor: isDark ? 'rgba(255,255,255,0.06)' : '#e8ecf1',
                            }}
                        >
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
                                borderWidth: 1,
                                borderColor: isDark ? 'rgba(255,255,255,0.1)' : '#e2e8f0',
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

                {/* ─── SECTION 7: Samples & Interpolations ─── */}
                <SectionCard>
                    <SectionHeader number={7} title="Samples & Interpolations" subtitle="Does this track contain samples or interpolations?" />
                    <FormField label="Contains samples or interpolations?" required error={errors.hasSamples}
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
                        <View
                            key={i}
                            style={{
                                backgroundColor: isDark ? 'rgba(255,255,255,0.02)' : '#fafcfd',
                                borderRadius: 12, padding: 14, marginBottom: 10,
                                borderWidth: 1,
                                borderColor: isDark ? 'rgba(255,255,255,0.06)' : '#e8ecf1',
                            }}
                        >
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

                {/* ─── SECTION 8: Previous Releases ─── */}
                <SectionCard>
                    <SectionHeader number={8} title="Previous Releases" subtitle="Has this track been released before?" />
                    <FormField label="Is this the first release?" required error={errors.isFirstRelease}
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

                {/* ─── SECTION 9: Payout Information ─── */}
                <SectionCard style={{ zIndex: 5 }}>
                    <SectionHeader number={9} title="Payout Information" subtitle="How would you like to receive payments?" />
                    <FormField label="Payment Method" required error={errors.paymentMethod}>
                        <RadioGroup
                            options={PAYMENT_METHODS}
                            value={form.paymentMethod}
                            onChange={(v) => set('paymentMethod', v as any)}
                        />
                    </FormField>
                    <FormField label="Account Holder Name" required error={errors.accountHolderName}>
                        <TextFormInput value={form.accountHolderName} onChangeText={(v) => set('accountHolderName', v)} placeholder="Name on account" />
                    </FormField>
                    <FormField
                        label={form.paymentMethod === 'crypto_wallet' ? 'Wallet Address' : 'IBAN'}
                        required error={errors.ibanOrAddress}
                    >
                        <TextFormInput
                            value={form.ibanOrAddress}
                            onChangeText={(v) => set('ibanOrAddress', v)}
                            placeholder={form.paymentMethod === 'crypto_wallet' ? '0x...' : 'FI00 0000 0000 0000 00'}
                        />
                    </FormField>
                    <FormField label="Tax ID (optional)">
                        <TextFormInput value={form.taxId} onChangeText={(v) => set('taxId', v)} placeholder="Tax identification number" />
                    </FormField>
                    <FormField label="Payout Country" error={errors.payoutCountryOther} style={{ marginBottom: 0 }}>
                        <RadioGroup
                            options={[{ value: 'finland', label: 'Finland' }, { value: 'other', label: 'Other' }]}
                            value={form.payoutCountry}
                            onChange={(v) => set('payoutCountry', v as any)}
                            horizontal
                        />
                        {form.payoutCountry === 'other' && (
                            <View style={{ marginTop: 10 }}>
                                <TextFormInput value={form.payoutCountryOther} onChangeText={(v) => set('payoutCountryOther', v)} placeholder="Specify country" />
                            </View>
                        )}
                    </FormField>
                </SectionCard>

                {/* ─── SECTION 10: Legal Confirmations ─── */}
                <SectionCard>
                    <SectionHeader number={10} title="Legal Confirmations" subtitle="All boxes must be checked to submit" />
                    {LEGAL_CONFIRMATIONS.map((text, i) => (
                        <CheckboxField
                            key={i}
                            checked={form.legalConfirmations[i]}
                            onChange={() => toggleLegal(i)}
                            label={text}
                        />
                    ))}
                    {errors.legal && <Text style={{ fontSize: 12, color: '#ef4444', marginTop: 6, fontWeight: '500' }}>{errors.legal}</Text>}
                </SectionCard>

                {/* ─── Error summary ─── */}
                {submitted && errorCount > 0 && (
                    <View style={{
                        backgroundColor: isDark ? 'rgba(239,68,68,0.08)' : '#fef2f2',
                        borderRadius: 12, padding: 14, marginBottom: 16,
                        borderWidth: 1,
                        borderColor: isDark ? 'rgba(239,68,68,0.15)' : '#fecaca',
                        flexDirection: 'row', alignItems: 'center',
                    }}>
                        <Info size={16} color="#ef4444" style={{ marginRight: 10 }} />
                        <Text style={{ fontSize: 13, color: '#ef4444', fontWeight: '600', flex: 1 }}>
                            {errorCount} {errorCount === 1 ? 'field needs' : 'fields need'} attention. Please review above.
                        </Text>
                    </View>
                )}

                {/* ─── Submit Buttons ─── */}
                <View style={{ flexDirection: isWeb ? 'row' : 'column', gap: 12 }}>
                    <AnimatedPressable
                        preset="button"
                        onPress={handlePublish}
                        style={{
                            flex: isWeb ? 1 : undefined,
                            flexDirection: 'row',
                            backgroundColor: '#38b4ba',
                            borderRadius: 12,
                            paddingVertical: 14,
                            alignItems: 'center',
                            justifyContent: 'center',
                            shadowColor: '#38b4ba',
                            shadowOffset: { width: 0, height: 4 },
                            shadowOpacity: 0.25,
                            shadowRadius: 12,
                        }}
                    >
                        <Send size={16} color="#fff" style={{ marginRight: 8 }} />
                        <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Publish Song</Text>
                    </AnimatedPressable>

                    <AnimatedPressable
                        preset="button"
                        onPress={() => {}}
                        style={{
                            flex: isWeb ? 1 : undefined,
                            flexDirection: 'row',
                            backgroundColor: isDark ? 'transparent' : '#fff',
                            borderRadius: 12,
                            paddingVertical: 14,
                            alignItems: 'center',
                            justifyContent: 'center',
                            borderWidth: 1,
                            borderColor: isDark ? 'rgba(255,255,255,0.1)' : '#e2e8f0',
                        }}
                    >
                        <Save size={16} color={isDark ? colors.text.secondary : '#64748b'} style={{ marginRight: 8 }} />
                        <Text style={{ color: isDark ? colors.text.secondary : '#475569', fontWeight: '700', fontSize: 15 }}>Save Draft</Text>
                    </AnimatedPressable>
                </View>

            </ScrollView>
        </Container>
    );
}
