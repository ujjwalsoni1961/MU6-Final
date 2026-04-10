import React, { useState, useEffect } from 'react';
import {
    View, Text, TextInput, ScrollView, Platform, Alert,
    ActivityIndicator, KeyboardAvoidingView, Switch,
} from 'react-native';
import AnimatedPressable from '../../src/components/shared/AnimatedPressable';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronLeft, Check, ImagePlus, Trash2 } from 'lucide-react-native';
import * as DocumentPicker from 'expo-document-picker';
import { useTheme } from '../../src/context/ThemeContext';
import { useAuth } from '../../src/context/AuthContext';
import { getSongById, updateSong, getPublicUrl } from '../../src/services/database';
import {
    FormField,
    TextFormInput,
    SelectField,
} from '../../src/components/form';
import { GENRES } from '../../src/types/creator';

const isWeb = Platform.OS === 'web';
const isAndroid = Platform.OS === 'android';

interface PickedFile {
    uri: string;
    name: string;
    mimeType?: string;
}

async function pickCoverImage(): Promise<PickedFile | null> {
    try {
        const result = await DocumentPicker.getDocumentAsync({ type: ['image/*'], copyToCacheDirectory: true });
        if (result.canceled || !result.assets?.length) return null;
        const asset = result.assets[0];
        return { uri: asset.uri, name: asset.name, mimeType: asset.mimeType || 'image/jpeg' };
    } catch { return null; }
}

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

async function uploadToStorage(bucket: string, filePath: string, fileUri: string, contentType: string, walletAddress?: string): Promise<string | null> {
    try {
        const response = await fetch(fileUri);
        const blob = await response.blob();

        const formData = new FormData();
        formData.append('file', blob, filePath.split('/').pop() || 'file');
        formData.append('bucket', bucket);
        formData.append('path', filePath);
        formData.append('walletAddress', walletAddress || '');
        formData.append('contentType', contentType);

        const uploadUrl = `${SUPABASE_URL}/functions/v1/upload-file`;
        const res = await fetch(uploadUrl, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
            body: formData,
        });

        const result = await res.json();
        if (!res.ok || !result.success) {
            console.error('[edit-song] upload error:', result.error || result);
            return null;
        }
        return result.path || filePath;
    } catch (err) { console.error('[edit-song] upload exception:', err); return null; }
}

function formatDuration(seconds: number | null): string {
    if (!seconds) return '';
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
}

function parseDuration(str: string): number | null {
    const match = str.match(/^(\d{1,3}):(\d{2})$/);
    if (!match) return null;
    return parseInt(match[1]) * 60 + parseInt(match[2]);
}

