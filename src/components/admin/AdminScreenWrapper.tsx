import React from 'react';
import { View, Text, ScrollView, Platform, ActivityIndicator, TextInput } from 'react-native';
import { Search, RefreshCw } from 'lucide-react-native';
import AnimatedPressable from '../shared/AnimatedPressable';

const isWeb = Platform.OS === 'web';

/* ─── Screen wrapper with header ─── */
export function AdminScreen({
    title,
    subtitle,
    children,
    loading,
    error,
    onRetry,
    rightAction,
}: {
    title: string;
    subtitle?: string;
    children: React.ReactNode;
    loading?: boolean;
    error?: string | null;
    onRetry?: () => void;
    rightAction?: React.ReactNode;
}) {
    return (
        <View style={{ flex: 1, backgroundColor: '#030711' }}>
            <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={{ padding: isWeb ? 32 : 16, paddingBottom: 60 }}
                showsVerticalScrollIndicator={false}
            >
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
                    <View>
                        <Text style={{ fontSize: isWeb ? 28 : 24, fontWeight: '800', color: '#f1f5f9', letterSpacing: -1 }}>
                            {title}
                        </Text>
                        {subtitle ? (
                            <Text style={{ fontSize: 14, color: '#64748b', marginTop: 4 }}>{subtitle}</Text>
                        ) : null}
                    </View>
                    {rightAction || (onRetry ? (
                        <AnimatedPressable preset="icon" hapticType="none" onPress={onRetry} style={{ padding: 8 }}>
                            <RefreshCw size={18} color="#64748b" />
                        </AnimatedPressable>
                    ) : null)}
                </View>

                {loading ? (
                    <View style={{ padding: 60, alignItems: 'center' }}>
                        <ActivityIndicator size="large" color="#38b4ba" />
                    </View>
                ) : error ? (
                    <View style={{ padding: 40, alignItems: 'center' }}>
                        <Text style={{ color: '#f87171', fontSize: 14, marginBottom: 12 }}>{error}</Text>
                        {onRetry && (
                            <AnimatedPressable preset="card" hapticType="none" onPress={onRetry}
                                style={{ backgroundColor: 'rgba(56,180,186,0.1)', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10 }}>
                                <Text style={{ color: '#38b4ba', fontWeight: '600' }}>Retry</Text>
                            </AnimatedPressable>
                        )}
                    </View>
                ) : children}
            </ScrollView>
        </View>
    );
}

/* ─── Search bar ─── */
export function AdminSearchBar({
    value,
    onChangeText,
    placeholder = 'Search...',
}: {
    value: string;
    onChangeText: (text: string) => void;
    placeholder?: string;
}) {
    return (
        <View style={{
            flexDirection: 'row', alignItems: 'center',
            backgroundColor: 'rgba(255,255,255,0.04)',
            borderRadius: 12, borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.08)',
            paddingHorizontal: 14, marginBottom: 20,
        }}>
            <Search size={16} color="#475569" />
            <TextInput
                value={value}
                onChangeText={onChangeText}
                placeholder={placeholder}
                placeholderTextColor="#475569"
                style={{
                    flex: 1, padding: 12, color: '#f1f5f9', fontSize: 14,
                    ...(isWeb ? { outlineStyle: 'none' } as any : {}),
                }}
            />
        </View>
    );
}

/* ─── Filter pills ─── */
export function AdminFilterPills({
    options,
    selected,
    onSelect,
}: {
    options: { label: string; value: string }[];
    selected: string;
    onSelect: (value: string) => void;
}) {
    return (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
            {options.map((opt) => {
                const active = selected === opt.value;
                return (
                    <AnimatedPressable
                        key={opt.value}
                        preset="row"
                        hapticType="none"
                        onPress={() => onSelect(opt.value)}
                        style={{
                            paddingHorizontal: 14, paddingVertical: 8,
                            borderRadius: 20,
                            backgroundColor: active ? 'rgba(56,180,186,0.15)' : 'rgba(255,255,255,0.04)',
                            borderWidth: 1,
                            borderColor: active ? 'rgba(56,180,186,0.3)' : 'rgba(255,255,255,0.08)',
                        }}
                    >
                        <Text style={{ color: active ? '#38b4ba' : '#94a3b8', fontSize: 12, fontWeight: '600' }}>
                            {opt.label}
                        </Text>
                    </AnimatedPressable>
                );
            })}
        </View>
    );
}

/* ─── Data table ─── */
export function AdminDataTable({
    headers,
    data,
    renderRow,
    emptyMessage = 'No data found',
}: {
    headers: string[];
    data: any[];
    renderRow: (item: any, index: number) => React.ReactNode;
    emptyMessage?: string;
}) {
    if (data.length === 0) {
        return (
            <View style={{ padding: 40, alignItems: 'center' }}>
                <Text style={{ color: '#475569', fontSize: 14 }}>{emptyMessage}</Text>
            </View>
        );
    }

    return (
        <View style={{
            borderRadius: 16,
            backgroundColor: '#0f1724',
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.06)',
            overflow: 'hidden',
        }}>
            {/* Header */}
            {isWeb && (
                <View style={{
                    flexDirection: 'row',
                    paddingHorizontal: 16,
                    paddingVertical: 12,
                    backgroundColor: 'rgba(255,255,255,0.02)',
                    borderBottomWidth: 1,
                    borderBottomColor: 'rgba(255,255,255,0.06)',
                }}>
                    {headers.map((h) => (
                        <Text key={h} style={{
                            flex: 1, color: '#475569', fontSize: 11,
                            fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1,
                        }}>
                            {h}
                        </Text>
                    ))}
                </View>
            )}
            {/* Rows */}
            {data.map((item, i) => (
                <View key={item.id || i} style={{
                    borderBottomWidth: i < data.length - 1 ? 1 : 0,
                    borderBottomColor: 'rgba(255,255,255,0.04)',
                }}>
                    {renderRow(item, i)}
                </View>
            ))}
        </View>
    );
}

