import React, { useRef, useState } from 'react';
import { View, Text, ScrollView, Animated, Platform, ActivityIndicator, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import {
    ArrowUpRight, ArrowDownLeft, ShoppingCart, Tag, Sparkles, ListPlus,
    ShieldCheck, Wallet as WalletIcon, ExternalLink,
} from 'lucide-react-native';
import ScreenScaffold from '../../src/components/layout/ScreenScaffold';
import { useTheme } from '../../src/context/ThemeContext';
import AnimatedPressable from '../../src/components/shared/AnimatedPressable';
import TabPill from '../../src/components/shared/TabPill';
import { useRouter } from 'expo-router';
import { useAuth } from '../../src/context/AuthContext';
import { useUserActivity } from '../../src/hooks/useData';
import { getPublicUrl, UserActivity } from '../../src/services/database';
import ErrorState from '../../src/components/shared/ErrorState';
import { useWalletBalance } from 'thirdweb/react';
import { thirdwebClient, activeChain } from '../../src/lib/thirdweb';
import { CHAIN_ID, CHAIN_NAME, IS_MAINNET } from '../../src/config/network';

const isWeb = Platform.OS === 'web';

const FILTER_TABS = [
    { key: 'all', label: 'All' },
    { key: 'purchases', label: 'Purchases' },
    { key: 'sales', label: 'Sales' },
    { key: 'mints', label: 'Mints' },
] as const;

type FilterKey = typeof FILTER_TABS[number]['key'];

/* ─── Format relative time ─── */
function timeAgo(dateStr: string): string {
    const now = new Date();
    const then = new Date(dateStr);
    const diffMs = now.getTime() - then.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    const diffDay = Math.floor(diffHr / 24);
    if (diffDay < 7) return `${diffDay}d ago`;
    return then.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/* ─── Activity type config ─── */
function getActivityConfig(type: UserActivity['type'], colors: any) {
    switch (type) {
        case 'purchase':
            return { icon: ShoppingCart, color: '#22c55e', label: 'NFT Purchased', bgColor: 'rgba(34,197,94,0.1)' };
        case 'sale':
            return { icon: Tag, color: '#8b5cf6', label: 'NFT Sold', bgColor: 'rgba(139,92,246,0.1)' };
        case 'mint':
            return { icon: Sparkles, color: '#38b4ba', label: 'NFT Minted', bgColor: 'rgba(56,180,186,0.1)' };
        case 'listing':
            return { icon: ListPlus, color: '#f59e0b', label: 'Listed for Sale', bgColor: 'rgba(245,158,11,0.1)' };
        default:
            return { icon: ArrowUpRight, color: colors.text.muted, label: 'Activity', bgColor: 'rgba(128,128,128,0.1)' };
    }
}

/* ─── Activity Row ─── */
function ActivityRow({ activity, isDark, colors }: { activity: UserActivity; isDark: boolean; colors: any }) {
    const config = getActivityConfig(activity.type, colors);
    const IconComp = config.icon;
    const coverUri = activity.coverPath
        ? (activity.coverPath.startsWith('http') ? activity.coverPath : getPublicUrl('covers', activity.coverPath))
        : null;

    return (
        <View style={{
            flexDirection: 'row', alignItems: 'center',
            paddingVertical: 14, paddingHorizontal: 16,
            backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
            borderRadius: 16, marginBottom: 8,
            borderWidth: 1,
            borderColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)',
        }}>
            {/* Cover + icon badge */}
            <View style={{ position: 'relative', marginRight: 14 }}>
                {coverUri ? (
                    <Image
                        source={{ uri: coverUri }}
                        style={{ width: 48, height: 48, borderRadius: 12 }}
                        contentFit="cover"
                    />
                ) : (
                    <View style={{
                        width: 48, height: 48, borderRadius: 12,
                        backgroundColor: config.bgColor,
                        alignItems: 'center', justifyContent: 'center',
                    }}>
                        <IconComp size={22} color={config.color} />
                    </View>
                )}
                {/* Type badge */}
                <View style={{
                    position: 'absolute', bottom: -4, right: -4,
                    width: 22, height: 22, borderRadius: 11,
                    backgroundColor: config.bgColor,
                    borderWidth: 2, borderColor: isDark ? '#0f172a' : '#fff',
                    alignItems: 'center', justifyContent: 'center',
                }}>
                    <IconComp size={10} color={config.color} />
                </View>
            </View>

            {/* Details */}
            <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: colors.text.primary }} numberOfLines={1}>
                    {config.label}
                </Text>
                <Text style={{ fontSize: 12, color: colors.text.secondary, marginTop: 2 }} numberOfLines={1}>
                    {activity.songTitle}
                </Text>
            </View>

            {/* Price + time */}
            <View style={{ alignItems: 'flex-end', marginLeft: 8 }}>
                {activity.price != null && (
                    <Text style={{
                        fontSize: 14, fontWeight: '700',
                        color: activity.type === 'purchase' ? '#22c55e'
                            : activity.type === 'sale' ? '#8b5cf6'
                            : colors.text.primary,
                    }}>
                        {activity.type === 'purchase' ? '-' : activity.type === 'sale' ? '+' : ''}{activity.price} POL
                    </Text>
                )}
                <Text style={{ fontSize: 11, color: colors.text.tertiary, marginTop: 2 }}>
                    {timeAgo(activity.date)}
                </Text>
            </View>
        </View>
    );
}

