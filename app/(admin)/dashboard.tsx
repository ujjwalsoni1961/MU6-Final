import React from 'react';
import { View, Text, Platform } from 'react-native';
import {
    Users, Music, Radio, Disc3, Tag, ShoppingBag,
    DollarSign, ListMusic, TrendingUp, ArrowRight,
} from 'lucide-react-native';
import { useRouter } from 'expo-router';
import AnimatedPressable from '../../src/components/shared/AnimatedPressable';
import { AdminScreen, AdminStatCard, StatusBadge } from '../../src/components/admin/AdminScreenWrapper';
import { useAdminFullStats } from '../../src/hooks/useAdminData';
import { useAdminUsers, useAdminTransactions } from '../../src/hooks/useData';

const isWeb = Platform.OS === 'web';

function QuickLink({ label, Icon, path }: { label: string; Icon: any; path: string }) {
    const router = useRouter();
    return (
        <AnimatedPressable
            preset="card" hapticType="none"
            onPress={() => router.push(path as any)}
            style={{
                flexDirection: 'row', alignItems: 'center',
                backgroundColor: '#0f1724', borderRadius: 12,
                padding: 14, marginBottom: 8,
                borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
            }}
        >
            <Icon size={16} color="#38b4ba" />
            <Text style={{ flex: 1, color: '#f1f5f9', fontSize: 14, fontWeight: '600', marginLeft: 12 }}>{label}</Text>
            <ArrowRight size={14} color="#475569" />
        </AnimatedPressable>
    );
}

export default function AdminDashboardScreen() {
    const { data: stats, loading: loadingStats, refresh } = useAdminFullStats();
    const { data: recentUsers } = useAdminUsers(5);
    const { data: recentTxns } = useAdminTransactions(5);

    return (
        <AdminScreen title="Dashboard" subtitle="Platform overview and management" loading={loadingStats} onRetry={refresh}>
            {/* Stats Grid */}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 32 }}>
                <AdminStatCard title="Total Users" value={stats.totalUsers} icon={<Users size={20} color="#38b4ba" />} />
                <AdminStatCard title="Artists" value={stats.totalArtists} icon={<Users size={20} color="#a78bfa" />} accent="#a78bfa" />
                <AdminStatCard title="Consumers" value={stats.totalConsumers} icon={<Users size={20} color="#60a5fa" />} accent="#60a5fa" />
                <AdminStatCard title="Songs" value={stats.totalSongs} icon={<Music size={20} color="#8b5cf6" />} accent="#8b5cf6" />
                <AdminStatCard title="Streams" value={stats.totalStreams} icon={<Radio size={20} color="#38b4ba" />} />
                <AdminStatCard title="NFT Releases" value={stats.totalNFTReleases} icon={<Disc3 size={20} color="#f59e0b" />} accent="#f59e0b" />
                <AdminStatCard title="NFT Tokens" value={stats.totalNFTTokens} icon={<Tag size={20} color="#4ade80" />} accent="#4ade80" />
                <AdminStatCard title="Listings" value={stats.totalListings} icon={<ShoppingBag size={20} color="#f87171" />} accent="#f87171" />
                <AdminStatCard title="Royalty Events" value={stats.totalRoyaltyEvents} icon={<DollarSign size={20} color="#facc15" />} accent="#facc15" />
                <AdminStatCard title="Playlists" value={stats.totalPlaylists} icon={<ListMusic size={20} color="#94a3b8" />} accent="#94a3b8" />
            </View>

            {/* Two-column on web: Recent Users + Recent Transactions */}
            <View style={isWeb ? { flexDirection: 'row', gap: 24 } : {}}>
                {/* Recent Users */}
                <View style={{ flex: 1, marginBottom: 24 }}>
                    <Text style={{ fontSize: 18, fontWeight: '700', color: '#f1f5f9', marginBottom: 12 }}>
                        Recent Users
                    </Text>
                    <View style={{ backgroundColor: '#0f1724', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                        {recentUsers.length === 0 ? (
                            <View style={{ padding: 20 }}><Text style={{ color: '#475569' }}>No users yet</Text></View>
                        ) : recentUsers.map((user, i) => (
                            <View key={user.id} style={{
                                flexDirection: 'row', alignItems: 'center', padding: 14,
                                borderBottomWidth: i < recentUsers.length - 1 ? 1 : 0,
                                borderBottomColor: 'rgba(255,255,255,0.04)',
                            }}>
                                <View style={{
                                    width: 36, height: 36, borderRadius: 18,
                                    backgroundColor: 'rgba(56,180,186,0.1)',
                                    alignItems: 'center', justifyContent: 'center',
                                }}>
                                    <Text style={{ color: '#38b4ba', fontWeight: '700', fontSize: 14 }}>
                                        {(user.name || '?')[0].toUpperCase()}
                                    </Text>
                                </View>
                                <View style={{ flex: 1, marginLeft: 12 }}>
                                    <Text style={{ color: '#f1f5f9', fontWeight: '600', fontSize: 13 }}>{user.name}</Text>
                                    <Text style={{ color: '#475569', fontSize: 11 }}>{user.joinedDate}</Text>
                                </View>
                                <StatusBadge status={user.role} />
                            </View>
                        ))}
                    </View>
                </View>

                {/* Recent Transactions */}
                <View style={{ flex: 1, marginBottom: 24 }}>
                    <Text style={{ fontSize: 18, fontWeight: '700', color: '#f1f5f9', marginBottom: 12 }}>
                        Recent Transactions
                    </Text>
                    <View style={{ backgroundColor: '#0f1724', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                        {recentTxns.length === 0 ? (
                            <View style={{ padding: 20 }}><Text style={{ color: '#475569' }}>No transactions yet</Text></View>
                        ) : recentTxns.map((tx, i) => (
                            <View key={tx.id} style={{
                                flexDirection: 'row', alignItems: 'center', padding: 14,
                                borderBottomWidth: i < recentTxns.length - 1 ? 1 : 0,
                                borderBottomColor: 'rgba(255,255,255,0.04)',
                            }}>
                                <View style={{ flex: 1 }}>
                                    <Text style={{ color: '#f1f5f9', fontWeight: '600', fontSize: 13 }}>{tx.songTitle || 'Unknown'}</Text>
                                    <Text style={{ color: '#475569', fontSize: 11 }}>{tx.date ? new Date(tx.date).toLocaleDateString() : ''}</Text>
                                </View>
                                <Text style={{ color: '#38b4ba', fontWeight: '700', fontSize: 13, marginRight: 8 }}>
                                    {tx.price?.toFixed(4)} POL
                                </Text>
                                <StatusBadge status={tx.status} />
                            </View>
                        ))}
                    </View>
                </View>
            </View>

            {/* Quick Links */}
            <Text style={{ fontSize: 18, fontWeight: '700', color: '#f1f5f9', marginBottom: 12 }}>Quick Links</Text>
            <QuickLink label="Manage Users" Icon={Users} path="/(admin)/users" />
            <QuickLink label="View All Songs" Icon={Music} path="/(admin)/songs" />
            <QuickLink label="NFT Releases" Icon={Disc3} path="/(admin)/nft-releases" />
            <QuickLink label="View Streams" Icon={Radio} path="/(admin)/streams" />
            <QuickLink label="Platform Settings" Icon={TrendingUp} path="/(admin)/platform-settings" />
        </AdminScreen>
    );
}