export default function EditSongScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const router = useRouter();
    const { isDark, colors } = useTheme();
    const { profile } = useAuth();

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [deleting, setDeleting] = useState(false);

    // Form state  
    const [title, setTitle] = useState('');
    const [album, setAlbum] = useState('');
    const [genre, setGenre] = useState('');
    const [duration, setDuration] = useState('');
    const [description, setDescription] = useState('');
    const [lyrics, setLyrics] = useState('');
    const [isPublished, setIsPublished] = useState(false);
    const [coverImage, setCoverImage] = useState<string | null>(null);
    const [newCoverFile, setNewCoverFile] = useState<PickedFile | null>(null);

    useEffect(() => {
        if (!id) return;
        (async () => {
            setLoading(true);
            const song = await getSongById(id);
            if (song) {
                setTitle(song.title || '');
                setAlbum(song.album || '');
                setGenre(song.genre || '');
                setDuration(formatDuration(song.durationSeconds));
                setDescription(song.description || '');
                setLyrics((song as any).lyrics || '');
                setIsPublished(song.isPublished);
                setCoverImage(song.coverPath || null);
            }
            setLoading(false);
        })();
    }, [id]);

    const handlePickCover = async () => {
        const file = await pickCoverImage();
        if (file) setNewCoverFile(file);
    };

    const handleSave = async () => {
        if (!id || !profile?.id) return;
        if (!title.trim()) {
            const msg = 'Title is required.';
            Platform.OS === 'web' ? alert(msg) : Alert.alert('Error', msg);
            return;
        }

        setSaving(true);
        try {
            let coverPath = coverImage;

            // Upload new cover if picked
            if (newCoverFile) {
                const ext = newCoverFile.name.split('.').pop() || 'jpg';
                const storagePath = `${profile.id}/${Date.now()}-cover.${ext}`;
                const uploaded = await uploadToStorage('covers', storagePath, newCoverFile.uri, newCoverFile.mimeType || 'image/jpeg', profile.walletAddress);
                if (uploaded) coverPath = uploaded;
            }

            const durationSec = parseDuration(duration);

            const updated = await updateSong(id, {
                title: title.trim(),
                album: album.trim() || null,
                genre: genre || null,
                durationSeconds: durationSec,
                description: description.trim() || null,
                coverPath: coverPath,
                isPublished,
            });

            if (updated) {
                const msg = 'Song updated successfully!';
                Platform.OS === 'web' ? alert(msg) : Alert.alert('Success', msg);
                router.back();
            } else {
                const msg = 'Failed to update song.';
                Platform.OS === 'web' ? alert(msg) : Alert.alert('Error', msg);
            }
        } catch (err) {
            console.error('[edit-song] save error:', err);
            const msg = 'An unexpected error occurred.';
            Platform.OS === 'web' ? alert(msg) : Alert.alert('Error', msg);
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!id) return;
        const doDelete = async () => {
            setDeleting(true);
            try {
                // Soft delete: unpublish the song
                await updateSong(id, { isPublished: false });
                const msg = 'Song has been unpublished.';
                Platform.OS === 'web' ? alert(msg) : Alert.alert('Done', msg);
                router.back();
            } finally {
                setDeleting(false);
            }
        };

        if (Platform.OS === 'web') {
            if (confirm('Are you sure you want to unpublish this song?')) doDelete();
        } else {
            Alert.alert('Unpublish Song', 'Are you sure? The song will be hidden from listeners.', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Unpublish', style: 'destructive', onPress: doDelete },
            ]);
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
    } as any;

    const Container = isWeb ? View : SafeAreaView;

    if (loading) {
        return (
            <Container style={{ flex: 1, backgroundColor: isWeb ? (isDark ? '#030711' : '#f1f5f9') : 'transparent' }}>
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                    <ActivityIndicator size="large" color="#38b4ba" />
                </View>
            </Container>
        );
    }

    const previewCover = newCoverFile?.uri || (coverImage
        ? (coverImage.startsWith('http') ? coverImage : getPublicUrl('covers', coverImage))
        : null);

    return (
        <Container style={{ flex: 1, backgroundColor: isWeb ? (isDark ? '#030711' : '#f1f5f9') : 'transparent' }}>
            <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
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
                                Edit Song
                            </Text>
                            <Text style={{ fontSize: 13, color: colors.text.secondary, marginTop: 2 }}>
                                Update your track details
                            </Text>
                        </View>
                    </View>

                    {/* Cover Image */}
                    <View style={{
                        backgroundColor: cardBg, borderRadius: 20, padding: isWeb ? 28 : 20,
                        marginBottom: 16, borderWidth: 1, borderColor: cardBorder,
                        alignItems: 'center',
                    }}>
                        <Text style={{ fontSize: 14, fontWeight: '700', color: colors.text.primary, marginBottom: 12, alignSelf: 'flex-start' }}>
                            Cover Art
                        </Text>
                        {previewCover ? (
                            <View style={{ alignItems: 'center' }}>
                                <Image
                                    source={{ uri: previewCover }}
                                    style={{ width: isWeb ? 200 : 160, height: isWeb ? 200 : 160, borderRadius: 16 }}
                                    contentFit="cover"
                                />
                                <AnimatedPressable
                                    preset="button"
                                    onPress={handlePickCover}
                                    style={{
                                        marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 6,
                                        paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10,
                                        backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : '#f1f5f9',
                                        borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.12)' : '#e2e8f0',
                                    }}
                                >
                                    <ImagePlus size={16} color={colors.text.secondary} />
                                    <Text style={{ fontSize: 13, fontWeight: '600', color: colors.text.secondary }}>Change Cover</Text>
                                </AnimatedPressable>
                            </View>
                        ) : (
                            <AnimatedPressable
                                preset="button"
                                onPress={handlePickCover}
                                style={{
                                    width: isWeb ? 200 : 160, height: isWeb ? 200 : 160, borderRadius: 16,
                                    backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#f1f5f9',
                                    alignItems: 'center', justifyContent: 'center',
                                    borderWidth: 2, borderColor: isDark ? 'rgba(255,255,255,0.1)' : '#e2e8f0',
                                    borderStyle: 'dashed',
                                }}
                            >
                                <ImagePlus size={32} color={colors.text.muted} />
                                <Text style={{ fontSize: 13, color: colors.text.muted, marginTop: 8 }}>Upload Cover</Text>
                            </AnimatedPressable>
                        )}
                    </View>

                    {/* Title */}
                    <View style={{
                        backgroundColor: cardBg, borderRadius: 20, padding: isWeb ? 28 : 20,
                        marginBottom: 16, borderWidth: 1, borderColor: cardBorder,
                    }}>
                        <Text style={{ fontSize: 14, fontWeight: '700', color: colors.text.primary, marginBottom: 8 }}>
                            Title *
                        </Text>
                        <TextInput value={title} onChangeText={setTitle} placeholder="Track title" placeholderTextColor={colors.text.muted} style={inputStyle} />
                    </View>

                    {/* Album & Genre */}
                    <View style={{
                        backgroundColor: cardBg, borderRadius: 20, padding: isWeb ? 28 : 20,
                        marginBottom: 16, borderWidth: 1, borderColor: cardBorder,
                    }}>
                        <Text style={{ fontSize: 14, fontWeight: '700', color: colors.text.primary, marginBottom: 8 }}>Album / EP</Text>
                        <TextInput value={album} onChangeText={setAlbum} placeholder="Optional" placeholderTextColor={colors.text.muted} style={[inputStyle, { marginBottom: 16 }]} />

                        <Text style={{ fontSize: 14, fontWeight: '700', color: colors.text.primary, marginBottom: 8 }}>Genre</Text>
                        <View style={{ zIndex: 10 }}>
                            <SelectField
                                options={GENRES.map((g) => ({ value: g, label: g }))}
                                value={genre}
                                onChange={setGenre}
                                placeholder="Select genre"
                            />
                        </View>

                        <Text style={{ fontSize: 14, fontWeight: '700', color: colors.text.primary, marginBottom: 8, marginTop: 16 }}>Duration (MM:SS)</Text>
                        <TextInput value={duration} onChangeText={setDuration} placeholder="03:45" placeholderTextColor={colors.text.muted} style={inputStyle} />
                    </View>

                    {/* Description */}
                    <View style={{
                        backgroundColor: cardBg, borderRadius: 20, padding: isWeb ? 28 : 20,
                        marginBottom: 16, borderWidth: 1, borderColor: cardBorder,
                    }}>
                        <Text style={{ fontSize: 14, fontWeight: '700', color: colors.text.primary, marginBottom: 8 }}>Description</Text>
                        <TextInput
                            value={description} onChangeText={setDescription}
                            placeholder="Tell listeners about this track..."
                            placeholderTextColor={colors.text.muted}
                            multiline numberOfLines={3}
                            style={[inputStyle, { minHeight: 80, textAlignVertical: 'top' }]}
                        />
                    </View>

                    {/* Publish Toggle */}
                    <View style={{
                        backgroundColor: cardBg, borderRadius: 20, padding: isWeb ? 28 : 20,
                        marginBottom: 24, borderWidth: 1, borderColor: cardBorder,
                        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                    }}>
                        <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 14, fontWeight: '700', color: colors.text.primary }}>Published</Text>
                            <Text style={{ fontSize: 12, color: colors.text.secondary, marginTop: 2 }}>
                                {isPublished ? 'Visible to all listeners' : 'Saved as draft — only you can see it'}
                            </Text>
                        </View>
                        <Switch
                            value={isPublished}
                            onValueChange={setIsPublished}
                            trackColor={{ false: isDark ? '#333' : '#e2e8f0', true: 'rgba(56,180,186,0.5)' }}
                            thumbColor={isPublished ? '#38b4ba' : (isDark ? '#888' : '#ccc')}
                        />
                    </View>

                    {/* Save Button */}
                    <AnimatedPressable
                        preset="button"
                        onPress={handleSave}
                        style={{
                            flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                            backgroundColor: '#38b4ba', borderRadius: 16,
                            paddingVertical: 16, gap: 8, marginBottom: 12,
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

                    {/* Unpublish Button */}
                    {isPublished && (
                        <AnimatedPressable
                            preset="button"
                            onPress={handleDelete}
                            style={{
                                flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                                backgroundColor: isDark ? 'rgba(239,68,68,0.12)' : '#fef2f2',
                                borderRadius: 16, paddingVertical: 14, gap: 8,
                                borderWidth: 1, borderColor: isDark ? 'rgba(239,68,68,0.2)' : '#fecaca',
                                opacity: deleting ? 0.7 : 1,
                            }}
                        >
                            {deleting ? (
                                <ActivityIndicator size="small" color="#ef4444" />
                            ) : (
                                <>
                                    <Trash2 size={18} color="#ef4444" />
                                    <Text style={{ fontSize: 15, fontWeight: '600', color: '#ef4444' }}>Unpublish Song</Text>
                                </>
                            )}
                        </AnimatedPressable>
                    )}
                </ScrollView>
            </KeyboardAvoidingView>
        </Container>
    );
}
