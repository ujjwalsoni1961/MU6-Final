import React from 'react';
import { View, Text } from 'react-native';
import { ShoppingCart, Coins, ArrowUpRight, Tag } from 'lucide-react-native';
import GlassCard from './GlassCard';

interface TransactionRowProps {
    type: 'purchase' | 'royalty' | 'withdrawal' | 'listing';
    songTitle?: string;
    amount: number;
    date: string;
    status: 'completed' | 'pending' | 'failed';
}

const typeIcons: Record<string, React.ComponentType<{ size: number; color: string }>> = {
    purchase: ShoppingCart,
    royalty: Coins,
    withdrawal: ArrowUpRight,
    listing: Tag,
};

import { useTheme } from '../../context/ThemeContext';

export default function TransactionRow({ type, songTitle, amount, date, status }: TransactionRowProps) {
    const { isDark, colors } = useTheme();
    const IconComponent = typeIcons[type];

    // Dynamic status styles based on theme
    const statusStyles: Record<string, { bg: string; text: string }> = {
        completed: {
            bg: isDark ? 'rgba(34,197,94,0.15)' : 'rgba(34,197,94,0.15)', // Keep bg same
            text: isDark ? '#4ade80' : '#16a34a' // Lighter green for dark mode
        },
        pending: {
            bg: isDark ? 'rgba(245,158,11,0.15)' : 'rgba(245,158,11,0.15)',
            text: isDark ? '#facc15' : '#d97706' // Lighter yellow
        },
        failed: {
            bg: isDark ? 'rgba(239,68,68,0.15)' : 'rgba(239,68,68,0.15)',
            text: isDark ? '#f87171' : '#dc2626' // Lighter red
        },
    };

    const sts = statusStyles[status];

    return (
        <GlassCard intensity="light" style={{ marginBottom: 2, flexDirection: 'row', alignItems: 'center' }}>
            <View
                style={{
                    width: 40,
                    height: 40,
                    borderRadius: 20,
                    backgroundColor: 'rgba(116,229,234,0.12)', // Cyan tint looks good on both
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginRight: 12,
                }}
            >
                <IconComponent size={18} color="#38b4ba" />
            </View>
            <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text.primary, fontWeight: '600', fontSize: 13, textTransform: 'capitalize' }}>
                    {songTitle || type}
                </Text>
                <Text style={{ color: colors.text.secondary, fontSize: 11, marginTop: 2 }}>{date}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ color: colors.text.primary, fontWeight: '700', fontSize: 13 }}>{amount} ETH</Text>
                <View style={{ backgroundColor: sts.bg, borderRadius: 9999, paddingHorizontal: 8, paddingVertical: 2, marginTop: 4 }}>
                    <Text style={{ color: sts.text, fontSize: 10, fontWeight: '600', textTransform: 'capitalize' }}>{status}</Text>
                </View>
            </View>
        </GlassCard>
    );
}