export default function WalletScreen() {
    const { isDark, colors } = useTheme();
    const insets = useSafeAreaInsets();
    const scrollY = useRef(new Animated.Value(0)).current;
    const router = useRouter();
    const { walletAddress } = useAuth();
    const [activeFilter, setActiveFilter] = useState<FilterKey>('all');
    const [refreshing, setRefreshing] = useState(false);

    // Fetch real on-chain balance
    const { data: balanceData, isLoading: balanceLoading, refetch: refetchBalance } = useWalletBalance({
        chain: activeChain,
        address: walletAddress || undefined,
        client: thirdwebClient,
    });

    const displayBalance = balanceData
        ? parseFloat(balanceData.displayValue).toFixed(4)
        : '0.00';
    const balanceSymbol = balanceData?.symbol || 'POL';

    const { data: activities, loading: activityLoading, error: activityError, refresh: refreshActivity } = useUserActivity(activeFilter);

    const onRefresh = React.useCallback(async () => {
        setRefreshing(true);
        try {
            const promises = [refreshActivity()];
            if (refetchBalance) {
                promises.push(refetchBalance());
            }
            await Promise.all(promises);
        } catch (e) {
            console.log(e);
        } finally {
            setRefreshing(false);
        }
    }, [refreshActivity, refetchBalance]);

    const truncatedAddress = walletAddress
        ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`
        : '0x0000...0000';

    return (
        <ScreenScaffold dominantColor={colors.accent.purple} noScroll scrollY={scrollY}>
            <View style={{ flex: 1, maxWidth: isWeb ? 800 : undefined, width: '100%', alignSelf: 'center' }}>
                <ScrollView
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={{
                        paddingHorizontal: isWeb ? 32 : 16,
                        paddingTop: isWeb ? 80 : insets.top + 60,
                        paddingBottom: 100,
                    }}
                    onScroll={Animated.event(
                        [{ nativeEvent: { contentOffset: { y: scrollY } } }],
                        { useNativeDriver: false }
                    )}
                    scrollEventThrottle={16}
                    refreshControl={
                        <RefreshControl
                            refreshing={refreshing}
                            onRefresh={onRefresh}
                            tintColor={colors.accent.purple}
                            colors={[colors.accent.purple]}
                        />
                    }
                >
                    {/* Header */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 32 }}>
                        <View style={{
                            width: 48, height: 48, borderRadius: 24,
                            backgroundColor: `${colors.accent.purple}15`,
                            alignItems: 'center', justifyContent: 'center', marginRight: 16
                        }}>
                            <WalletIcon size={24} color={colors.accent.purple} />
                        </View>
                        <View>
                            <Text style={{ fontSize: 28, fontWeight: '800', color: colors.text.primary, letterSpacing: -0.5 }}>
                                My Wallet
                            </Text>
                            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                                <ShieldCheck size={14} color={colors.status.success} style={{ marginRight: 4 }} />
                                <Text style={{ fontSize: 13, color: colors.status.success, fontWeight: '600' }}>
                                    {walletAddress ? 'Connected' : 'Not Connected'}
                                </Text>
                            </View>
                        </View>
                    </View>

                    {/* Balance Card */}
                    <View style={{
                        backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#ffffff',
                        borderRadius: 24, padding: 24, marginBottom: 24,
                        borderWidth: 1,
                        borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
                        shadowColor: '#000', shadowOffset: { width: 0, height: 8 },
                        shadowOpacity: isDark ? 0.3 : 0.05, shadowRadius: 24, elevation: 5,
                    }}>
                        <Text style={{ fontSize: 14, color: colors.text.secondary, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
                            Total Balance
                        </Text>
                        <Text style={{ fontSize: 42, fontWeight: '800', color: colors.text.primary, letterSpacing: -1 }}>
                            {balanceLoading ? '...' : displayBalance}{' '}
                            <Text style={{ fontSize: 24, color: colors.text.muted }}>{balanceSymbol}</Text>
                        </Text>
                        <Text style={{ fontSize: 16, color: colors.text.tertiary, marginTop: 4 }}>
                            {IS_MAINNET ? CHAIN_NAME : `${CHAIN_NAME} Testnet`}
                        </Text>

                        <View style={{ flexDirection: 'row', gap: 12, marginTop: 24 }}>
                            <AnimatedPressable preset="button" style={{ flex: 1 }} onPress={() => router.push('/(consumer)/deposit')}>
                                <View style={{
                                    backgroundColor: colors.text.primary,
                                    paddingVertical: 14, borderRadius: 16,
                                    alignItems: 'center', flexDirection: 'row', justifyContent: 'center',
                                }}>
                                    <ArrowDownLeft size={18} color={colors.text.inverse} style={{ marginRight: 8 }} />
                                    <Text style={{ color: colors.text.inverse, fontSize: 15, fontWeight: '700' }}>Deposit</Text>
                                </View>
                            </AnimatedPressable>
                            <AnimatedPressable preset="button" style={{ flex: 1 }} onPress={() => router.push('/(consumer)/withdraw')}>
                                <View style={{
                                    backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)',
                                    paddingVertical: 14, borderRadius: 16,
                                    alignItems: 'center', flexDirection: 'row', justifyContent: 'center',
                                }}>
                                    <ArrowUpRight size={18} color={colors.text.primary} style={{ marginRight: 8 }} />
                                    <Text style={{ color: colors.text.primary, fontSize: 15, fontWeight: '700' }}>Send</Text>
                                </View>
                            </AnimatedPressable>
                        </View>
                    </View>

                    {/* Network Info */}
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 32 }}>
                        {[
                            { label: 'Network', val: `${CHAIN_NAME} (${CHAIN_ID})` },
                            { label: 'Address', val: truncatedAddress },
                        ].map((item, i) => (
                            <View key={i} style={{
                                flex: 1, minWidth: 150,
                                backgroundColor: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)',
                                padding: 16, borderRadius: 16,
                            }}>
                                <Text style={{ fontSize: 12, color: colors.text.tertiary, marginBottom: 4 }}>{item.label}</Text>
                                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <Text style={{ fontSize: 14, color: colors.text.primary, fontWeight: '600', fontFamily: item.label === 'Address' ? (isWeb ? 'monospace' : undefined) : undefined }}>
                                        {item.val}
                                    </Text>
                                    {item.label === 'Address' && <ExternalLink size={14} color={colors.text.muted} />}
                                </View>
                            </View>
                        ))}
                    </View>

                    {/* Activity Header + Filter Tabs */}
                    <Text style={{ fontSize: 20, fontWeight: '800', color: colors.text.primary, marginBottom: 14 }}>
                        Activity
                    </Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16, maxHeight: 44 }}>
                        {FILTER_TABS.map((tab) => (
                            <TabPill
                                key={tab.key}
                                label={tab.label}
                                active={activeFilter === tab.key}
                                onPress={() => setActiveFilter(tab.key)}
                            />
                        ))}
                    </ScrollView>

                    {/* Activity List */}
                    {activityLoading ? (
                        <View style={{ padding: 40, alignItems: 'center' }}>
                            <ActivityIndicator size="small" color="#38b4ba" />
                        </View>
                    ) : activityError ? (
                        <ErrorState message={activityError} onRetry={refreshActivity} />
                    ) : activities.length > 0 ? (
                        <View>
                            {activities.map((activity) => (
                                <ActivityRow
                                    key={activity.id}
                                    activity={activity}
                                    isDark={isDark}
                                    colors={colors}
                                />
                            ))}
                        </View>
                    ) : (
                        <View style={{
                            padding: 40, alignItems: 'center',
                            backgroundColor: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)',
                            borderRadius: 20,
                        }}>
                            <Text style={{ fontSize: 36, marginBottom: 12 }}>
                                {activeFilter === 'purchases' ? '🛒' : activeFilter === 'sales' ? '💰' : activeFilter === 'mints' ? '✨' : '📋'}
                            </Text>
                            <Text style={{ fontSize: 16, fontWeight: '600', color: colors.text.primary, marginBottom: 4 }}>
                                No {activeFilter === 'all' ? 'activity' : activeFilter} yet
                            </Text>
                            <Text style={{ fontSize: 13, color: colors.text.secondary, textAlign: 'center' }}>
                                {activeFilter === 'purchases' ? 'NFTs you buy will appear here'
                                    : activeFilter === 'sales' ? 'NFTs you sell will appear here'
                                    : activeFilter === 'mints' ? 'NFTs you mint will appear here'
                                    : 'Your wallet activity will appear here'}
                            </Text>
                        </View>
                    )}
                </ScrollView>
            </View>
        </ScreenScaffold>
    );
}
