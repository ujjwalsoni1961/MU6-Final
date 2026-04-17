import React, { useState } from 'react';
import { View, Text, ScrollView, Platform, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { ChevronLeft } from 'lucide-react-native';
import AnimatedPressable from '../../src/components/shared/AnimatedPressable';
import { FormField, TextFormInput, SelectField } from '../../src/components/form';
import { useTheme } from '../../src/context/ThemeContext';
import { useAuth } from '../../src/context/AuthContext';
import { upgradeToCreator } from '../../src/services/database';
import {
    CREATOR_TYPES,
    ENABLED_CREATOR_TYPES,
    CREATOR_TYPE_LABELS,
    COUNTRIES,
    type CreatorProfile,
    type CreatorType,
} from '../../src/types/creator';

const isWeb = Platform.OS === 'web';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const COUNTRY_OPTIONS = COUNTRIES.map((c) => ({ value: c, label: c }));

export default function CreatorRegisterScreen() {
    const router = useRouter();
    const { isDark, colors } = useTheme();
    const { profile, isConnected, isLoading, refreshProfile, walletAddress } = useAuth();

    const [form, setForm] = useState<CreatorProfile>({
        legalFullName: '',
        stageName: '',
        email: '',
        country: '',
        creatorType: 'artist',
    });
    const [errors, setErrors] = useState<Partial<Record<keyof CreatorProfile, string>>>({});
    const [submitted, setSubmitted] = useState(false);
    const [saving, setSaving] = useState(false);

    const update = <K extends keyof CreatorProfile>(key: K, value: CreatorProfile[K]) => {
        setForm((prev) => ({ ...prev, [key]: value }));
        if (submitted) setErrors((prev) => ({ ...prev, [key]: undefined }));
    };

    const validate = (): boolean => {
        const e: typeof errors = {};
        if (!form.legalFullName.trim()) e.legalFullName = 'Legal full name is required';
        if (!form.stageName.trim()) e.stageName = 'Stage / Creator name is required';
        if (!form.email.trim()) e.email = 'Email is required';
        else if (!EMAIL_REGEX.test(form.email)) e.email = 'Please enter a valid email';
        if (!form.country) e.country = 'Please select your country';
        setErrors(e);
        return Object.keys(e).length === 0;
    };

    // Redirect to login if not connected (they'll get auto-wallet there)
    React.useEffect(() => {
        if (!isLoading && !isConnected) {
            router.replace('/(auth)/login');
        }
    }, [isLoading, isConnected]);

    const handleContinue = async () => {
        setSubmitted(true);
        if (!validate()) return;

        if (!profile?.id) {
            const msg = 'Please sign in first. You will be redirected to the login screen.';
            if (Platform.OS === 'web') {
                alert(msg);
            } else {
                Alert.alert('Sign In Required', msg);
            }
            router.replace('/(auth)/login');
            return;
        }

        setSaving(true);
        try {
            const result = await upgradeToCreator(profile.id, {
                displayName: form.stageName.trim(),
                email: form.email.trim(),
                creatorType: form.creatorType,
                country: form.country,
            });

            if (!result) {
                const msg = 'Failed to create your creator profile. Please try again.';
                if (Platform.OS === 'web') {
                    alert(msg);
                } else {
                    Alert.alert('Error', msg);
                }
                setSaving(false);
                return;
            }

            // Refresh the auth context so role updates everywhere
            await refreshProfile();

            // Navigate to artist dashboard
            router.replace('/(artist)/dashboard');
        } catch (err: any) {
            console.error('[creator-register] Error:', err);
            const msg = err?.message || 'An unexpected error occurred.';
            if (Platform.OS === 'web') {
                alert(msg);
            } else {
                Alert.alert('Error', msg);
            }
        } finally {
            setSaving(false);
        }
    };

    // Show auto-created wallet info
    const walletInfo = walletAddress ? (
        <View style={{
            backgroundColor: isDark ? 'rgba(56,180,186,0.08)' : '#f0fdfa',
            borderRadius: 12, padding: 14, marginBottom: 20,
            borderWidth: 1,
            borderColor: isDark ? 'rgba(56,180,186,0.2)' : '#ccfbf1',
        }}>
            <Text style={{ fontSize: 12, color: isDark ? '#94a3b8' : '#475569', fontWeight: '600' }}>
                Your MU6 wallet: {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}
            </Text>
            <Text style={{ fontSize: 11, color: isDark ? '#64748b' : '#94a3b8', marginTop: 4 }}>
                This wallet was auto-created for you. It will be used for minting NFTs and receiving royalties.
            </Text>
        </View>
    ) : null;

    return (
        <View style={{ flex: 1, backgroundColor: isDark ? '#030711' : '#f8fafc' }}>
            {isWeb ? (
                <View style={{ flex: 1, flexDirection: 'row' }}>
                    {/* Left branding panel */}
                    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 60, backgroundColor: '#030711' }}>
                        <Image
                            source={require('../../assets/mu6-logo-white.png')}
                            style={{ width: 100, height: 100, marginBottom: 20 }}
                            contentFit="contain"
                        />
                        <Text style={{ fontSize: 18, color: '#f1f5f9', letterSpacing: 4 } as any}>
                            MUSIC. OWNED.
                        </Text>
                        <Text style={{ fontSize: 14, color: '#64748b', marginTop: 12, textAlign: 'center', maxWidth: 260 }}>
                            Register as a Creator to start uploading and distributing your music.
                        </Text>
                    </View>

                    {/* Right form panel */}
                    <View style={{ flex: 1, justifyContent: 'center', padding: 40 }}>
                        <ScrollView contentContainerStyle={{ maxWidth: 480, width: '100%', alignSelf: 'center' }} showsVerticalScrollIndicator={false}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                            <AnimatedPressable preset="icon" hapticType="none" onPress={() => router.back()} style={{ marginRight: 12 }}>
                                <ChevronLeft size={24} color={colors.text.secondary} />
                            </AnimatedPressable>
                            <Text style={{ fontSize: 28, fontWeight: '800', color: colors.text.primary, letterSpacing: -0.5 }}>
                                Creator Registration
                            </Text>
                        </View>
                        <Text style={{ fontSize: 15, color: colors.text.secondary, marginBottom: 36 }}>
                                Set up your creator profile to get started.
                            </Text>

                            {walletInfo}

                            <RegistrationForm form={form} errors={errors} update={update} />

                            <AnimatedPressable
                                preset="button"
                                onPress={handleContinue}
                                disabled={saving}
                                style={{
                                    backgroundColor: saving ? '#2d9a9f' : '#38b4ba',
                                    borderRadius: 14,
                                    paddingVertical: 16,
                                    alignItems: 'center',
                                    marginTop: 8,
                                    shadowColor: '#38b4ba',
                                    shadowOffset: { width: 0, height: 4 },
                                    shadowOpacity: 0.3,
                                    shadowRadius: 12,
                                    opacity: saving ? 0.7 : 1,
                                }}
                            >
                                {saving ? (
                                    <ActivityIndicator size="small" color="#fff" />
                                ) : (
                                    <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Continue to Dashboard</Text>
                                )}
                            </AnimatedPressable>
                        </ScrollView>
                    </View>
                </View>
            ) : (
                <SafeAreaView style={{ flex: 1 }}>
                    <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 20 }}>
                            <AnimatedPressable preset="icon" hapticType="none" onPress={() => router.back()} style={{ marginRight: 12 }}>
                                <ChevronLeft size={20} color={colors.text.secondary} />
                            </AnimatedPressable>
                            <Text style={{ fontSize: 22, fontWeight: '800', color: colors.text.primary, letterSpacing: -0.5 }}>
                                Creator Registration
                            </Text>
                        </View>

                        {walletInfo}

                        <RegistrationForm form={form} errors={errors} update={update} />

                        <AnimatedPressable
                            preset="button"
                            onPress={handleContinue}
                            disabled={saving}
                            style={{
                                backgroundColor: saving ? '#2d9a9f' : '#38b4ba',
                                borderRadius: 14,
                                paddingVertical: 16,
                                alignItems: 'center',
                                marginTop: 8,
                                opacity: saving ? 0.7 : 1,
                            }}
                        >
                            {saving ? (
                                <ActivityIndicator size="small" color="#fff" />
                            ) : (
                                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Continue to Dashboard</Text>
                            )}
                        </AnimatedPressable>
                    </ScrollView>
                </SafeAreaView>
            )}
        </View>
    );
}

