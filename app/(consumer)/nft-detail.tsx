import React from 'react';
import { View, Text, ScrollView, Platform, StyleSheet } from 'react-native';
import AnimatedPressable from '../../src/components/shared/AnimatedPressable';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronLeft, ExternalLink } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import GlassCard from '../../src/components/shared/GlassCard';
import RarityBadge from '../../src/components/shared/RarityBadge';
import NFTCard from '../../src/components/shared/NFTCard';
import ScreenScaffold from '../../src/components/layout/ScreenScaffold';
import { nfts } from '../../src/mock/nfts';

import { useTheme } from '../../src/context/ThemeContext';

export default function NFTDetailScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const router = useRouter();
    const nft = nfts.find((n) => n.id === id) || nfts[0];
    const moreNFTs = nfts.filter((n) => n.id !== nft.id);
    const truncatedOwner = `${nft.owner.slice(0, 6)}...${nft.owner.slice(-4)}`;
    const isWeb = Platform.OS === 'web';
    const { isDark, colors } = useTheme();

    return (
        <ScreenScaffold dominantColor="#8b5cf6" contentContainerStyle={{ paddingBottom: 40 }}>
            <View style={[
                isWeb ? { maxWidth: 1200, width: '100%', alignSelf: 'center' } : { flex: 1 },
            ]}>
                {/* Back Button */}
                <View style={{ paddingHorizontal: 16 }}>
                    <AnimatedPressable
                        preset="icon"
                        onPress={() => router.back()}
                        style={{
                            width: 40, height: 40, borderRadius: 20, marginTop: isWeb ? 20 : 8, marginBottom: 8,
                            backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)',
                            alignItems: 'center' as const, justifyContent: 'center' as const,
                            borderWidth: 1,
                            borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
                        }}
                    >
                        <ChevronLeft size={22} color={colors.text.primary} />
                    </AnimatedPressable>
                </View>

                <View style={[
                    isWeb ? { flexDirection: 'row', gap: 40, paddingVertical: 40, paddingHorizontal: 16 } : { paddingHorizontal: 16 },
                ]}>
                    {/* NFT Cover - Left Column (Web) */}
                    <View style={[
                        { borderRadius: 32, overflow: 'hidden', marginBottom: 20, position: 'relative' },
                        isWeb && { width: 400, height: 400, flexShrink: 0 },
                    ]}>
                        <Image
                            source={{ uri: nft.coverImage }}
                            style={{ width: '100%', height: isWeb ? '100%' : undefined, aspectRatio: isWeb ? undefined : 1 }}
                            contentFit="cover"
                        />
                        {!isWeb && (
                            <LinearGradient
                                colors={['transparent', isDark ? 'rgba(0,0,0,0.85)' : 'rgba(0,0,0,0.65)'] as any}
                                style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 140 }}
                            />
                        )}
                        {!isWeb && (
                            <View style={{ position: 'absolute', top: 16, left: 16 }}>
                                <RarityBadge rarity={nft.rarity} />
                            </View>
                        )}
                        {/* Title overlaid - Mobile Only */}
                        {!isWeb && (
                            <View style={{ position: 'absolute', bottom: 20, left: 20, right: 20 }}>
                                <Text style={{ color: '#fff', fontSize: 28, fontWeight: '800', letterSpacing: -1 }}>{nft.songTitle}</Text>
                                <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 15, marginTop: 2 }}>{nft.artistName}</Text>
                            </View>
                        )}
                    </View>

                    {/* Right Column (Web) / Bottom (Mobile) */}
                    <View style={{ flex: 1 }}>
                        {/* Title/Info - Web Only */}
                        {isWeb && (
                            <View style={{ marginBottom: 24 }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                                    <Text style={{ fontSize: 40, fontWeight: '800', color: colors.text.primary, letterSpacing: -1 }}>{nft.songTitle}</Text>
                                    <RarityBadge rarity={nft.rarity} />
                                </View>
                                <Text style={{ fontSize: 20, color: colors.text.secondary }}>{nft.artistName}</Text>
                            </View>
                        )}

                        {/* Price Card */}
                        <GlassCard intensity="heavy" style={{ marginBottom: 16 }}>
                            <Text style={{ fontSize: 10, fontWeight: '700', color: colors.text.secondary, textTransform: 'uppercase', letterSpacing: 1.5 }}>Current Price</Text>
                            <Text style={{ fontSize: 40, fontWeight: '800', color: '#8b5cf6', letterSpacing: -1, marginTop: 4 }}>{nft.price} ETH</Text>
                            <Text style={{ color: colors.text.secondary, fontSize: 13, marginTop: 4 }}>
                                Edition #{nft.editionNumber} of {nft.totalEditions}
                            </Text>
                            <AnimatedPressable
                                preset="button"
                                style={{
                                    backgroundColor: '#8b5cf6',
                                    borderRadius: 20,
                                    paddingVertical: 16,
                                    alignItems: 'center' as const,
                                    marginTop: 16,
                                    elevation: 8,
                                }}
                            >
                                <Text style={{ color: '#ffffff', fontWeight: '700', fontSize: 16 }}>Buy Now</Text>
                            </AnimatedPressable>
                        </GlassCard>

                        {/* Price History */}
                        {nft.priceHistory && nft.priceHistory.length > 0 && (
                            <GlassCard style={{ marginBottom: 16 }}>
                                <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text.primary, marginBottom: 12 }}>Price History</Text>
                                {nft.priceHistory.map((entry, index) => (
                                    <View key={index} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: index < nft.priceHistory!.length - 1 ? 1 : 0, borderBottomColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' }}>
                                        <Text style={{ color: colors.text.secondary, fontSize: 13 }}>{entry.date}</Text>
                                        <Text style={{ color: colors.text.primary, fontWeight: '600', fontSize: 13 }}>{entry.price} ETH</Text>
                                    </View>
                                ))}
                            </GlassCard>
                        )}

                        {/* Owner */}
                        <GlassCard intensity="light" style={{ marginBottom: 20, flexDirection: 'row', alignItems: 'center' }}>
                            <View style={{ flex: 1 }}>
                                <Text style={{ color: colors.text.secondary, fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.5 }}>Current Owner</Text>
                                <Text style={{ color: colors.text.primary, fontWeight: '600', fontSize: 14, marginTop: 4 }}>{truncatedOwner}</Text>
                            </View>
                            <AnimatedPressable
                                preset="icon"
                                style={{
                                    width: 36, height: 36, borderRadius: 18,
                                    alignItems: 'center' as const, justifyContent: 'center' as const,
                                    backgroundColor: isDark ? 'rgba(116,229,234,0.2)' : 'rgba(116,229,234,0.12)',
                                }}
                            >
                                <ExternalLink size={16} color="#38b4ba" />
                            </AnimatedPressable>
                        </GlassCard>
                    </View>
                </View>

                {/* More NFTs */}
                <View style={{ paddingHorizontal: 16 }}>
                    <Text style={{ fontSize: 22, fontWeight: '800', color: colors.text.primary, letterSpacing: -0.5, marginBottom: 12 }}>More NFTs</Text>
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 32, paddingHorizontal: 16 }}>
                    {moreNFTs.map((n) => (
                        <View key={n.id} style={{ width: 176, marginRight: 12 }}>
                            <NFTCard
                                cover={n.coverImage}
                                title={n.songTitle}
                                artist={n.artistName}
                                price={n.price}
                                editionNumber={n.editionNumber}
                                totalEditions={n.totalEditions}
                                rarity={n.rarity}
                                onPress={() => router.push({ pathname: '/(consumer)/nft-detail', params: { id: n.id } })}
                            />
                        </View>
                    ))}
                </ScrollView>
            </View>
        </ScreenScaffold>
    );
}
