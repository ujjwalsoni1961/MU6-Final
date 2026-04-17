import React, { useCallback, useEffect, useState, useMemo } from 'react';
import { View, Text, Platform } from 'react-native';
import { Users, CheckCircle, Clock, Mail } from 'lucide-react-native';
import { AdminScreen, AdminDataTable, StatusBadge, AdminFilterPills, AdminStatCard } from '../../src/components/admin/AdminScreenWrapper';
import { getUnregisteredAccruedRevenue, UnregisteredAccruedRow } from '../../src/services/database';
import { useTheme } from '../../src/context/ThemeContext';

const isWeb = Platform.OS === 'web';

type Filter = 'all' | 'unregistered' | 'registered';

export default function AdminUnregisteredRevenueScreen() {
    const { colors } = useTheme();
    const [filter, setFilter] = useState<Filter>('all');
    const [rows, setRows] = useState<UnregisteredAccruedRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const refresh = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const onlyRegistered =
                filter === 'all' ? null :
                filter === 'registered' ? true :
                false;
            const data = await getUnregisteredAccruedRevenue(onlyRegistered);
            setRows(data);
        } catch (e: any) {
            setError(e?.message ?? 'Failed to load data');
        } finally {
            setLoading(false);
        }
    }, [filter]);

    useEffect(() => {
        refresh();
    }, [refresh]);

    const stats = useMemo(() => {
        const total = rows.reduce((sum, r) => sum + r.totalAccruedEur, 0);
        const registered = rows.filter((r) => r.isRegistered);
        const unregistered = rows.filter((r) => !r.isRegistered);
        const uniqueEmails = new Set(rows.map((r) => r.email)).size;
        return {
            total,
            registeredCount: registered.length,
            registeredTotal: registered.reduce((s, r) => s + r.totalAccruedEur, 0),
            unregisteredCount: unregistered.length,
            unregisteredTotal: unregistered.reduce((s, r) => s + r.totalAccruedEur, 0),
            uniqueEmails,
        };
    }, [rows]);

    const columns = [
        { label: 'Collaborator', flex: 1.2 },
        { label: 'Song', flex: 1.2 },
        { label: 'Accrued (EUR)', flex: 0.8 },
        { label: 'Shares', flex: 0.5 },
        { label: 'Status', flex: 0.8 },
        { label: 'Last Accrued', flex: 0.8 },
    ];

    return (
        <AdminScreen
            title="Split Sheet — Unregistered Accrued Revenue"
            subtitle={!loading ? `${stats.uniqueEmails} collaborators · ${rows.length} rows · €${stats.total.toFixed(2)} total` : 'Loading...'}
            loading={loading}
            error={error}
            onRetry={refresh}
        >
            {/* Stat cards */}
            {isWeb && (
                <View style={{ flexDirection: 'row', gap: 12, marginBottom: 16, paddingHorizontal: 16, flexWrap: 'wrap' }}>
                    <AdminStatCard
                        title="Total Accrued"
                        value={`€${stats.total.toFixed(2)}`}
                        icon={<Users size={18} color={colors.accent.cyan} />}
                        accent={colors.accent.cyan}
                    />
                    <AdminStatCard
                        title="Ready to Claim (Registered)"
                        value={`€${stats.registeredTotal.toFixed(2)}`}
                        icon={<CheckCircle size={18} color={colors.status.success} />}
                        accent={colors.status.success}
                    />
                    <AdminStatCard
                        title="Awaiting Registration"
                        value={`€${stats.unregisteredTotal.toFixed(2)}`}
                        icon={<Clock size={18} color="#f59e0b" />}
                        accent="#f59e0b"
                    />
                </View>
            )}

            <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
                <AdminFilterPills
                    options={[
                        { value: 'all', label: `All (${rows.length})` },
                        { value: 'unregistered', label: 'Awaiting Registration' },
                        { value: 'registered', label: 'Registered — Ready to Claim' },
                    ]}
                    selected={filter}
                    onSelect={(v: string) => setFilter(v as Filter)}
                />
            </View>

            <AdminDataTable
                headers={['Collaborator', 'Song', 'Accrued (EUR)', 'Shares', 'Status', 'Last Accrued']}
                columns={columns}
                data={rows}
                emptyMessage="No accrued revenue found for this filter"
                minTableWidth={1000}
                renderRow={(r: UnregisteredAccruedRow) => (
                    <View style={{
                        flexDirection: isWeb ? 'row' : 'column',
                        alignItems: isWeb ? 'center' : 'flex-start',
                        padding: 14,
                    }}>
                        {isWeb ? (
                            <>
                                <View style={{ flex: 1.2, flexDirection: 'row', alignItems: 'center' }}>
                                    <Mail size={16} color={r.isRegistered ? colors.status.success : '#f59e0b'} style={{ marginRight: 10 }} />
                                    <View style={{ flex: 1 }}>
                                        <Text style={{ color: colors.text.primary, fontSize: 13, fontWeight: '600' }} numberOfLines={1}>
                                            {r.partyNameHint || r.email}
                                        </Text>
                                        <Text style={{ color: colors.text.muted, fontSize: 11 }} numberOfLines={1}>
                                            {r.email}
                                        </Text>
                                    </View>
                                </View>
                                <Text style={{ flex: 1.2, color: colors.text.primary, fontSize: 13 }} numberOfLines={2}>
                                    {r.songTitle}
                                </Text>
                                <Text style={{ flex: 0.8, color: colors.status.success, fontSize: 13, fontWeight: '700' }}>
                                    €{r.totalAccruedEur.toFixed(4)}
                                </Text>
                                <Text style={{ flex: 0.5, color: colors.text.secondary, fontSize: 12 }}>
                                    {r.shareCount}
                                </Text>
                                <View style={{ flex: 0.8 }}>
                                    <StatusBadge
                                        status={r.isRegistered ? 'registered' : 'pending'}
                                        color={r.isRegistered ? colors.status.success : '#f59e0b'}
                                    />
                                </View>
                                <Text style={{ flex: 0.8, color: colors.text.muted, fontSize: 12 }}>
                                    {new Date(r.lastAccruedAt).toLocaleDateString()}
                                </Text>
                            </>
                        ) : (
                            <>
                                <View style={{ flexDirection: 'row', alignItems: 'center', width: '100%', marginBottom: 6 }}>
                                    <Mail size={18} color={r.isRegistered ? colors.status.success : '#f59e0b'} style={{ marginRight: 10 }} />
                                    <View style={{ flex: 1 }}>
                                        <Text style={{ color: colors.text.primary, fontSize: 14, fontWeight: '600' }}>
                                            {r.partyNameHint || r.email}
                                        </Text>
                                        <Text style={{ color: colors.text.muted, fontSize: 11 }}>{r.email}</Text>
                                    </View>
                                    <StatusBadge
                                        status={r.isRegistered ? 'registered' : 'pending'}
                                        color={r.isRegistered ? colors.status.success : '#f59e0b'}
                                    />
                                </View>
                                <Text style={{ color: colors.text.secondary, fontSize: 13, marginBottom: 4 }}>
                                    {r.songTitle}
                                </Text>
                                <Text style={{ color: colors.status.success, fontSize: 13, fontWeight: '700' }}>
                                    €{r.totalAccruedEur.toFixed(4)} · {r.shareCount} share{r.shareCount === 1 ? '' : 's'}
                                </Text>
                            </>
                        )}
                    </View>
                )}
            />

            <View style={{ padding: 16 }}>
                <Text style={{ color: colors.text.muted, fontSize: 12, lineHeight: 18 }}>
                    How this works: streaming royalties for split-sheet collaborators who aren't registered on MU6 accrue here.
                    When they create an account with the same email, their accrued shares auto-link to the new profile, and they
                    can submit payout requests like any other creator. NFT sale revenue is not included — per platform policy,
                    NFT sales pay the primary creator only.
                </Text>
            </View>
        </AdminScreen>
    );
}
