import React, { useCallback } from 'react';
import { View, Text, ScrollView, Platform, ActivityIndicator, RefreshControl } from 'react-native';
import AnimatedPressable from '../../src/components/shared/AnimatedPressable';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { useRouter, useFocusEffect } from 'expo-router';
import { Gem, Heart, Users as UsersIcon, Copy, Settings, ExternalLink, Wallet, Brush, ChevronRight, ShoppingCart, Coins, ArrowUpRight, Tag } from 'lucide-react-native';
import GlassCard from '../../src/components/shared/GlassCard';
import NFTCard from '../../src/components/shared/NFTCard';
import { useAuth } from '../../src/context/AuthContext';
import { useOwnedNFTs, useLikedSongs, useUserActivity, useFollowCounts } from '../../src/hooks/useData';
import { useTheme } from '../../src/context/ThemeContext';
import { useCurrency } from '../../src/hooks/useCurrency';
import * as Clipboard from 'expo-clipboard';
import AvatarDisplay from '../../src/components/shared/AvatarDisplay';
import { PRESET_AVATAR_IDS } from '../../src/hooks/useData';
import { CHAIN_NAME } from '../../src/config/network';

const isWeb = Platform.OS === 'web';
const isAndroid = Platform.OS === 'android';

/* ─── Stat Card ─── */
function StatCard({ icon, value, label }: { icon: React.ReactNode; value: number | string; label: string }) {
    const { isDark, colors } = useTheme();
    return (
        <View
            style={{
                flex: 1, margin: 4, padding: 20,
                borderRadius: isWeb ? 16 : 24,
                backgroundColor: isWeb
                    ? (isDark ? colors.bg.card : '#fff')
                    : (isDark
                        ? (isAndroid ? 'rgba(20,30,50,0.95)' : 'rgba(255,255,255,0.08)')
                        : (isAndroid ? '#f8f9fa' : 'rgba(255,255,255,0.4)')),
                borderWidth: isDark ? 1 : 0,
                borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'transparent',
                alignItems: 'center',
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 1 },
                shadowOpacity: isAndroid ? 0 : 0.04,
                shadowRadius: 4,
                elevation: isAndroid ? 1 : 2,
            }}
        >
            {icon}
            <Text style={{ fontSize: 28, fontWeight: '800', color: colors.text.primary, marginTop: 8 }}>{value}</Text>
            <Text style={{ fontSize: 10, fontWeight: '700', color: colors.text.secondary, textTransform: 'uppercase', letterSpacing: 1.5, marginTop: 4 }}>{label}</Text>
        </View>
    );
}