function RegistrationForm({ form, errors, update }: {
    form: CreatorProfile;
    errors: Partial<Record<string, string>>;
    update: <K extends keyof CreatorProfile>(key: K, value: CreatorProfile[K]) => void;
}) {
    const creatorTypeOptions = CREATOR_TYPES.map((t) => ({
        value: t,
        label: CREATOR_TYPE_LABELS[t],
        disabled: !ENABLED_CREATOR_TYPES.includes(t),
    }));

    return (
        <>
            <FormField label="Legal Full Name" required error={errors.legalFullName}>
                <TextFormInput
                    value={form.legalFullName}
                    onChangeText={(v) => update('legalFullName', v)}
                    placeholder="Enter your full legal name"
                />
            </FormField>

            <FormField label="Stage / Creator Name" required error={errors.stageName}>
                <TextFormInput
                    value={form.stageName}
                    onChangeText={(v) => update('stageName', v)}
                    placeholder="Your artist or creator name"
                />
            </FormField>

            <FormField label="Email" required error={errors.email}>
                <TextFormInput
                    value={form.email}
                    onChangeText={(v) => update('email', v)}
                    placeholder="you@example.com"
                    keyboardType="email-address"
                />
            </FormField>

            {/* Bug #002: Country dropdown instead of free-text */}
            <FormField label="Country" required error={errors.country} style={{ zIndex: 20 }}>
                <SelectField
                    options={COUNTRY_OPTIONS}
                    value={form.country}
                    onChange={(v) => update('country', v)}
                    placeholder="Select your country"
                    searchable
                />
            </FormField>

            {/* Bug #001: Added zIndex so dropdown renders above Continue button */}
            <FormField label="Creator Type" style={{ zIndex: 10, marginBottom: 20 }}>
                <SelectField
                    options={creatorTypeOptions}
                    value={form.creatorType}
                    onChange={(v) => update('creatorType', v as CreatorType)}
                    placeholder="Select creator type"
                />
            </FormField>
        </>
    );
}
