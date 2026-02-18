import React from 'react';
import { View, Text, ScrollView, FlatList, Platform } from 'react-native';
import AnimatedPressable from '../../src/components/shared/AnimatedPressable';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Gem, Heart, Users as UsersIcon, Copy, Settings, ExternalLink, Wallet } from 'lucide-react-native';
import GlassCard from '../../src/components/shared/GlassCard';
import NFTCard from '../../src/components/shared/NFTCard';
import TransactionRow from '../../src/components/shared/TransactionRow';
import { users } from '../../src/mock/users';
import { nfts } from '../../src/mock/nfts';
import { transactions } from '../../src/mock/transactions';
import { Transaction } from '../../src/types';

const isWeb = Platform.OS === 'web';
const isAndroid = Platform.OS === 'android';

import { useTheme } from '../../src/context/ThemeContext';

/* ─── Stat Card (web-optimized) ─── */
function StatCard({ icon, value, label }: { icon: React.ReactNode; value: number | string; label: string }) {
    const { isDark, colors } = useTheme();
    return (
        <View
            style={{
                flex: 1,
                margin: 4,
                padding: 20,
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
    const user = users[0];
    const truncatedWallet = `${user.walletAddress.slice(0, 6)}...${user.walletAddress.slice(-4)}`;
    const { isDark, colors } = useTheme();

    const renderTransaction = ({ item }: { item: Transaction }) => (
        <TransactionRow
            type={item.type}
            songTitle={item.songTitle}
            amount={item.price}
            date={item.date}
            status={item.status}
        />
    );

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
            >
                {/* Header Row */}
                {!isWeb && (
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, marginBottom: 24 }}>
                        <Text style={{ fontSize: 28, fontWeight: '800', color: colors.text.primary, letterSpacing: -1 }}>Profile</Text>
                        <AnimatedPressable
                            preset="icon"
                            onPress={() => router.push('/(consumer)/settings')}
                            style={{
                                width: 40,
                                height: 40,
                                borderRadius: 20,
                                backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.5)',
                                alignItems: 'center',
                                justifyContent: 'center',
                                borderWidth: 1,
                                borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.5)',
                            }}
                        >
                            <Settings size={20} color={colors.text.primary} />
                        </AnimatedPressable>
                    </View>
                )}

                {/* Profile Card */}
                <View
                    style={{
                        alignItems: 'center',
                        marginBottom: 24,
                        paddingVertical: 32,
                        paddingHorizontal: 24,
                        borderRadius: isWeb ? 20 : 24,
                        backgroundColor: isWeb
                            ? (isDark ? colors.bg.card : '#fff')
                            : (isDark
                                ? (isAndroid ? 'rgba(20,30,50,0.95)' : 'rgba(255,255,255,0.08)')
                                : (isAndroid ? '#ffffff' : 'rgba(255,255,255,0.4)')),
                        borderWidth: isDark ? 1 : 0,
                        borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'transparent',
                        marginTop: isWeb ? 8 : 0,
                        shadowColor: '#000',
                        shadowOffset: { width: 0, height: 1 },
                        shadowOpacity: isAndroid ? 0 : 0.04,
                        shadowRadius: 8,
                        elevation: isAndroid ? 1 : 4,
                    }}
                >
                    <View
                        style={{
                            width: isWeb ? 100 : 96,
                            height: isWeb ? 100 : 96,
                            borderRadius: 50,
                            padding: 3,
                            borderWidth: 3,
                            borderColor: '#38b4ba',
                        }}
                    >
                        <Image
                            source={{ uri: user.avatar }}
                            style={{ width: isWeb ? 92 : 88, height: isWeb ? 92 : 88, borderRadius: 46 }}
                            contentFit="cover"
                        />
                    </View>
                    <Text style={{ fontSize: 24, fontWeight: '800', color: colors.text.primary, marginTop: 16, letterSpacing: -0.5 }}>
                        {user.name}
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6 }}>
                        <Text style={{ color: colors.text.secondary, fontSize: 13, fontFamily: isWeb ? 'monospace' : undefined }}>{truncatedWallet}</Text>
                        <AnimatedPressable
                            preset="icon"
                            style={{
                                marginLeft: 8,
                                padding: 4,
                                borderRadius: 6,
                            }}
                        >
                            <Copy size={14} color={colors.text.secondary} />
                        </AnimatedPressable>
                    </View>

                    {isWeb && (
                        <AnimatedPressable
                            preset="button"
                            onPress={() => router.push('/(consumer)/settings')}
                            style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                marginTop: 16,
                                paddingHorizontal: 20,
                                paddingVertical: 10,
                                borderRadius: 12,
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
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            marginBottom: 24,
                            padding: 20,
                            borderRadius: 24,
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
                                <Text style={{ fontSize: 13, color: colors.text.secondary }}>$1,240.50</Text>
                            </View>
                        </View>
                        <ExternalLink size={16} color={colors.text.tertiary} />
                    </AnimatedPressable>
                )}

                {/* Stats */}
                <View style={{ flexDirection: 'row', marginBottom: 28 }}>
                    <StatCard icon={<Gem size={22} color="#8b5cf6" />} value={user.ownedNFTs} label="NFTs" />
                    <StatCard icon={<Heart size={22} color="#ef4444" />} value={user.likedSongs} label="Liked" />
                    <StatCard icon={<UsersIcon size={22} color="#38b4ba" />} value={6} label="Following" />
                </View>

                {/* My NFTs */}
                <Text style={{ fontSize: 22, fontWeight: '800', color: colors.text.primary, letterSpacing: -0.5, marginBottom: 16 }}>My NFTs</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 28 }}>
                    {nfts.slice(0, 3).map((nft) => (
                        <View key={nft.id} style={{ width: isWeb ? 220 : 176, marginRight: 16 }}>
                            <NFTCard
                                cover={nft.coverImage}
                                title={nft.songTitle}
                                artist={nft.artistName}
                                price={nft.price}
                                editionNumber={nft.editionNumber}
                                totalEditions={nft.totalEditions}
                                rarity={nft.rarity}
                                onPress={() => router.push({ pathname: '/(consumer)/nft-detail', params: { id: nft.id } })}
                            />
                        </View>
                    ))}
                </ScrollView>

                {/* Recent Activity */}
                <Text style={{ fontSize: 22, fontWeight: '800', color: colors.text.primary, letterSpacing: -0.5, marginBottom: 16 }}>Recent Activity</Text>
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
                    <FlatList
                        data={transactions.slice(0, 5)}
                        renderItem={renderTransaction}
                        keyExtractor={(item) => item.id}
                        scrollEnabled={false}
                    />
                </View>
                <View style={{ height: 32 }} />
            </ScrollView>
        </Container>
    );
}