export default function ProfileScreen() {
    const router = useRouter();
    const { profile, walletAddress, role } = useAuth();
    const { isDark, colors } = useTheme();
    const { fiatCurrency } = useCurrency();
    const [refreshing, setRefreshing] = React.useState(false);

    // Real data hooks
    const { data: ownedNFTs, loading: loadingNFTs, refresh: refreshNFTs } = useOwnedNFTs();
    const { data: likedSongs, refresh: refreshLiked } = useLikedSongs();
    const { data: recentActivity, loading: loadingActivity, refresh: refreshActivity } = useUserActivity();
    const { following: followingCount, refresh: refreshFollowCounts } = useFollowCounts(profile?.id);

    useFocusEffect(
        useCallback(() => {
            refreshNFTs();
            refreshLiked();
            refreshActivity();
            refreshFollowCounts();
        }, [refreshNFTs, refreshLiked, refreshActivity, refreshFollowCounts])
    );

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await Promise.all([
            refreshNFTs(),
            refreshLiked(),
            refreshActivity(),
            refreshFollowCounts(),
        ]);
        setRefreshing(false);
    }, [refreshNFTs, refreshLiked, refreshActivity, refreshFollowCounts]);

    const displayName = profile?.displayName || 'Anonymous';
    const truncatedWallet = walletAddress ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}` : '0x0000...0000';

    // Resolve avatar: could be a preset ID, an uploaded file path, or null
    const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!;
    const avatarPath = profile?.avatarPath;
    const avatarUri = !avatarPath
        ? null
        : PRESET_AVATAR_IDS.has(avatarPath)
            ? `preset:${avatarPath}`
            : avatarPath.startsWith('http')
                ? avatarPath
                : `${SUPABASE_URL}/storage/v1/object/public/avatars/${avatarPath}`;

    const handleCopyAddress = async () => {
        if (walletAddress) {
            try { await Clipboard.setStringAsync(walletAddress); } catch {}
        }
    };

    const activityIcons: Record<string, React.ComponentType<{ size: number; color: string }>> = {
        purchase: ShoppingCart,
        sale: Coins,
        mint: ArrowUpRight,
        listing: Tag,
    };

    const activityLabels: Record<string, string> = {
        purchase: 'Purchased',
        sale: 'Sold',
        mint: 'Minted',
        listing: 'Listed',
    };

    const Container = isWeb ? View : SafeAreaView;

    return (
        <Container style={{ flex: 1, backgroundColor: isWeb ? colors.bg.base : 'transparent' }}>
            <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={{
                    maxWidth: isWeb ? 800 : undefined,
                    width: '100%' as any,
                    alignSelf: 'center' as any,
                    paddingHorizontal: isWeb ? 32 : 16,
                    paddingBottom: 32,
                }}
                showsVerticalScrollIndicator={false}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={onRefresh}
                        tintColor={colors.accent.cyan}
                        colors={[colors.accent.cyan]}
                    />
                }
            >
                {/* Header Row */}
                {!isWeb && (
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, marginBottom: 24 }}>
                        <Text style={{ fontSize: 28, fontWeight: '800', color: colors.text.primary, letterSpacing: -1 }}>Profile</Text>
                        <AnimatedPressable
                            preset="icon"
                            onPress={() => router.push('/(consumer)/settings')}
                            style={{
                                width: 40, height: 40, borderRadius: 20,
                                backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.5)',
                                alignItems: 'center', justifyContent: 'center',
                                borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.5)',
                            }}
                        >
                            <Settings size={20} color={colors.text.primary} />
                        </AnimatedPressable>
                    </View>
                )}

                {/* Profile Card */}
                <View
                    style={{
                        alignItems: 'center', marginBottom: 24, paddingVertical: 32, paddingHorizontal: 24,
                        borderRadius: isWeb ? 20 : 24,
                        backgroundColor: isWeb
                            ? (isDark ? colors.bg.card : '#fff')
                            : (isDark
                                ? (isAndroid ? 'rgba(20,30,50,0.95)' : 'rgba(255,255,255,0.08)')
                                : (isAndroid ? '#ffffff' : 'rgba(255,255,255,0.4)')),
                        borderWidth: isDark ? 1 : 0,
                        borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'transparent',
                        marginTop: isWeb ? 8 : 0,
                        shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
                        shadowOpacity: isAndroid ? 0 : 0.04, shadowRadius: 8, elevation: isAndroid ? 1 : 4,
                    }}
                >
                    <View style={{
                        width: isWeb ? 100 : 96, height: isWeb ? 100 : 96, borderRadius: 50,
                        padding: 3, borderWidth: 3, borderColor: '#38b4ba',
                        overflow: 'hidden',
                    }}>
                        <AvatarDisplay
                            uri={avatarUri || 'preset:default'}
                            size={(isWeb ? 100 : 96) - 6}
                        />
                    </View>
                    <Text style={{ fontSize: 24, fontWeight: '800', color: colors.text.primary, marginTop: 16, letterSpacing: -0.5 }}>
                        {displayName}
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6 }}>
                        <Text style={{ color: colors.text.secondary, fontSize: 13, fontFamily: isWeb ? 'monospace' : undefined }}>{truncatedWallet}</Text>
                        <AnimatedPressable preset="icon" onPress={handleCopyAddress} style={{ marginLeft: 8, padding: 4, borderRadius: 6 }}>
                            <Copy size={14} color={colors.text.secondary} />
                        </AnimatedPressable>
                    </View>

                    {isWeb && (
                        <AnimatedPressable
                            preset="button"
                            onPress={() => router.push('/(consumer)/edit-profile')}
                            style={{
                                flexDirection: 'row', alignItems: 'center', marginTop: 16,
                                paddingHorizontal: 20, paddingVertical: 10, borderRadius: 12,
                                backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : '#1e293b',
                            }}
                        >
                            <Settings size={14} color="#fff" />
                            <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600', marginLeft: 8 }}>Edit Profile</Text>
                        </AnimatedPressable>
                    )}
                </View>

                {/* Mobile Wallet Button */}
                {!isWeb && (
                    <AnimatedPressable
                        preset="row"
                        onPress={() => router.push('/(consumer)/wallet')}
                        style={{
                            flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                            marginBottom: 24, padding: 20, borderRadius: 24,
                            backgroundColor: isDark
                                ? (isAndroid ? 'rgba(20,30,50,0.95)' : 'rgba(255,255,255,0.08)')
                                : (isAndroid ? '#f8f9fa' : 'rgba(255,255,255,0.4)'),
                            borderWidth: isDark ? 1 : 0,
                            borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'transparent',
                            elevation: isAndroid ? 1 : 0,
                        }}
                    >
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: isDark ? 'rgba(116,229,234,0.1)' : '#f0fdfe', alignItems: 'center', justifyContent: 'center', marginRight: 16 }}>
                                <Wallet size={20} color="#38b4ba" />
                            </View>
                            <View>
                                <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text.primary }}>My Wallet</Text>
                                <Text style={{ fontSize: 13, color: colors.text.secondary }}>{CHAIN_NAME}</Text>
                            </View>
                        </View>
                        <ExternalLink size={16} color={colors.text.tertiary} />
                    </AnimatedPressable>
                )}

                {/* Become a Creator CTA – only for listeners on web (hidden on mobile per UX spec) */}
                {role === 'listener' && isWeb && (
                    <AnimatedPressable
                        preset="row"
                        onPress={() => router.push('/(auth)/creator-register')}
                        style={{
                            flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                            marginBottom: 24, padding: 20, borderRadius: isWeb ? 16 : 24,
                            backgroundColor: isDark ? 'rgba(139,92,246,0.08)' : 'rgba(139,92,246,0.06)',
                            borderWidth: 1,
                            borderColor: isDark ? 'rgba(139,92,246,0.2)' : 'rgba(139,92,246,0.15)',
                        }}
                    >
                        <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                            <View style={{
                                width: 44, height: 44, borderRadius: 22,
                                backgroundColor: isDark ? 'rgba(139,92,246,0.15)' : 'rgba(139,92,246,0.1)',
                                alignItems: 'center', justifyContent: 'center', marginRight: 16,
                            }}>
                                <Brush size={22} color="#8b5cf6" />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text.primary }}>Become a Creator</Text>
                                <Text style={{ fontSize: 12, color: colors.text.secondary, marginTop: 2 }}>Upload music, mint NFTs, earn royalties</Text>
                            </View>
                        </View>
                        <ChevronRight size={18} color="#8b5cf6" />
                    </AnimatedPressable>
                )}

                {/* Stats */}
                <View style={{ flexDirection: 'row', marginBottom: 28 }}>
                    <StatCard icon={<Gem size={22} color="#8b5cf6" />} value={ownedNFTs.length} label="NFTs" />
                    <StatCard icon={<Heart size={22} color="#ef4444" />} value={likedSongs.length} label="Liked" />
                    <StatCard icon={<UsersIcon size={22} color="#38b4ba" />} value={followingCount} label="Following" />
                </View>

                {/* My NFTs */}
                <Text style={{ fontSize: 22, fontWeight: '800', color: colors.text.primary, letterSpacing: -0.5, marginBottom: 16 }}>My NFTs</Text>
                {loadingNFTs ? (
                    <View style={{ padding: 20, alignItems: 'center' }}><ActivityIndicator size="small" color="#38b4ba" /></View>
                ) : ownedNFTs.length > 0 ? (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 28 }}>
                        {ownedNFTs.slice(0, 5).map((nft) => (
                            <View key={nft.id} style={{ width: isWeb ? 220 : 176, marginRight: 16 }}>
                                <NFTCard
                                    cover={nft.coverImage}
                                    title={nft.songTitle}
                                    artist={nft.artistName}
                                    price={nft.price}
                                    editionNumber={nft.editionNumber}
                                    mintedCount={nft.mintedCount}
                                    totalEditions={nft.totalEditions}
                                    rarity={nft.rarity}
                                    fiatCurrency={fiatCurrency}
                                    onPress={() => router.push({ pathname: '/(consumer)/nft-detail', params: { id: nft.id } })}
                                />
                            </View>
                        ))}
                    </ScrollView>
                ) : (
                    <View style={{ padding: 20, marginBottom: 28 }}>
                        <Text style={{ color: colors.text.secondary }}>No NFTs collected yet. Visit the Marketplace to get started.</Text>
                    </View>
                )}

                {/* Recent Activity */}
                <Text style={{ fontSize: 22, fontWeight: '800', color: colors.text.primary, letterSpacing: -0.5, marginBottom: 16 }}>Recent Activity</Text>
                {loadingActivity ? (
                    <View style={{ padding: 20, alignItems: 'center' }}><ActivityIndicator size="small" color="#38b4ba" /></View>
                ) : recentActivity.length > 0 ? (
                    <View
                        style={{
                            borderRadius: isWeb ? 16 : 24,
                            backgroundColor: isWeb
                                ? (isDark ? colors.bg.card : '#fff')
                                : (isDark
                                    ? (isAndroid ? 'rgba(20,30,50,0.95)' : 'rgba(255,255,255,0.08)')
                                    : (isAndroid ? '#ffffff' : 'rgba(255,255,255,0.4)')),
                            borderWidth: isDark ? 1 : 0,
                            borderColor: isDark ? 'rgba(255,255,255,0.04)' : 'transparent',
                            overflow: 'hidden',
                            elevation: isAndroid ? 1 : 0,
                        }}
                    >
                        {recentActivity.slice(0, 10).map((activity) => {
                            const IconComponent = activityIcons[activity.type] || Tag;
                            const label = activityLabels[activity.type] || activity.type;
                            return (
                                <View key={activity.id} style={{ flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)' }}>
                                    <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(56,180,186,0.12)', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                                        <IconComponent size={18} color="#38b4ba" />
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={{ color: colors.text.primary, fontWeight: '600', fontSize: 14 }} numberOfLines={1}>
                                            {activity.songTitle}
                                        </Text>
                                        <Text style={{ color: colors.text.secondary, fontSize: 12, marginTop: 2 }}>
                                            {label} {activity.date ? new Date(activity.date).toLocaleDateString() : ''}
                                        </Text>
                                    </View>
                                    {activity.price != null && (
                                        <Text style={{ color: colors.text.primary, fontWeight: '700', fontSize: 13 }}>
                                            {activity.price} POL
                                        </Text>
                                    )}
                                </View>
                            );
                        })}
                    </View>
                ) : (
                    <View style={{ padding: 20 }}>
                        <Text style={{ color: colors.text.secondary }}>No activity yet</Text>
                    </View>
                )}
                <View style={{ height: 32 }} />
            </ScrollView>
        </Container>
    );
}
