import React, { useState } from 'react';
import { View, Text, ScrollView, TextInput, Switch, Platform } from 'react-native';
import AnimatedPressable from '../../src/components/shared/AnimatedPressable';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Upload as UploadIcon, ImagePlus, Music, Info } from 'lucide-react-native';

const isWeb = Platform.OS === 'web';
const genres = ['Electronic', 'Hip-Hop', 'Ambient', 'Synthwave', 'Pop', 'Dubstep', 'Rock', 'Lo-fi', 'R&B'];

export default function UploadScreen() {
    const [title, setTitle] = useState('');
    const [selectedGenre, setSelectedGenre] = useState('Hip-Hop');
    const [mintAsNFT, setMintAsNFT] = useState(false);

    const Container = isWeb ? View : SafeAreaView;

    return (
        <Container style={{ flex: 1, backgroundColor: isWeb ? '#f8fafc' : 'transparent' }}>
            <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={{
                    padding: isWeb ? 32 : 16,
                    paddingBottom: 40,
                    maxWidth: isWeb ? 800 : undefined,
                }}
                showsVerticalScrollIndicator={false}
            >
                {/* Header */}
                <Text style={{ fontSize: isWeb ? 28 : 24, fontWeight: '800', color: '#0f172a', letterSpacing: -1 }}>
                    Upload Music
                </Text>
                <Text style={{ fontSize: 14, color: '#64748b', marginTop: 4, marginBottom: 28 }}>
                    Share your music with the world. Optionally mint as NFT.
                </Text>

                {/* Drop Zone */}
                <AnimatedPressable
                    preset="card"
                    hapticType="none"
                    style={{
                        borderWidth: 2,
                        borderColor: '#e2e8f0',
                        borderStyle: 'dashed',
                        borderRadius: 16,
                        paddingVertical: isWeb ? 48 : 36,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: isWeb ? '#fff' : 'rgba(255,255,255,0.3)',
                        marginBottom: 28,
                    }}
                >
                    <UploadIcon size={32} color="#94a3b8" />
                    <Text style={{ fontSize: 16, fontWeight: '600', color: '#0f172a', marginTop: 12 }}>
                        Drop your audio file here
                    </Text>
                    <Text style={{ fontSize: 13, color: '#94a3b8', marginTop: 4 }}>
                        WAV, FLAC, or MP3 — Max 50MB
                    </Text>
                </AnimatedPressable>

                {/* Song Title + Genre Row */}
                <View style={{ flexDirection: isWeb ? 'row' : 'column', marginBottom: 24 }}>
                    <View style={{ flex: 1, marginRight: isWeb ? 12 : 0, marginBottom: isWeb ? 0 : 16 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                            <Music size={14} color="#64748b" />
                            <Text style={{ fontSize: 13, fontWeight: '600', color: '#0f172a', marginLeft: 6 }}>Song Title</Text>
                        </View>
                        <TextInput
                            value={title}
                            onChangeText={setTitle}
                            placeholder="Enter song title"
                            placeholderTextColor="#94a3b8"
                            style={{
                                borderWidth: 1,
                                borderColor: '#e2e8f0',
                                borderRadius: 10,
                                padding: 14,
                                fontSize: 14,
                                color: '#0f172a',
                                backgroundColor: isWeb ? '#fff' : 'rgba(255,255,255,0.5)',
                                outlineStyle: 'none',
                            } as any}
                        />
                    </View>
                    <View style={{ flex: isWeb ? 0.6 : 1 }}>
                        <Text style={{ fontSize: 13, fontWeight: '600', color: '#0f172a', marginBottom: 8 }}>Genre</Text>
                        <View
                            style={{
                                borderWidth: 1,
                                borderColor: '#e2e8f0',
                                borderRadius: 10,
                                padding: 14,
                                backgroundColor: isWeb ? '#fff' : 'rgba(255,255,255,0.5)',
                                flexDirection: 'row',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                            }}
                        >
                            <Text style={{ fontSize: 14, color: '#0f172a' }}>{selectedGenre}</Text>
                            <Text style={{ color: '#94a3b8', fontSize: 14 }}>▾</Text>
                        </View>
                    </View>
                </View>

                {/* Cover Art */}
                <View style={{ marginBottom: 28 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                        <ImagePlus size={14} color="#64748b" />
                        <Text style={{ fontSize: 13, fontWeight: '600', color: '#0f172a', marginLeft: 6 }}>Cover Art</Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <View
                            style={{
                                width: 72,
                                height: 72,
                                borderRadius: 12,
                                backgroundColor: isWeb ? '#f1f5f9' : 'rgba(255,255,255,0.3)',
                                alignItems: 'center',
                                justifyContent: 'center',
                                marginRight: 16,
                            }}
                        >
                            <ImagePlus size={24} color="#94a3b8" />
                        </View>
                        <AnimatedPressable
                            preset="button"
                            hapticType="none"
                            style={{
                                paddingHorizontal: 20,
                                paddingVertical: 10,
                                borderRadius: 10,
                                borderWidth: 1,
                                borderColor: '#e2e8f0',
                                backgroundColor: isWeb ? '#fff' : 'rgba(255,255,255,0.5)',
                            }}
                        >
                            <Text style={{ fontSize: 13, fontWeight: '600', color: '#0f172a' }}>Choose Image</Text>
                        </AnimatedPressable>
                    </View>
                </View>

                {/* Mint as NFT Toggle */}
                <View
                    style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        paddingVertical: 16,
                        paddingHorizontal: 16,
                        borderRadius: 12,
                        backgroundColor: isWeb ? '#fff' : 'rgba(255,255,255,0.3)',
                        borderWidth: 1,
                        borderColor: isWeb ? '#f1f5f9' : 'rgba(255,255,255,0.3)',
                        marginBottom: 24,
                    }}
                >
                    <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                        <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                            <Gem size={16} color="#8b5cf6" />
                        </View>
                        <View>
                            <Text style={{ fontSize: 14, fontWeight: '600', color: '#0f172a' }}>Mint as NFT</Text>
                            <Text style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>Set price, editions, and list on marketplace.</Text>
                        </View>
                    </View>
                    <Switch
                        value={mintAsNFT}
                        onValueChange={setMintAsNFT}
                        trackColor={{ false: '#e2e8f0', true: '#38b4ba' }}
                        thumbColor="#fff"
                    />
                </View>

                {/* On-chain notice */}
                <View
                    style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        padding: 14,
                        borderRadius: 10,
                        backgroundColor: 'rgba(56,180,186,0.06)',
                        borderWidth: 1,
                        borderColor: 'rgba(56,180,186,0.15)',
                        marginBottom: 28,
                    }}
                >
                    <Info size={16} color="#38b4ba" />
                    <Text style={{ marginLeft: 10, fontSize: 13, color: '#38b4ba', fontWeight: '500', flex: 1 }}>
                        All uploads are stored on-chain. Make sure your content is final before publishing.
                    </Text>
                </View>

                {/* Action Buttons */}
                <View style={{ flexDirection: 'row', gap: 12 }}>
                    <AnimatedPressable
                        preset="button"
                        style={{
                            flex: 2,
                            paddingVertical: 16,
                            borderRadius: 14,
                            backgroundColor: '#38b4ba',
                            alignItems: 'center',
                            shadowColor: '#38b4ba',
                            shadowOffset: { width: 0, height: 6 },
                            shadowOpacity: 0.3,
                            shadowRadius: 16,
                            elevation: 6,
                        }}
                    >
                        <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Publish Song</Text>
                    </AnimatedPressable>
                    <AnimatedPressable
                        preset="button"
                        hapticType="none"
                        style={{
                            flex: 1,
                            paddingVertical: 16,
                            borderRadius: 14,
                            borderWidth: 1,
                            borderColor: '#e2e8f0',
                            backgroundColor: isWeb ? '#fff' : 'rgba(255,255,255,0.4)',
                            alignItems: 'center',
                        }}
                    >
                        <Text style={{ color: '#0f172a', fontWeight: '600', fontSize: 15 }}>Save Draft</Text>
                    </AnimatedPressable>
                </View>
            </ScrollView>
        </Container>
    );
}

function Gem({ size, color }: { size: number; color: string }) {
    // Simple diamond icon replacement to avoid import conflicts
    return (
        <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: size * 0.7, color }}>◇</Text>
        </View>
    );
}
