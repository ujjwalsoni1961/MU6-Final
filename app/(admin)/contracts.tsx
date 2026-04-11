import React from 'react';
import { View, Text, Platform } from 'react-native';
import { FileCode } from 'lucide-react-native';
import { AdminScreen } from '../../src/components/admin/AdminScreenWrapper';
import { useTheme } from '../../src/context/ThemeContext';

const isWeb = Platform.OS === 'web';

interface ContractInfo {
    name: string;
    subtitle: string;
    address: string;
    network: string;
    status: string;
}

const contracts: ContractInfo[] = [
    { name: 'MU6 Songs (DropERC721)', subtitle: 'ERC-721 + ERC-2981', address: '0xACF1145AdE250D356e1B2869E392e6c748c14C0E', network: 'Polygon Amoy', status: 'Deployed' },
    { name: 'Marketplace (MarketplaceV3)', subtitle: 'NFT Trading Contract', address: '0x141Fc79b7F1EB7b393A5DC5f257678c3cD30506a', network: 'Polygon Amoy', status: 'Deployed' },
    { name: 'Revenue Split', subtitle: 'Revenue Distribution', address: '0xb757e188B8A126A6D975514F3a05049a87209c2D', network: 'Polygon Amoy', status: 'Deployed' },
];

function ContractCard({ contract }: { contract: ContractInfo }) {
    const { colors } = useTheme();

    return (
        <View
            style={{
                padding: isWeb ? 24 : 16,
                borderRadius: 16,
                backgroundColor: colors.bg.card,
                borderWidth: 1,
                borderColor: colors.border.glass,
                marginBottom: 12,
            }}
        >
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
                <View style={{
                    width: 44, height: 44, borderRadius: 22,
                    backgroundColor: `${colors.accent.cyan}15`,
                    alignItems: 'center', justifyContent: 'center', marginRight: 12,
                }}>
                    <FileCode size={20} color={colors.accent.cyan} />
                </View>
                <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.text.primary, fontWeight: '700', fontSize: 16 }}>{contract.name}</Text>
                    <Text style={{ color: colors.text.secondary, fontSize: 12 }}>{contract.subtitle}</Text>
                </View>
            </View>
            <View style={{ marginBottom: 12 }}>
                <Text style={{ fontSize: 10, fontWeight: '700', color: colors.text.muted, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 6 }}>
                    Contract Address
                </Text>
                <Text style={{ color: colors.text.secondary, fontSize: 13, fontFamily: isWeb ? 'monospace' : undefined }}>{contract.address}</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ backgroundColor: `${colors.accent.cyan}15`, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 }}>
                    <Text style={{ color: colors.accent.cyan, fontSize: 11, fontWeight: '600' }}>{contract.network}</Text>
                </View>
                <View style={{ backgroundColor: `${colors.status.success}15`, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 }}>
                    <Text style={{ color: colors.status.success, fontSize: 11, fontWeight: '600' }}>{contract.status}</Text>
                </View>
            </View>
        </View>
    );
}

export default function AdminContractsScreen() {
    return (
        <AdminScreen title="Smart Contracts" subtitle="Deployed contract addresses">
            {contracts.map((contract) => (
                <ContractCard key={contract.name} contract={contract} />
            ))}
        </AdminScreen>
    );
}
