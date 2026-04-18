import React from 'react';
import { View, Text, Platform } from 'react-native';
import { FileCode } from 'lucide-react-native';
import { AdminScreen } from '../../src/components/admin/AdminScreenWrapper';
import { useTheme } from '../../src/context/ThemeContext';
import { CONTRACT_ADDRESSES, CHAIN_NAME } from '../../src/config/network';

const isWeb = Platform.OS === 'web';

interface ContractInfo {
    name: string;
    subtitle: string;
    address: string;
    network: string;
    status: string;
}

const contracts: ContractInfo[] = [
    { name: 'MU6 Songs (DropERC1155)', subtitle: 'ERC-1155 + ERC-2981', address: CONTRACT_ADDRESSES.SONG_NFT, network: CHAIN_NAME, status: 'Deployed' },
    { name: 'Marketplace (MarketplaceV3)', subtitle: 'NFT Trading Contract', address: CONTRACT_ADDRESSES.MARKETPLACE, network: CHAIN_NAME, status: 'Deployed' },
    { name: 'Revenue Split', subtitle: 'Revenue Distribution', address: CONTRACT_ADDRESSES.SPLIT, network: CHAIN_NAME, status: 'Deployed' },
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
