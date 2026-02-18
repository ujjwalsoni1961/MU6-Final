import React from 'react';
import { View, Text, FlatList, Platform } from 'react-native';
import AnimatedPressable from '../../src/components/shared/AnimatedPressable';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { users } from '../../src/mock/users';
import { User } from '../../src/types';

const isWeb = Platform.OS === 'web';

const roleColors: Record<string, { bg: string; text: string }> = {
    consumer: { bg: 'rgba(56,180,186,0.15)', text: '#38b4ba' },
    artist: { bg: 'rgba(139,92,246,0.15)', text: '#8b5cf6' },
    admin: { bg: 'rgba(100,116,139,0.15)', text: '#64748b' },
};

const statusColors: Record<string, { bg: string; text: string }> = {
    active: { bg: 'rgba(34,197,94,0.15)', text: '#16a34a' },
    suspended: { bg: 'rgba(239,68,68,0.15)', text: '#dc2626' },
};

export default function AdminUsersScreen() {
    const Container = isWeb ? View : SafeAreaView;

    const renderUser = ({ item }: { item: User }) => {
        const rc = roleColors[item.role];
        const sc = statusColors[item.status];
        const truncatedWallet = `${item.walletAddress.slice(0, 6)}...${item.walletAddress.slice(-4)}`;

        return (
            <AnimatedPressable
                preset="row"
                hapticType="none"
                style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    marginBottom: 6,
                    padding: 14,
                    borderRadius: 12,
                    backgroundColor: isWeb ? '#f8fafc' : 'rgba(255,255,255,0.3)',
                    borderWidth: 1,
                    borderColor: isWeb ? '#f1f5f9' : 'rgba(255,255,255,0.3)',
                }}
            >
                <Image source={{ uri: item.avatar }} style={{ width: 40, height: 40, borderRadius: 20 }} contentFit="cover" />
                <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={{ color: '#0f172a', fontWeight: '600', fontSize: 14 }}>{item.name}</Text>
                    <Text style={{ color: '#64748b', fontSize: 11 }}>{item.email}</Text>
                    {isWeb && <Text style={{ color: '#94a3b8', fontSize: 11, marginTop: 2, fontFamily: 'monospace' }}>{truncatedWallet}</Text>}
                </View>
                <View style={{ backgroundColor: rc.bg, borderRadius: 9999, paddingHorizontal: 8, paddingVertical: 2, marginRight: 6 }}>
                    <Text style={{ color: rc.text, fontSize: 10, fontWeight: '600', textTransform: 'capitalize' }}>{item.role}</Text>
                </View>
                <View style={{ backgroundColor: sc.bg, borderRadius: 9999, paddingHorizontal: 8, paddingVertical: 2 }}>
                    <Text style={{ color: sc.text, fontSize: 10, fontWeight: '600', textTransform: 'capitalize' }}>{item.status}</Text>
                </View>
            </AnimatedPressable>
        );
    };

    return (
        <Container style={{ flex: 1, backgroundColor: isWeb ? '#f8fafc' : 'transparent' }}>
            <View style={{ padding: isWeb ? 32 : 16 }}>
                <Text style={{ fontSize: isWeb ? 28 : 24, fontWeight: '800', color: '#0f172a', letterSpacing: -1, marginBottom: 16 }}>Users</Text>
            </View>
            <FlatList
                data={users}
                renderItem={renderUser}
                keyExtractor={(item) => item.id}
                contentContainerStyle={{ paddingHorizontal: isWeb ? 32 : 16 }}
                showsVerticalScrollIndicator={false}
            />
        </Container>
    );
}
