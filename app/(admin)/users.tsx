import React, { useState, useCallback } from 'react';
import { View, Text, Platform } from 'react-native';
import { UserX, Trash2, ShieldCheck, ShieldOff, Ban } from 'lucide-react-native';
import {
    AdminScreen, AdminSearchBar, AdminFilterPills,
    AdminDataTable, AdminPagination, StatusBadge,
} from '../../src/components/admin/AdminScreenWrapper';
import {
    ActionButton, ToggleSwitch, ConfirmModal, RowActions,
} from '../../src/components/admin/AdminActionComponents';
import { useAdminUsersFiltered } from '../../src/hooks/useAdminData';
import { useAdminUserActions } from '../../src/hooks/useAdminActions';
import { useTheme } from '../../src/context/ThemeContext';

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
    const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
    const [blockTarget, setBlockTarget] = useState<{ id: string; name: string; isBlocked: boolean } | null>(null);
    const [actionLoading, setActionLoading] = useState(false);
    const { colors } = useTheme();

    const { data, loading, error, refresh } = useAdminUsersFiltered({
        search,
        role: roleFilter,
        limit: PAGE_SIZE,
        offset,
    });

    const actions = useAdminUserActions(refresh);

    const handleSearch = useCallback((text: string) => {
        setSearch(text);
        setOffset(0);
    }, []);

    const handleRoleFilter = useCallback((role: string) => {
        setRoleFilter(role);
        setOffset(0);
    }, []);

    const handleDelete = async () => {
        if (!deleteTarget) return;
        setActionLoading(true);
        await actions.deleteUser(deleteTarget.id);
        setActionLoading(false);
        setDeleteTarget(null);
    };

    const handleBlock = async () => {
        if (!blockTarget) return;
        setActionLoading(true);
        await actions.toggleBlocked(blockTarget.id, blockTarget.isBlocked);
        setActionLoading(false);
        setBlockTarget(null);
    };

    const userColumns = [
        { label: 'User', flex: 1.2 },
        { label: 'Email', flex: 1 },
        { label: 'Role', flex: 0.7 },
        { label: 'Status', flex: 0.8 },
        { label: 'Actions', flex: 1.5 },
    ];

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
                headers={['User', 'Email', 'Role', 'Status', 'Actions']}
                columns={userColumns}
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
                                <View style={{ flex: 1.2, flexDirection: 'row', alignItems: 'center' }}>
                                    <View style={{
                                        width: 32, height: 32, borderRadius: 16,
                                        backgroundColor: user.isBlocked ? `${colors.status.error}15` : `${colors.accent.cyan}15`,
                                        alignItems: 'center', justifyContent: 'center', marginRight: 10,
                                    }}>
                                        <Text style={{ color: user.isBlocked ? colors.status.error : colors.accent.cyan, fontWeight: '700', fontSize: 13 }}>
                                            {(user.name || '?')[0].toUpperCase()}
                                        </Text>
                                    </View>
                                    <View>
                                        <Text style={{ color: colors.text.primary, fontWeight: '600', fontSize: 13 }}>{user.name}</Text>
                                        {user.isVerified && <Text style={{ color: colors.status.success, fontSize: 10 }}>Verified</Text>}
                                    </View>
                                </View>
                                <Text style={{ flex: 1, color: colors.text.secondary, fontSize: 12 }}>{user.email || '—'}</Text>
                                <View style={{ flex: 0.7 }}><StatusBadge status={user.role} /></View>
                                <View style={{ flex: 0.8, flexDirection: 'row', gap: 4, flexWrap: 'wrap' }}>
                                    {!user.isActive && <StatusBadge status="disabled" />}
                                    {user.isBlocked && <StatusBadge status="blocked" />}
                                    {user.isActive && !user.isBlocked && <StatusBadge status="active" />}
                                </View>
                                <View style={{ flex: 1.5 }}>
                                    <RowActions>
                                        <ToggleSwitch
                                            value={user.isActive}
                                            onToggle={() => actions.toggleActive(user.id, user.isActive)}
                                            label="Active"
                                            activeColor={colors.status.success}
                                        />
                                        {user.role === 'creator' && (
                                            <ActionButton
                                                icon={user.isVerified ? <ShieldOff size={12} color={colors.status.warning} /> : <ShieldCheck size={12} color={colors.status.success} />}
                                                label={user.isVerified ? 'Unverify' : 'Verify'}
                                                color={user.isVerified ? colors.status.warning : colors.status.success}
                                                onPress={() => actions.toggleVerified(user.id, user.isVerified)}
                                            />
                                        )}
                                        <ActionButton
                                            icon={<Ban size={12} color={user.isBlocked ? colors.accent.cyan : colors.status.error} />}
                                            label={user.isBlocked ? 'Unblock' : 'Block'}
                                            color={user.isBlocked ? colors.accent.cyan : colors.status.error}
                                            onPress={() => setBlockTarget({ id: user.id, name: user.name, isBlocked: user.isBlocked })}
                                        />
                                        <ActionButton
                                            icon={<Trash2 size={12} color={colors.status.error} />}
                                            color={colors.status.error}
                                            onPress={() => setDeleteTarget({ id: user.id, name: user.name })}
                                        />
                                    </RowActions>
                                </View>
                            </>
                        ) : (
                            <>
                                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                                    <View style={{
                                        width: 36, height: 36, borderRadius: 18,
                                        backgroundColor: user.isBlocked ? `${colors.status.error}15` : `${colors.accent.cyan}15`,
                                        alignItems: 'center', justifyContent: 'center', marginRight: 10,
                                    }}>
                                        <Text style={{ color: user.isBlocked ? colors.status.error : colors.accent.cyan, fontWeight: '700' }}>
                                            {(user.name || '?')[0].toUpperCase()}
                                        </Text>
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={{ color: colors.text.primary, fontWeight: '600', fontSize: 14 }}>{user.name}</Text>
                                        <Text style={{ color: colors.text.secondary, fontSize: 12 }}>{user.email || '—'}</Text>
                                    </View>
                                    <StatusBadge status={user.role} />
                                </View>
                                <View style={{ flexDirection: 'row', gap: 4, marginBottom: 8, flexWrap: 'wrap' }}>
                                    {!user.isActive && <StatusBadge status="disabled" />}
                                    {user.isBlocked && <StatusBadge status="blocked" />}
                                </View>
                                <RowActions>
                                    <ToggleSwitch
                                        value={user.isActive}
                                        onToggle={() => actions.toggleActive(user.id, user.isActive)}
                                        label="Active"
                                    />
                                    {user.role === 'creator' && (
                                        <ActionButton
                                            icon={user.isVerified ? <ShieldOff size={12} color={colors.status.warning} /> : <ShieldCheck size={12} color={colors.status.success} />}
                                            label={user.isVerified ? 'Unverify' : 'Verify'}
                                            color={user.isVerified ? colors.status.warning : colors.status.success}
                                            onPress={() => actions.toggleVerified(user.id, user.isVerified)}
                                        />
                                    )}
                                    <ActionButton
                                        icon={<Ban size={12} color={colors.status.error} />}
                                        label={user.isBlocked ? 'Unblock' : 'Block'}
                                        color={colors.status.error}
                                        onPress={() => setBlockTarget({ id: user.id, name: user.name, isBlocked: user.isBlocked })}
                                    />
                                    <ActionButton
                                        icon={<Trash2 size={12} color={colors.status.error} />}
                                        color={colors.status.error}
                                        onPress={() => setDeleteTarget({ id: user.id, name: user.name })}
                                    />
                                </RowActions>
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

            {/* Delete Confirmation Modal */}
            <ConfirmModal
                visible={!!deleteTarget}
                title="Delete User"
                message={`Are you sure you want to permanently delete "${deleteTarget?.name}"? This action cannot be undone.`}
                confirmLabel="Delete"
                confirmColor="#ef4444"
                onConfirm={handleDelete}
                onCancel={() => setDeleteTarget(null)}
                loading={actionLoading}
            />

            {/* Block Confirmation Modal */}
            <ConfirmModal
                visible={!!blockTarget}
                title={blockTarget?.isBlocked ? 'Unblock User' : 'Block User'}
                message={blockTarget?.isBlocked
                    ? `Are you sure you want to unblock "${blockTarget?.name}"? They will be able to log in and interact with the platform again.`
                    : `Are you sure you want to block "${blockTarget?.name}"? They will not be able to log in or interact with the platform.`
                }
                confirmLabel={blockTarget?.isBlocked ? 'Unblock' : 'Block'}
                confirmColor={blockTarget?.isBlocked ? colors.accent.cyan : '#ef4444'}
                onConfirm={handleBlock}
                onCancel={() => setBlockTarget(null)}
                loading={actionLoading}
            />
        </AdminScreen>
    );
}
