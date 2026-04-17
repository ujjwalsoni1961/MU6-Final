/**
 * Artist Login — Dedicated web-only artist registration & login flow.
 *
 * Two-step process:
 * 1. Collect artist info (name, email, genre, country)
 * 2. Connect via Thirdweb (auto-creates wallet)
 *
 * For returning artists: wallet connect detects existing profile → straight to dashboard.
 */
import React, { useState, useEffect, useRef } from 'react';
import { View, Text, ScrollView, Platform, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { useConnect } from 'thirdweb/react';
import { inAppWallet, preAuthenticate } from 'thirdweb/wallets/in-app';
import { ArrowRight, ChevronLeft, Music, User, Mail, Globe, Mic2 } from 'lucide-react-native';

import AnimatedPressable from '../../src/components/shared/AnimatedPressable';
import { FormField, TextFormInput, RadioGroup, SelectField } from '../../src/components/form';
import { useTheme } from '../../src/context/ThemeContext';
import { useAuth } from '../../src/context/AuthContext';
import { upgradeToCreator } from '../../src/services/database';
import { thirdwebClient, activeChain, supportedWallets } from '../../src/lib/thirdweb';
import {
    CREATOR_TYPES,
    ENABLED_CREATOR_TYPES,
    CREATOR_TYPE_LABELS,
    COUNTRIES,
    type CreatorType,
} from '../../src/types/creator';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const COUNTRY_OPTIONS = COUNTRIES.map((c) => ({ value: c, label: c }));

interface ArtistForm {
    legalFullName: string;
    stageName: string;
    email: string;
    country: string;
    creatorType: CreatorType;
}

export default function ArtistLoginScreen() {
    // Web only — if on mobile, show blocked message
    if (Platform.OS !== 'web') {
        return <MobileBlockedMessage />;
    }

    return <WebArtistLogin />;
}

/* ─── Mobile Blocked ─── */
function MobileBlockedMessage() {
    const { colors } = useTheme();
    const router = useRouter();

    return (
        <View style={{ flex: 1, backgroundColor: '#030711', justifyContent: 'center', alignItems: 'center', padding: 32 }}>
            <Text style={{ fontSize: 48, marginBottom: 20 }}>🎤</Text>
            <Text style={{ fontSize: 22, fontWeight: '800', color: '#f1f5f9', textAlign: 'center', marginBottom: 12 }}>
                Artist Dashboard{'\n'}Desktop Only
            </Text>
            <Text style={{ fontSize: 15, color: '#94a3b8', textAlign: 'center', lineHeight: 22, marginBottom: 32, maxWidth: 300 }}>
                The Artist Dashboard is available on desktop only. Please visit the artist login page on your computer.
            </Text>
            <AnimatedPressable
                preset="button"
                onPress={() => router.replace('/(auth)/login')}
                style={{
                    backgroundColor: 'rgba(255,255,255,0.06)',
                    paddingHorizontal: 28, paddingVertical: 14,
                    borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
                }}
            >
                <Text style={{ color: '#f1f5f9', fontWeight: '600', fontSize: 14 }}>Go to Listener Login</Text>
            </AnimatedPressable>
        </View>
    );
}

/* ─── Web Artist Login ─── */
function WebArtistLogin() {
    const router = useRouter();
    const { isDark, colors } = useTheme();
    const { isConnected, isLoading, walletAddress, role, profile, refreshProfile } = useAuth();

    const { connect, isConnecting } = useConnect();
    const [step, setStep] = useState<1 | 2>(1);
    const [form, setForm] = useState<ArtistForm>({
        legalFullName: '',
        stageName: '',
        email: '',
        country: '',
        creatorType: 'artist',
    });
    const [errors, setErrors] = useState<Partial<Record<keyof ArtistForm, string>>>({});
    const [submitted, setSubmitted] = useState(false);
    const [saving, setSaving] = useState(false);

    const [otp, setOtp] = useState('');
    const [otpError, setOtpError] = useState('');
    const [otpSent, setOtpSent] = useState(false);
    const [resending, setResending] = useState(false);

    // Store form data in ref so the wallet-connect effect can access it
    const formRef = useRef(form);
    formRef.current = form;

    const update = <K extends keyof ArtistForm>(key: K, value: ArtistForm[K]) => {
        setForm((prev) => ({ ...prev, [key]: value }));
        if (submitted) setErrors((prev) => ({ ...prev, [key]: undefined }));
    };

    const validate = (): boolean => {
        const e: Partial<Record<keyof ArtistForm, string>> = {};
        if (!form.legalFullName.trim()) e.legalFullName = 'Legal name is required';
        if (!form.stageName.trim()) e.stageName = 'Stage name is required';
        if (!form.email.trim()) e.email = 'Email is required';
        else if (!EMAIL_REGEX.test(form.email)) e.email = 'Enter a valid email';
        if (!form.country) e.country = 'Please select your country';
        setErrors(e);
        return Object.keys(e).length === 0;
    };

    const sendOtp = async () => {
        try {
            await preAuthenticate({
                client: thirdwebClient,
                strategy: 'email',
                email: formRef.current.email.trim(),
            });
            setOtpSent(true);
            return true;
        } catch (err) {
            console.error('[artist-login] preAuthenticate error:', err);
            return false;
        }
    };

    const handleNext = async () => {
        setSubmitted(true);
        if (validate()) {
            setSaving(true);
            const sent = await sendOtp();
            setSaving(false);
            if (!sent) {
                setOtpError('Failed to send verification code. Please try again.');
            }
            setStep(2);
        }
    };

    const handleResendOtp = async () => {
        setResending(true);
        setOtpError('');
        const sent = await sendOtp();
        setResending(false);
        if (!sent) {
            setOtpError('Failed to resend code. Please try again.');
        }
    };

    const handleVerifyOtp = async () => {
        if (!otp || otp.length < 6) {
            setOtpError('Please enter the 6-digit code');
            return;
        }
        setOtpError('');
        try {
            const wallet = inAppWallet();
            await connect(async () => {
                await wallet.connect({
                    client: thirdwebClient,
                    strategy: 'email',
                    email: formRef.current.email.trim(),
                    verificationCode: otp,
                });
                return wallet;
            });
        } catch (err: any) {
            setOtpError(err.message || 'Verification failed. Please check the code.');
        }
    };

    // Handle wallet connection states:
    // 1. Returning artist: already creator → dashboard
    // 2. New artist: AuthContext creates listener profile first → then we upgrade to creator
    useEffect(() => {
        if (!isConnected || isLoading) return; // wait for AuthContext to finish

        if (role === 'creator') {
            // Already a creator (returning artist) → go to dashboard
            router.replace('/(artist)/dashboard');
            return;
        }

        // New artist on step 2: AuthContext finished, profile exists as 'listener'
        // Now upgrade it to 'creator' with the collected info
        if (step === 2 && walletAddress && profile) {
            (async () => {
                setSaving(true);
                const f = formRef.current;
                const result = await upgradeToCreator(profile.id, {
                    displayName: f.stageName.trim(),
                    email: f.email.trim(),
                    creatorType: f.creatorType,
                    country: f.country,
                });

                if (result) {
                    await refreshProfile();
                    router.replace('/(artist)/dashboard');
                } else {
                    alert('Could not create your artist profile. Please check your connection and try again.');
                    setSaving(false);
                }
            })();
        }
    }, [isConnected, isLoading, role, step, walletAddress, profile]);

    // Show syncing state
    if (saving || (isConnected && isLoading)) {
        return (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#030711' }}>
                <ActivityIndicator size="large" color="#38b4ba" />
                <Text style={{ color: '#94a3b8', marginTop: 16, fontSize: 14 }}>
                    Setting up your artist profile...
                </Text>
            </View>
        );
    }

    const creatorTypeOptions = CREATOR_TYPES.map((t) => ({
        value: t,
        label: CREATOR_TYPE_LABELS[t],
        disabled: !ENABLED_CREATOR_TYPES.includes(t),
    }));

    return (
        <View style={{ flex: 1, flexDirection: 'row', backgroundColor: '#030711' }}>
            {/* Left branding panel */}
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 60 }}>
                <Image
                    source={require('../../assets/mu6-logo-white.png')}
                    style={{ width: 100, height: 100, marginBottom: 20 }}
                    contentFit="contain"
                />
                <Text style={{ fontSize: 18, color: '#f1f5f9', letterSpacing: 4 } as any}>
                    MUSIC. OWNED.
                </Text>
                <Text style={{ fontSize: 14, color: '#64748b', marginTop: 12, textAlign: 'center', maxWidth: 280 }}>
                    {step === 1
                        ? 'Tell us about yourself to get started as an artist on MU6.'
                        : 'Connect your wallet to complete registration.'}
                </Text>

                {/* Step indicator */}
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 32 }}>
                    <View style={{
                        width: 36, height: 4, borderRadius: 2,
                        backgroundColor: '#38b4ba',
                    }} />
                    <View style={{
                        width: 36, height: 4, borderRadius: 2,
                        backgroundColor: step === 2 ? '#38b4ba' : 'rgba(255,255,255,0.1)',
                    }} />
                </View>
                <Text style={{ color: '#64748b', fontSize: 12, marginTop: 8 }}>
                    Step {step} of 2
                </Text>
            </View>

            {/* Right form panel */}
            <View style={{ flex: 1, justifyContent: 'center', padding: 40 }}>
                <ScrollView
                    contentContainerStyle={{ maxWidth: 480, width: '100%', alignSelf: 'center' }}
                    showsVerticalScrollIndicator={false}
                >
                    {step === 1 ? (
                        /* ━━━ STEP 1: Artist Info ━━━ */
                        <>
                            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                                <View style={{
                                    width: 40, height: 40, borderRadius: 12,
                                    backgroundColor: 'rgba(56,180,186,0.1)',
                                    alignItems: 'center', justifyContent: 'center', marginRight: 12,
                                }}>
                                    <Mic2 size={20} color="#38b4ba" />
                                </View>
                                <Text style={{ fontSize: 28, fontWeight: '800', color: '#f1f5f9', letterSpacing: -0.5 }}>
                                    Artist Registration
                                </Text>
                            </View>
                            <Text style={{ fontSize: 15, color: '#94a3b8', marginBottom: 32 }}>
                                A few details before we set up your artist profile.
                            </Text>

                            <FormField label="Legal Full Name" required error={errors.legalFullName}>
                                <TextFormInput
                                    value={form.legalFullName}
                                    onChangeText={(v) => update('legalFullName', v)}
                                    placeholder="Enter your full legal name"
                                />
                            </FormField>

                            <FormField label="Stage / Artist Name" required error={errors.stageName}>
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

                            <FormField label="Country" required error={errors.country} style={{ zIndex: 20 }}>
                                <SelectField
                                    options={COUNTRY_OPTIONS}
                                    value={form.country}
                                    onChange={(v) => update('country', v)}
                                    placeholder="Select your country"
                                />
                            </FormField>

                            <FormField label="Creator Type" style={{ zIndex: 10 }}>
                                <SelectField
                                    options={creatorTypeOptions}
                                    value={form.creatorType}
                                    onChange={(v) => update('creatorType', v as CreatorType)}
                                    placeholder="Select creator type"
                                />
                            </FormField>

                            <AnimatedPressable
                                preset="button"
                                onPress={handleNext}
                                style={{
                                    backgroundColor: '#38b4ba',
                                    borderRadius: 14,
                                    paddingVertical: 16,
                                    alignItems: 'center',
                                    flexDirection: 'row',
                                    justifyContent: 'center',
                                    marginTop: 12,
                                    shadowColor: '#38b4ba',
                                    shadowOffset: { width: 0, height: 4 },
                                    shadowOpacity: 0.3,
                                    shadowRadius: 12,
                                    zIndex: 1,
                                    position: 'relative'
                                }}
                            >
                                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15, marginRight: 8 }}>
                                    Continue
                                </Text>
                                <ArrowRight size={18} color="#fff" />
                            </AnimatedPressable>

                            {/* Back to listener login link */}
                            <AnimatedPressable
                                preset="button"
                                onPress={() => router.push('/(auth)/login')}
                                style={{ alignItems: 'center', marginTop: 20 }}
                            >
                                <Text style={{ fontSize: 13, color: '#64748b' }}>
                                    Not an artist? <Text style={{ color: '#38b4ba', fontWeight: '600' }}>Login as listener</Text>
                                </Text>
                            </AnimatedPressable>
                        </>
                    ) : (
                        /* ━━━ STEP 2: Connect Wallet ━━━ */
                        <>
                            <AnimatedPressable
                                preset="icon"
                                hapticType="none"
                                onPress={() => setStep(1)}
                                style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 24 }}
                            >
                                <ChevronLeft size={20} color="#94a3b8" />
                                <Text style={{ color: '#94a3b8', fontSize: 14, marginLeft: 4 }}>Back to info</Text>
                            </AnimatedPressable>

                            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                                <View style={{
                                    width: 40, height: 40, borderRadius: 12,
                                    backgroundColor: 'rgba(139,92,246,0.1)',
                                    alignItems: 'center', justifyContent: 'center', marginRight: 12,
                                }}>
                                    <Music size={20} color="#8b5cf6" />
                                </View>
                                <Text style={{ fontSize: 28, fontWeight: '800', color: '#f1f5f9', letterSpacing: -0.5 }}>
                                    Connect Wallet
                                </Text>
                            </View>
                            <Text style={{ fontSize: 15, color: '#94a3b8', marginBottom: 8 }}>
                                Welcome, <Text style={{ color: '#f1f5f9', fontWeight: '600' }}>{form.stageName || 'Artist'}</Text>!
                                {' '}Connect your wallet to finish setting up.
                            </Text>
                            <Text style={{ fontSize: 13, color: '#64748b', marginBottom: 28 }}>
                                A wallet will be auto-created for you if you sign in with email or social.
                            </Text>

                            {/* Summary of collected info */}
                            <View style={{
                                backgroundColor: 'rgba(255,255,255,0.03)',
                                borderRadius: 14, padding: 16, marginBottom: 24,
                                borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
                            }}>
                                <Text style={{ fontSize: 11, color: '#64748b', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
                                    Your Info
                                </Text>
                                {[
                                    { icon: User, label: form.stageName },
                                    { icon: Mail, label: form.email },
                                    { icon: Globe, label: form.country || '—' },
                                ].map((item, i) => (
                                    <View key={i} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: i < 2 ? 8 : 0 }}>
                                        <item.icon size={14} color="#64748b" style={{ marginRight: 10 }} />
                                        <Text style={{ color: '#94a3b8', fontSize: 13 }}>{item.label}</Text>
                                    </View>
                                ))}
                            </View>

                            {/* OTP Entry — email auto-filled from Step 1 */}
                            <View style={{
                                backgroundColor: 'rgba(255,255,255,0.03)',
                                borderRadius: 14, padding: 20, marginBottom: 24,
                                borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
                            }}>
                                <Text style={{ fontSize: 14, fontWeight: '600', color: '#f1f5f9', marginBottom: 12 }}>
                                    Enter Verification Code
                                </Text>
                                <Text style={{ fontSize: 13, color: '#94a3b8', marginBottom: 4 }}>
                                    We sent a 6-digit code to:
                                </Text>
                                <Text style={{ fontSize: 14, fontWeight: '600', color: '#38b4ba', marginBottom: 16 }}>
                                    {form.email}
                                </Text>

                                <TextFormInput
                                    value={otp}
                                    onChangeText={setOtp}
                                    placeholder="000000"
                                    keyboardType="numeric"
                                    maxLength={6}
                                />
                                {otpError ? (
                                    <Text style={{ color: '#ef4444', fontSize: 12, marginTop: 8 }}>{otpError}</Text>
                                ) : null}

                                <AnimatedPressable
                                    preset="button"
                                    onPress={handleVerifyOtp}
                                    style={{
                                        backgroundColor: '#38b4ba',
                                        borderRadius: 14,
                                        paddingVertical: 16,
                                        alignItems: 'center',
                                        flexDirection: 'row',
                                        justifyContent: 'center',
                                        marginTop: 20,
                                    }}
                                >
                                    {isConnecting ? (
                                        <ActivityIndicator color="#fff" />
                                    ) : (
                                        <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>
                                            Verify & Connect
                                        </Text>
                                    )}
                                </AnimatedPressable>

                                <AnimatedPressable
                                    preset="button"
                                    onPress={handleResendOtp}
                                    disabled={resending}
                                    style={{ alignItems: 'center', marginTop: 16, opacity: resending ? 0.5 : 1 }}
                                >
                                    {resending ? (
                                        <ActivityIndicator size="small" color="#38b4ba" />
                                    ) : (
                                        <Text style={{ fontSize: 13, color: '#64748b' }}>
                                            Didn't receive it? <Text style={{ color: '#38b4ba', fontWeight: '600' }}>Resend Code</Text>
                                        </Text>
                                    )}
                                </AnimatedPressable>
                            </View>
                        </>
                    )}
                </ScrollView>
            </View>
        </View>
    );
}