/* ─── Stat card for dashboard ─── */
export function AdminStatCard({
    title,
    value,
    icon,
    accent = '#38b4ba',
}: {
    title: string;
    value: string | number;
    icon: React.ReactNode;
    accent?: string;
}) {
    return (
        <View
            style={{
                flex: 1,
                minWidth: isWeb ? 180 : 140,
                margin: 6,
                padding: isWeb ? 20 : 16,
                borderRadius: 16,
                backgroundColor: '#0f1724',
                borderWidth: 1,
                borderColor: 'rgba(255,255,255,0.06)',
            }}
        >
            <View style={{ marginBottom: 12 }}>{icon}</View>
            <Text style={{ fontSize: isWeb ? 28 : 22, fontWeight: '800', color: '#f1f5f9' }}>
                {value}
            </Text>
            <Text style={{
                fontSize: 10, fontWeight: '700', color: '#475569',
                textTransform: 'uppercase', letterSpacing: 1.5, marginTop: 4,
            }}>
                {title}
            </Text>
        </View>
    );
}

/* ─── Status badge ─── */
export function StatusBadge({ status, color }: { status: string; color?: string }) {
    const colors: Record<string, { bg: string; text: string }> = {
        active: { bg: 'rgba(34,197,94,0.15)', text: '#4ade80' },
        completed: { bg: 'rgba(34,197,94,0.15)', text: '#4ade80' },
        pending: { bg: 'rgba(234,179,8,0.15)', text: '#facc15' },
        failed: { bg: 'rgba(239,68,68,0.15)', text: '#f87171' },
        suspended: { bg: 'rgba(239,68,68,0.15)', text: '#f87171' },
        blocked: { bg: 'rgba(239,68,68,0.15)', text: '#f87171' },
        disabled: { bg: 'rgba(239,68,68,0.15)', text: '#f87171' },
        delisted: { bg: 'rgba(234,179,8,0.15)', text: '#facc15' },
        featured: { bg: 'rgba(139,92,246,0.15)', text: '#a78bfa' },
        verified: { bg: 'rgba(34,197,94,0.15)', text: '#4ade80' },
        voided: { bg: 'rgba(239,68,68,0.15)', text: '#f87171' },
        flagged: { bg: 'rgba(249,115,22,0.15)', text: '#fb923c' },
        approved: { bg: 'rgba(34,197,94,0.15)', text: '#4ade80' },
        rejected: { bg: 'rgba(239,68,68,0.15)', text: '#f87171' },
        true: { bg: 'rgba(34,197,94,0.15)', text: '#4ade80' },
        false: { bg: 'rgba(239,68,68,0.15)', text: '#f87171' },
        creator: { bg: 'rgba(139,92,246,0.15)', text: '#a78bfa' },
        listener: { bg: 'rgba(56,180,186,0.15)', text: '#38b4ba' },
        admin: { bg: 'rgba(239,68,68,0.15)', text: '#f87171' },
        stream: { bg: 'rgba(56,180,186,0.15)', text: '#38b4ba' },
        primary_sale: { bg: 'rgba(139,92,246,0.15)', text: '#a78bfa' },
        secondary_sale: { bg: 'rgba(234,179,8,0.15)', text: '#facc15' },
        common: { bg: 'rgba(148,163,184,0.15)', text: '#94a3b8' },
        rare: { bg: 'rgba(56,180,186,0.15)', text: '#38b4ba' },
        legendary: { bg: 'rgba(234,179,8,0.15)', text: '#facc15' },
    };

    const c = colors[status?.toLowerCase()] || { bg: 'rgba(148,163,184,0.15)', text: '#94a3b8' };

    return (
        <View style={{ backgroundColor: c.bg, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3 }}>
            <Text style={{ color: c.text, fontSize: 11, fontWeight: '600', textTransform: 'capitalize' }}>
                {status}
            </Text>
        </View>
    );
}

/* ─── Pagination ─── */
export function AdminPagination({
    offset,
    limit,
    total,
    onPrev,
    onNext,
}: {
    offset: number;
    limit: number;
    total: number;
    onPrev: () => void;
    onNext: () => void;
}) {
    const currentPage = Math.floor(offset / limit) + 1;
    const totalPages = Math.ceil(total / limit);

    if (totalPages <= 1) return null;

    return (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 20, gap: 16 }}>
            <AnimatedPressable
                preset="row" hapticType="none"
                onPress={onPrev}
                style={{
                    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10,
                    backgroundColor: offset > 0 ? 'rgba(56,180,186,0.1)' : 'rgba(255,255,255,0.02)',
                    opacity: offset > 0 ? 1 : 0.4,
                }}
            >
                <Text style={{ color: '#38b4ba', fontSize: 13, fontWeight: '600' }}>Previous</Text>
            </AnimatedPressable>
            <Text style={{ color: '#64748b', fontSize: 13 }}>
                Page {currentPage} of {totalPages}
            </Text>
            <AnimatedPressable
                preset="row" hapticType="none"
                onPress={onNext}
                style={{
                    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10,
                    backgroundColor: offset + limit < total ? 'rgba(56,180,186,0.1)' : 'rgba(255,255,255,0.02)',
                    opacity: offset + limit < total ? 1 : 0.4,
                }}
            >
                <Text style={{ color: '#38b4ba', fontSize: 13, fontWeight: '600' }}>Next</Text>
            </AnimatedPressable>
        </View>
    );
}
