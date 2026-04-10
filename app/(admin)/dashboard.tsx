import React from 'react';
import { View, Text, ScrollView, Platform, ActivityIndicator } from 'react-native';
import AnimatedPressable from '../../src/components/shared/AnimatedPressable';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Users as UsersIcon, Music, ArrowLeftRight, DollarSign } from 'lucide-react-native';
import TransactionRow from '../../src/components/shared/TransactionRow';
import { useAdminUsers, useAdminTransactions, useAdminPlatformStats } from '../../src/hooks/useData';
import { useTheme } from '../../src/context/ThemeContext';
import { User, Transaction } from '../../src/types';

const isWeb = Platform.OS === 'web';

const roleColors: Record<string, { bg: string; text: string }> = {
    consumer: { bg: 'rgba(56,180,186,0.15)', text: '#38b4ba' },
    artist: { bg: 'rgba(139,92,246,0.15)', text: '#8b5cf6' },
    admin: { bg: 'rgba(100,116,139,0.15)', text: '#64748b' },
    listener: { bg: 'rgba(56,180,186,0.15)', text: '#38b4ba' },
    creator: { bg: 'rgba(139,92,246,0.15)', text: '#8b5cf6' },
};

function StatCard({ title, value, icon, accent }: { title: string; value: string | number; icon: React.ReactNode; accent?: string }) {
    const { isDark, colors } = useTheme();
    return (
        <View
            style={{
                flex: 1, margin: 6, padding: isWeb ? 24 : 16, borderRadius: 16,
                backgroundColor: isWeb ? (isDark ? colors.bg.card : '#fff') : (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.4)'),
                borderWidth: 1,
                borderColor: isDark ? 'rgba(255,255,255,0.06)' : (isWeb ? '#f1f5f9' : 'rgba(255,255,255,0.4)'),
                alignItems: 'center',
                shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.03, shadowRadius: 8,
            }}
        >
            {icon}
            <Text style={{ fontSize: isWeb ? 28 : 24, fontWeight: '800', color: accent || colors.text.primary, marginTop: 8 }}>{value}</Text>
            <Text style={{ fontSize: 10, fontWeight: '700', color: colors.text.secondary, textTransform: 'uppercase', letterSpacing: 1.5, marginTop: 4 }}>{title}</Text>
        </View>
    );
}

export default function AdminDashboardScreen() {
    const { isDark, colors } = useTheme();
    const { data: stats, loading: loadingStats } = useAdminPlatformStats();
    const { data: users, loading: loadingUsers } = useAdminUsers(10);
    const { data: transactions, loading: loadingTxns } = useAdminTransactions(5);

    const totalFees = transactions.filter((t) => t.fee).reduce((sum, t) => sum + (t.fee || 0), 0);
    const Container = isWeb ? View : SafeAreaView;

    return (
        <Container style={{ flex: 1, backgroundColor: isWeb ? (isDark ? colors.bg.base : '#f8fafc') : 'transparent' }}>
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: isWeb ? 32 : 16, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
                <Text style={{ fontSize: isWeb ? 28 : 24, fontWeight: '800', color: colors.text.primary, marginBottom: 4, letterSpacing: -1 }}>
                    Admin Dashboard
                </Text>
                <Text style={{ fontSize: 14, color: colors.text.secondary, marginBottom: 24 }}>Platform overview and management.</Text>

                {/* Stats */}
                {loadingStats ? (
                    <View style={{ padding: 40, alignItems: 'center' }}><ActivityIndicator size="small" color="#38b4ba" /></View>
                ) : (
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 28 }}>
                        <StatCard title="Total Users" value={stats.totalUsers} icon={<UsersIcon size={20} color="#38b4ba" />} />
                        <StatCard title="Total Songs" value={stats.totalSongs} icon={<Music size={20} color="#8b5cf6" />} />
                        <StatCard title="Listings" value={stats.totalListings} icon={<ArrowLeftRight size={20} color="#f59e0b" />} />
                        <StatCard title="Fees (POL)" value={totalFees.toFixed(4)} icon={<DollarSign size={20} color="#ef4444" />} accent="#38b4ba" />
                    </View>
                )}

                {/* Recent Transactions */}
                <Text style={{ fontSize: 22, fontWeight: '800', color: colors.text.primary, letterSpacing: -0.5, marginBottom: 12 }}>Recent Transactions</Text>
                {loadingTxns ? (
                    <View style={{ padding: 20, alignItems: 'center' }}><ActivityIndicator size="small" color="#38b4ba" /></View>
                ) : transactions.length > 0 ? (
                    <View style={{
                        borderRadius: 16,
                        backgroundColor: isWeb ? (isDark ? colors.bg.card : '#fff') : (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.4)'),
                        borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.06)' : (isWeb ? '#f1f5f9' : 'rgba(255,255,255,0.4)'),
                        overflow: 'hidden', marginBottom: 28,
                    }}>
                        {transactions.map((tx) => (
                            <TransactionRow key={tx.id} type={tx.type} songTitle={tx.songTitle} amount={tx.price} date={tx.date ? new Date(tx.date).toLocaleDateString() : ''} status={tx.status} />
                        ))}
                    </View>
                ) : (
                    <View style={{ padding: 20, marginBottom: 28 }}>
                        <Text style={{ color: colors.text.secondary }}>No transactions yet</Text>
                    </View>
                )}

                {/* New Users */}
                <Text style={{ fontSize: 22, fontWeight: '800', color: colors.text.primary, letterSpacing: -0.5, marginBottom: 12 }}>New Users</Text>
                {loadingUsers ? (
                    <View style={{ padding: 20, alignItems: 'center' }}><ActivityIndicator size="small" color="#38b4ba" /></View>
                ) : (
                    users.map((user: User) => {
                        const rc = roleColors[user.role] || roleColors.consumer;
                        return (
                            <AnimatedPressable
                                key={user.id}
                                preset="row"
                                hapticType="none"
                                style={{
                                    flexDirection: 'row', alignItems: 'center',
                                    marginBottom: 6, padding: 14, borderRadius: 12,
                                    backgroundColor: isWeb ? (isDark ? colors.bg.card : '#f8fafc') : (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.3)'),
                                    borderWidth: 1,
                                    borderColor: isDark ? 'rgba(255,255,255,0.06)' : (isWeb ? '#f1f5f9' : 'rgba(255,255,255,0.3)'),
                                }}
                            >
                                <Image source={{ uri: user.avatar }} style={{ width: 40, height: 40, borderRadius: 20 }} contentFit="cover" />
                                <View style={{ flex: 1, marginLeft: 12 }}>
                                    <Text style={{ color: colors.text.primary, fontWeight: '600', fontSize: 13 }}>{user.name}</Text>
                                    <Text style={{ color: colors.text.secondary, fontSize: 11, marginTop: 2 }}>Joined {user.joinedDate}</Text>
                                </View>
                                <View style={{ backgroundColor: rc.bg, borderRadius: 9999, paddingHorizontal: 8, paddingVertical: 2 }}>
                                    <Text style={{ color: rc.text, fontSize: 10, fontWeight: '600', textTransform: 'capitalize' }}>{user.role}</Text>
                                </View>
                            </AnimatedPressable>
                        );
                    })
                )}
            </ScrollView>
        </Container>
    );
}
