import React, { useState, useEffect } from 'react';
import {
    View, Text, TextInput, ScrollView, Platform, Alert,
    ActivityIndicator, KeyboardAvoidingView,
} from 'react-native';
import AnimatedPressable from '../../src/components/shared/AnimatedPressable';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ChevronLeft, Check, User, AlertCircle, Camera, ImagePlus } from 'lucide-react-native';
import { useTheme } from '../../src/context/ThemeContext';
import { useAuth } from '../../src/context/AuthContext';
import { updateProfile } from '../../src/services/auth';
import { useProfiles } from 'thirdweb/react';
import { thirdwebClient } from '../../src/lib/thirdweb';
import { SelectField } from '../../src/components/form';
import { COUNTRIES } from '../../src/types/creator';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { supabase } from '../../src/lib/supabase';

const isWeb = Platform.OS === 'web';
const isAndroid = Platform.OS === 'android';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!;

async function uploadToStorage(
    bucket: string, filePath: string, fileUri: string, contentType: string
): Promise<string | null> {
    try {
        // Convert file URI to ArrayBuffer for reliable cross-platform upload
        const response = await fetch(fileUri);
        const arrayBuffer = await response.arrayBuffer();

        const { data, error } = await supabase.storage
            .from(bucket)
            .upload(filePath, arrayBuffer, {
                contentType,
                upsert: true,
            });

        if (error) {
            console.error('[upload] uploadToStorage error:', error.message);
            return null;
        }
        return data?.path || filePath;
    } catch (err: any) {
        console.error('[upload] uploadToStorage error:', err?.message);
        return null;
    }
}

const COUNTRY_OPTIONS = COUNTRIES.map((c) => ({ value: c, label: c }));

/* ─── Default avatar for users who haven't uploaded ─── */
const DEFAULT_AVATAR = { id: 'default', emoji: '🎵', gradient: ['#38b4ba', '#0d9488'] };

function AvatarCircle({ emoji, gradient, size = 80 }: {
    emoji: string; gradient: string[]; size?: number;
}) {
    return (
        <View style={{
            width: size, height: size, borderRadius: size / 2,
            backgroundColor: gradient[0],
            alignItems: 'center', justifyContent: 'center',
        }}>
            <Text style={{ fontSize: size * 0.45 }}>{emoji}</Text>
        </View>
    );
}

