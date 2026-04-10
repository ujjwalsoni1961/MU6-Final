import React from 'react';
import { View, Text, FlatList } from 'react-native';
import { TradeEvent } from '../../types';
import { Sparkles, ArrowRightLeft } from 'lucide-react-native';

interface TradeHistoryListProps {
    data: TradeEvent[];
    isDark?: boolean;
}

export default function TradeHistoryList({ data, isDark = true }: TradeHistoryListProps) {
    if (!data || data.length === 0) {
        return (
            <View style={{ padding: 20, alignItems: 'center' }}>
                <Text style={{ color: isDark ? '#64748b' : '#94a3b8' }}>No trade history found.</Text>
            </View>
        );
    }

    const formatAddress = (addr: string) => {
        if (!addr || addr === 'Unknown') return 'Unknown';
        if (addr.toLowerCase() === 'creator') return 'Creator';
        if (addr.length > 12) {
            return `${addr.substring(0, 6)}...${addr.substring(addr.length - 4)}`;
        }
        return addr;
    };

    const renderItem = ({ item }: { item: TradeEvent }) => {
        const isMint = item.type === 'mint';
        const dateStr = new Date(item.date).toLocaleDateString(undefined, {
            year: 'numeric', month: 'short', day: 'numeric'
        });

        return (
            <View style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                paddingVertical: 14,
                borderBottomWidth: 1,
                borderBottomColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
                alignItems: 'center'
            }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                    <View style={{
                        width: 40, height: 40, borderRadius: 20,
                        backgroundColor: isMint ? 'rgba(139,92,246,0.1)' : 'rgba(56,189,248,0.1)',
                        justifyContent: 'center', alignItems: 'center',
                        marginRight: 12
                    }}>
                        {isMint ? <Sparkles size={18} color="#8b5cf6" /> : <ArrowRightLeft size={18} color="#38bdf8" />}
                    </View>
                    
                    <View>
                        <Text style={{ color: isDark ? '#fff' : '#0f172a', fontSize: 15, fontWeight: '600', marginBottom: 2 }}>
                            {isMint ? 'Minted' : 'Sale'}
                        </Text>
                        <Text style={{ color: isDark ? '#94a3b8' : '#64748b', fontSize: 13 }}>
                            {dateStr}
                        </Text>
                    </View>
                </View>

                <View style={{ alignItems: 'flex-end' }}>
                    <Text style={{ color: isDark ? '#fff' : '#0f172a', fontSize: 15, fontWeight: '700', marginBottom: 2 }}>
                        {item.price === 0 ? 'Free' : `${item.price} ETH`}
                    </Text>
                    <Text style={{ color: isDark ? '#64748b' : '#94a3b8', fontSize: 12 }}>
                        {formatAddress(item.fromWallet)} <Text style={{ fontSize: 10 }}>→</Text> {formatAddress(item.toWallet)}
                    </Text>
                </View>
            </View>
        );
    };

    return (
        <FlatList
            data={data}
            keyExtractor={item => item.id}
            renderItem={renderItem}
            showsVerticalScrollIndicator={false}
            scrollEnabled={false} // usually rendered inside a ScrollView
        />
    );
}
