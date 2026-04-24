import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, Platform, ActivityIndicator, KeyboardAvoidingView } from 'react-native';
import { useRouter } from 'expo-router';
import { Shield, Lock, User, AlertCircle } from 'lucide-react-native';
import AnimatedPressable from '../src/components/shared/AnimatedPressable';
import { useAdminAuth } from '../src/context/AdminAuthContext';

const isWeb = Platform.OS === 'web';

export default function AdminLoginScreen() {
    const router = useRouter();
    const { isAdminLoggedIn, isAdminLoading, adminLogin } = useAdminAuth();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    // If already logged in, redirect to admin dashboard
    useEffect(() => {
        if (!isAdminLoading && isAdminLoggedIn) {
            router.replace('/(admin)/dashboard');
        }
    }, [isAdminLoading, isAdminLoggedIn]);

    const handleLogin = async () => {
        if (!email.trim() || !password.trim()) {
            setError('Please enter both email and password');
            return;
        }
        setError('');
        setLoading(true);
        const result = await adminLogin(email.trim(), password);
        setLoading(false);
        if (result.success) {
            router.replace('/(admin)/dashboard');
        } else {
            setError(result.error || 'Login failed');
        }
    };

    if (isAdminLoading) {
        return (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#030711' }}>
                <ActivityIndicator size="large" color="#38b4ba" />
            </View>
        );
    }

    return (
        <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={{ flex: 1, backgroundColor: '#030711' }}
        >
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
                <View style={{
                    width: '100%',
                    maxWidth: 400,
                    backgroundColor: '#0f1724',
                    borderRadius: 24,
                    padding: isWeb ? 48 : 32,
                    borderWidth: 1,
                    borderColor: 'rgba(255,255,255,0.06)',
                    shadowColor: '#38b4ba',
                    shadowOffset: { width: 0, height: 0 },
                    shadowOpacity: 0.1,
                    shadowRadius: 40,
                }}>
                    {/* Logo */}
                    <View style={{ alignItems: 'center', marginBottom: 32 }}>
                        <View style={{
                            width: 64, height: 64, borderRadius: 32,
                            backgroundColor: 'rgba(56,180,186,0.1)',
                            alignItems: 'center', justifyContent: 'center',
                            marginBottom: 16,
                        }}>
                            <Shield size={32} color="#38b4ba" />
                        </View>
                        <Text style={{
                            fontSize: 28, fontWeight: '800', color: '#f1f5f9',
                            letterSpacing: -2, fontStyle: 'italic',
                        }}>
                            MU6
                        </Text>
                        <Text style={{ fontSize: 13, color: '#94a3b8', marginTop: 4, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase' }}>
                            Admin Portal
                        </Text>
                    </View>

                    {/* Error */}
                    {error ? (
                        <View style={{
                            flexDirection: 'row', alignItems: 'center',
                            backgroundColor: 'rgba(239,68,68,0.1)',
                            borderRadius: 12, padding: 12, marginBottom: 20,
                            borderWidth: 1, borderColor: 'rgba(239,68,68,0.2)',
                        }}>
                            <AlertCircle size={16} color="#f87171" />
                            <Text style={{ color: '#f87171', fontSize: 13, marginLeft: 8, flex: 1 }}>{error}</Text>
                        </View>
                    ) : null}

                    {/* Email */}
                    <View style={{ marginBottom: 16 }}>
                        <Text style={{ color: '#94a3b8', fontSize: 12, fontWeight: '600', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>
                            Email
                        </Text>
                        <View style={{
                            flexDirection: 'row', alignItems: 'center',
                            backgroundColor: 'rgba(255,255,255,0.04)',
                            borderRadius: 12, borderWidth: 1,
                            borderColor: 'rgba(255,255,255,0.08)',
                            paddingHorizontal: 14,
                        }}>
                            <User size={18} color="#475569" />
                            <TextInput
                                value={email}
                                onChangeText={setEmail}
                                placeholder="Enter email"
                                placeholderTextColor="#475569"
                                autoCapitalize="none"
                                autoCorrect={false}
                                keyboardType="email-address"
                                textContentType="emailAddress"
                                style={{
                                    flex: 1, padding: 14, color: '#f1f5f9', fontSize: 15,
                                    ...(isWeb ? { outlineStyle: 'none' } as any : {}),
                                }}
                            />
                        </View>
                    </View>

                    {/* Password */}
                    <View style={{ marginBottom: 24 }}>
                        <Text style={{ color: '#94a3b8', fontSize: 12, fontWeight: '600', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>
                            Password
                        </Text>
                        <View style={{
                            flexDirection: 'row', alignItems: 'center',
                            backgroundColor: 'rgba(255,255,255,0.04)',
                            borderRadius: 12, borderWidth: 1,
                            borderColor: 'rgba(255,255,255,0.08)',
                            paddingHorizontal: 14,
                        }}>
                            <Lock size={18} color="#475569" />
                            <TextInput
                                value={password}
                                onChangeText={setPassword}
                                placeholder="Enter password"
                                placeholderTextColor="#475569"
                                secureTextEntry
                                autoCapitalize="none"
                                autoCorrect={false}
                                onSubmitEditing={handleLogin}
                                style={{
                                    flex: 1, padding: 14, color: '#f1f5f9', fontSize: 15,
                                    ...(isWeb ? { outlineStyle: 'none' } as any : {}),
                                }}
                            />
                        </View>
                    </View>

                    {/* Login Button */}
                    <AnimatedPressable
                        preset="card"
                        hapticType="none"
                        onPress={handleLogin}
                        style={{
                            backgroundColor: '#38b4ba',
                            borderRadius: 14,
                            paddingVertical: 16,
                            alignItems: 'center',
                            opacity: loading ? 0.7 : 1,
                        }}
                    >
                        {loading ? (
                            <ActivityIndicator size="small" color="#fff" />
                        ) : (
                            <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>Sign In</Text>
                        )}
                    </AnimatedPressable>

                    <Text style={{ color: '#475569', fontSize: 11, textAlign: 'center', marginTop: 20 }}>
                        Authorized personnel only
                    </Text>
                </View>
            </View>
        </KeyboardAvoidingView>
    );
}
