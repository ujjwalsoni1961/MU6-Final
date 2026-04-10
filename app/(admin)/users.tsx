import React, { useState, useCallback } from 'react';
import { View, Text, Platform } from 'react-native';
import {
    AdminScreen, AdminSearchBar, AdminFilterPills,
    AdminDataTable, AdminPagination, StatusBadge,
} from '../../src/components/admin/AdminScreenWrapper';
import { useAdminUsersFiltered } from '../../src/hooks/useAdminData';

const isWeb = Platform.OS === 'web';
const PAGE_SIZE = 20;

const roleOptions = [
    { label: 'All Roles', value: '' },
    { label: 'Artist', value: 'creator' },
    { label: 'Listener', value: 'listener' },
    { label: 'Admin', value: 'admin' },
];

export default function AdminUsersScreen() {
    const [search, setSearch] = useState('');
    const [roleFilter, setRoleFilter] = useState('');
    const [offset, setOffset] = useState(0);

    const { data, loading, error, refresh } = useAdminUsersFiltered({
        search,
        role: roleFilter,
        limit: PAGE_SIZE,
        offset,
    });

    const handleSearch = useCallback((text: string) => {
        setSearch(text);
        setOffset(0);
    }, []);

    const handleRoleFilter = useCallback((role: string) => {
        setRoleFilter(role);
        setOffset(0);
    }, []);

    return (
        <AdminScreen
            title="Users"
            subtitle={!loading ? `${data.total} registered users` : undefined}
            loading={loading}
            error={error}
            onRetry={refresh}
        >
            <AdminSearchBar
                value={search}
                onChangeText={handleSearch}
                placeholder="Search by name, email, or wallet..."
            />

            <AdminFilterPills
                options={roleOptions}
                selected={roleFilter}
                onSelect={handleRoleFilter}
            />

            <AdminDataTable
                headers={['User', 'Email', 'Wallet', 'Role', 'Country', 'Joined']}
                data={data.users}
                emptyMessage="No users found"
                renderRow={(user) => (
                    <View style={{
                        flexDirection: isWeb ? 'row' : 'column',
                        alignItems: isWeb ? 'center' : 'flex-start',
                        padding: 14,
                    }}>
                        {isWeb ? (
                            <>
                                <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
                                    <View style={{
                                        width: 32, height: 32, borderRadius: 16,
                                        backgroundColor: 'rgba(56,180,186,0.1)',
                                        alignItems: 'center', justifyContent: 'center', marginRight: 10,
                                    }}>
                                        <Text style={{ color: '#38b4ba', fontWeight: '700', fontSize: 13 }}>
                                            {(user.name || '?')[0].toUpperCase()}
                                        </Text>
                                    </View>
                                    <View>
                                        <Text style={{ color: '#f1f5f9', fontWeight: '600', fontSize: 13 }}>{user.name}</Text>
                                        {user.isVerified && <Text style={{ color: '#4ade80', fontSize: 10 }}>Verified</Text>}
                                    </View>
                                </View>
                                <Text style={{ flex: 1, color: '#94a3b8', fontSize: 12 }}>{user.email || '—'}</Text>
                                <Text style={{ flex: 1, color: '#475569', fontSize: 11, fontFamily: 'monospace' }}>
                                    {user.walletAddress ? `${user.walletAddress.slice(0, 6)}...${user.walletAddress.slice(-4)}` : '—'}
                                </Text>
                                <View style={{ flex: 1 }}><StatusBadge status={user.role} /></View>
                                <Text style={{ flex: 1, color: '#94a3b8', fontSize: 12 }}>{user.country || '—'}</Text>
                                <Text style={{ flex: 1, color: '#475569', fontSize: 12 }}>
                                    {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : '—'}
                                </Text>
                            </>
                        ) : (
                            <>
                                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                                    <View style={{
                                        width: 36, height: 36, borderRadius: 18,
                                        backgroundColor: 'rgba(56,180,186,0.1)',
                                        alignItems: 'center', justifyContent: 'center', marginRight: 10,
                                    }}>
                                        <Text style={{ color: '#38b4ba', fontWeight: '700' }}>
                                            {(user.name || '?')[0].toUpperCase()}
                                        </Text>
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={{ color: '#f1f5f9', fontWeight: '600', fontSize: 14 }}>{user.name}</Text>
                                        <Text style={{ color: '#64748b', fontSize: 12 }}>{user.email || '—'}</Text>
                                    </View>
                                    <StatusBadge status={user.role} />
                                </View>
                                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                                    <Text style={{ color: '#475569', fontSize: 11 }}>
                                        {user.country || 'No country'} | {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : '—'}
                                    </Text>
                                </View>
                            </>
                        )}
                    </View>
                )}
            />

            <AdminPagination
                offset={offset}
                limit={PAGE_SIZE}
                total={data.total}
                onPrev={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                onNext={() => { if (offset + PAGE_SIZE < data.total) setOffset(offset + PAGE_SIZE); }}
            />
        </AdminScreen>
    );
}