export default function EditArtistProfileScreen() {
    const router = useRouter();
    const { isDark, colors } = useTheme();
    const { profile, refreshProfile } = useAuth();
    
    const { data: linkedProfiles } = useProfiles({ client: thirdwebClient });
    const thirdwebProfile = linkedProfiles?.find(p => p.type === 'email' || p.type === 'google' || p.type === 'apple');
    const userEmail = profile?.email || thirdwebProfile?.details?.email || 'No email associated';

    const [saving, setSaving] = useState(false);
    const [displayName, setDisplayName] = useState('');
    const [bio, setBio] = useState('');
    const [country, setCountry] = useState('');
    
    // Image states
    const [avatarUri, setAvatarUri] = useState<string | null>(null);
    const [avatarFile, setAvatarFile] = useState<any>(null);
    const [coverUri, setCoverUri] = useState<string | null>(null);
    const [coverFile, setCoverFile] = useState<any>(null);

    useEffect(() => {
        if (profile) {
            setDisplayName(profile.displayName || '');
            setBio(profile.bio || '');
            setCountry(profile.country || '');
            if (profile.avatarPath) {
                setAvatarUri(`${SUPABASE_URL}/storage/v1/object/public/avatars/${profile.avatarPath}`);
            }
            if (profile.coverPath) {
                setCoverUri(`${SUPABASE_URL}/storage/v1/object/public/covers/${profile.coverPath}`);
            }
        }
    }, [profile]);

    const pickAvatar = async () => {
        try {
            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ['images'],
                allowsEditing: true,
                aspect: [1, 1],
                quality: 0.8,
            });
            if (result.canceled || !result.assets?.length) return;
            const asset = result.assets[0];
            const ext = asset.uri.split('.').pop() || 'jpg';
            setAvatarUri(asset.uri);
            setAvatarFile({ uri: asset.uri, name: `avatar.${ext}`, mimeType: asset.mimeType || 'image/jpeg' });
        } catch (e) {
            console.error('[edit-artist-profile] pick avatar error:', e);
        }
    };

    const pickCover = async () => {
        try {
            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ['images'],
                allowsEditing: true,
                aspect: [16, 9],
                quality: 0.8,
            });
            if (result.canceled || !result.assets?.length) return;
            const asset = result.assets[0];
            const ext = asset.uri.split('.').pop() || 'jpg';
            setCoverUri(asset.uri);
            setCoverFile({ uri: asset.uri, name: `cover.${ext}`, mimeType: asset.mimeType || 'image/jpeg' });
        } catch (e) {
            console.error('[edit-artist-profile] pick cover error:', e);
        }
    };

    const handleSave = async () => {
        if (!profile?.id) return;
        if (!displayName.trim()) {
            const msg = 'Display name is required.';
            Platform.OS === 'web' ? alert(msg) : Alert.alert('Error', msg);
            return;
        }

        setSaving(true);
        try {
            let newAvatarPath = profile.avatarPath;
            let newCoverPath = profile.coverPath;

            if (avatarFile) {
                const ext = avatarFile.name.split('.').pop() || 'jpg';
                const fName = `${profile.id}_avatar_${Date.now()}.${ext}`;
                console.log('[edit-artist-profile] Uploading avatar:', fName);
                const path = await uploadToStorage('avatars', fName, avatarFile.uri, avatarFile.mimeType);
                console.log('[edit-artist-profile] Avatar upload result:', path);
                if (path) newAvatarPath = path;
            }

            if (coverFile) {
                const ext = coverFile.name.split('.').pop() || 'jpg';
                const fName = `${profile.id}_cover_${Date.now()}.${ext}`;
                console.log('[edit-artist-profile] Uploading cover:', fName);
                const path = await uploadToStorage('covers', fName, coverFile.uri, coverFile.mimeType);
                console.log('[edit-artist-profile] Cover upload result:', path);
                if (path) newCoverPath = path;
            }

            // Build update payload — only include fields that have values
            const updates: Record<string, any> = {
                display_name: displayName.trim(),
            };
            if (bio.trim()) updates.bio = bio.trim();
            if (country) updates.country = country;
            if (newAvatarPath) updates.avatar_path = newAvatarPath;
            if (newCoverPath) updates.cover_path = newCoverPath;

            console.log('[edit-artist-profile] Updating profile:', profile.id, updates);
            const updated = await updateProfile(profile.id, updates);
            console.log('[edit-artist-profile] Update result:', updated);

            if (updated) {
                await refreshProfile();
                const msg = 'Profile updated successfully!';
                Platform.OS === 'web' ? alert(msg) : Alert.alert('Success', msg);
                router.back();
            } else {
                const msg = 'Failed to update profile. Please try again.';
                Platform.OS === 'web' ? alert(msg) : Alert.alert('Error', msg);
            }
        } catch (err: any) {
            console.error('[edit-artist-profile] save error:', err);
            const msg = `Error: ${err?.message || 'An unexpected error occurred.'}`;
            Platform.OS === 'web' ? alert(msg) : Alert.alert('Error', msg);
        } finally {
            setSaving(false);
        }
    };

    const cardBg = isDark
        ? (isAndroid ? 'rgba(20,30,50,0.95)' : 'rgba(255,255,255,0.08)')
        : (isWeb ? '#fff' : 'rgba(255,255,255,0.5)');
    const cardBorder = isDark ? 'rgba(255,255,255,0.08)' : (isWeb ? '#e2e8f0' : 'rgba(255,255,255,0.4)');
    const inputStyle = {
        fontSize: 16, color: colors.text.primary,
        backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#f8fafc',
        borderRadius: 12, padding: 14, borderWidth: 1,
        borderColor: isDark ? 'rgba(255,255,255,0.1)' : '#e2e8f0',
    };

    const Container = isWeb ? View : SafeAreaView;

    return (
        <Container style={{ flex: 1, backgroundColor: isWeb ? (isDark ? '#030711' : '#f1f5f9') : 'transparent' }}>
            <KeyboardAvoidingView
                style={{ flex: 1 }}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            >
                <ScrollView
                    style={{ flex: 1 }}
                    contentContainerStyle={{
                        padding: isWeb ? 40 : 16, paddingBottom: 80,
                        maxWidth: isWeb ? 700 : undefined,
                        width: '100%' as any, alignSelf: 'center' as any,
                    }}
                    showsVerticalScrollIndicator={false}
                >
                    {/* Header */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 28 }}>
                        <AnimatedPressable
                            preset="icon"
                            onPress={() => router.back()}
                            style={{
                                width: 40, height: 40, borderRadius: 20, marginRight: 14,
                                backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)',
                                alignItems: 'center', justifyContent: 'center',
                            }}
                        >
                            <ChevronLeft size={22} color={colors.text.primary} />
                        </AnimatedPressable>
                        <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: isWeb ? 28 : 24, fontWeight: '800', color: colors.text.primary, letterSpacing: -0.5 }}>
                                Edit Profile
                            </Text>
                            <Text style={{ fontSize: 13, color: colors.text.secondary, marginTop: 2 }}>
                                Update your artist information
                            </Text>
                        </View>
                    </View>

                    {/* Cover & Avatar Photo Section */}
                    <View style={{
                        height: 200, backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#e2e8f0',
                        borderRadius: 20, marginBottom: 60,
                        borderWidth: 1, borderColor: cardBorder, position: 'relative'
                    }}>
                        {/* Cover Image */}
                        <View style={{ flex: 1, borderRadius: 20, overflow: 'hidden' }}>
                            {coverUri ? (
                                <Image source={{ uri: coverUri }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
                            ) : (
                                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                                    <ImagePlus size={32} color={colors.text.muted} />
                                </View>
                            )}
                        </View>
                        
                        {/* Edit Cover Button */}
                        <AnimatedPressable onPress={pickCover} style={{
                            position: 'absolute', top: 16, right: 16,
                            backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 16, paddingVertical: 10,
                            borderRadius: 14, flexDirection: 'row', alignItems: 'center', gap: 8
                        }}>
                            <Camera size={16} color="#fff" />
                            <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>Edit Cover</Text>
                        </AnimatedPressable>
                        
                        {/* Avatar Image (Overlapped) */}
                        <View style={{
                            position: 'absolute', bottom: -50, left: 24, zIndex: 10
                        }}>
                            <AnimatedPressable onPress={pickAvatar} style={{
                                width: 100, height: 100, borderRadius: 50,
                                backgroundColor: cardBg,
                                borderWidth: 4, borderColor: cardBg,
                                overflow: 'hidden', alignItems: 'center', justifyContent: 'center'
                            }}>
                                {avatarUri ? (
                                    <Image source={{ uri: avatarUri }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
                                ) : (
                                    <AvatarCircle emoji={DEFAULT_AVATAR.emoji} gradient={DEFAULT_AVATAR.gradient} size={100} />
                                )}
                                <View style={{ position: 'absolute', bottom: 0, width: '100%', backgroundColor: 'rgba(0,0,0,0.6)', paddingVertical: 6, alignItems: 'center' }}>
                                     <Camera size={16} color="#fff" />
                                </View>
                            </AnimatedPressable>
                        </View>
                    </View>

                    {/* Display Name */}
                    <View style={{
                        backgroundColor: cardBg, borderRadius: 20, padding: isWeb ? 28 : 20,
                        marginBottom: 16, borderWidth: 1, borderColor: cardBorder,
                    }}>
                        <Text style={{ fontSize: 14, fontWeight: '700', color: colors.text.primary, marginBottom: 8 }}>
                            Artist / Stage Name *
                        </Text>
                        <TextInput
                            value={displayName}
                            onChangeText={setDisplayName}
                            placeholder="Your artist name"
                            placeholderTextColor={colors.text.muted}
                            style={inputStyle}
                        />
                    </View>

                    {/* Email Display */}
                    <View style={{
                        backgroundColor: cardBg, borderRadius: 20, padding: isWeb ? 28 : 20,
                        marginBottom: 16, borderWidth: 1, borderColor: cardBorder,
                    }}>
                        <Text style={{ fontSize: 14, fontWeight: '700', color: colors.text.primary, marginBottom: 8 }}>
                            Email Address
                        </Text>
                        <TextInput
                            value={userEmail}
                            editable={false}
                            style={{
                                ...inputStyle,
                                color: colors.text.secondary,
                                backgroundColor: isDark ? 'rgba(255,255,255,0.02)' : '#f8fafc',
                                borderColor: isDark ? 'rgba(255,255,255,0.05)' : '#e2e8f0',
                                opacity: 0.7,
                            }}
                        />
                        <Text style={{ fontSize: 12, color: colors.text.muted, marginTop: 8 }}>
                            Your email address cannot be changed here
                        </Text>
                    </View>

                    {/* Bio */}
                    <View style={{
                        backgroundColor: cardBg, borderRadius: 20, padding: isWeb ? 28 : 20,
                        marginBottom: 16, borderWidth: 1, borderColor: cardBorder,
                    }}>
                        <Text style={{ fontSize: 14, fontWeight: '700', color: colors.text.primary, marginBottom: 8 }}>
                            Bio
                        </Text>
                        <TextInput
                            value={bio}
                            onChangeText={setBio}
                            placeholder="Tell your fans about yourself..."
                            placeholderTextColor={colors.text.muted}
                            multiline
                            numberOfLines={4}
                            style={{
                                ...inputStyle,
                                minHeight: 100, textAlignVertical: 'top',
                            }}
                        />
                    </View>

                    {/* Country Dropdown — Bug #005 */}
                    <View style={{
                        backgroundColor: cardBg, borderRadius: 20, padding: isWeb ? 28 : 20,
                        marginBottom: 24, borderWidth: 1, borderColor: cardBorder,
                        zIndex: 10,
                    }}>
                        <Text style={{ fontSize: 14, fontWeight: '700', color: colors.text.primary, marginBottom: 8 }}>
                            Country
                        </Text>
                        <SelectField
                            options={COUNTRY_OPTIONS}
                            value={country}
                            onChange={setCountry}
                            placeholder="Select your country"
                            searchable
                        />
                        <View style={{
                            flexDirection: 'row', alignItems: 'center',
                            marginTop: 10, paddingHorizontal: 4,
                        }}>
                            <AlertCircle size={12} color={colors.text.muted} style={{ marginRight: 6 }} />
                            <Text style={{ fontSize: 11, color: colors.text.muted }}>
                                Country can only be changed once every 30 days
                            </Text>
                        </View>
                    </View>

                    {/* Save Button */}
                    <AnimatedPressable
                        preset="button"
                        onPress={handleSave}
                        style={{
                            flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                            backgroundColor: '#38b4ba', borderRadius: 16,
                            paddingVertical: 16, gap: 8,
                            shadowColor: '#38b4ba', shadowOffset: { width: 0, height: 8 },
                            shadowOpacity: 0.3, shadowRadius: 16, elevation: 6,
                            opacity: saving ? 0.7 : 1,
                        }}
                    >
                        {saving ? (
                            <ActivityIndicator size="small" color="#fff" />
                        ) : (
                            <>
                                <Check size={20} color="#fff" />
                                <Text style={{ fontSize: 16, fontWeight: '700', color: '#fff' }}>Save Changes</Text>
                            </>
                        )}
                    </AnimatedPressable>
                </ScrollView>
            </KeyboardAvoidingView>
        </Container>
    );
}
