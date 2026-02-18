import React from 'react';
import { View, Text, ScrollView, Platform } from 'react-native';
import AnimatedPressable from '../../src/components/shared/AnimatedPressable';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FileCode, ExternalLink } from 'lucide-react-native';

const isWeb = Platform.OS === 'web';

interface ContractInfo {
    name: string;
    subtitle: string;
    address: string;
    network: string;
    status: string;
}

const contracts: ContractInfo[] = [
    { name: 'MusicNFT', subtitle: 'ERC-721 + ERC-2981', address: '0x1234...abcd', network: 'Base Sepolia', status: 'Deployed' },
    { name: 'Marketplace', subtitle: 'NFT Trading Contract', address: '0x5678...efgh', network: 'Base Sepolia', status: 'Deployed' },
    { name: 'RoyaltySplit', subtitle: 'Revenue Distribution', address: '0x9abc...ijkl', network: 'Base Sepolia', status: 'Deployed' },
];

function ContractCard({ contract }: { contract: ContractInfo }) {
    return (
        <AnimatedPressable
            preset="card"
            hapticType="none"
            style={{
                padding: isWeb ? 20 : 16,
                borderRadius: 16,
                backgroundColor: isWeb ? '#fafcfe' : 'rgba(255,255,255,0.4)',
                borderWidth: 1,
                borderColor: isWeb ? '#f1f5f9' : 'rgba(255,255,255,0.4)',
                marginBottom: 12,
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.03,
                shadowRadius: 8,
            }}
        >
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(56,180,186,0.1)', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                    <FileCode size={20} color="#38b4ba" />
                </View>
                <View style={{ flex: 1 }}>
                    <Text style={{ color: '#0f172a', fontWeight: '700', fontSize: 18 }}>{contract.name}</Text>
                    <Text style={{ color: '#64748b', fontSize: 11 }}>{contract.subtitle}</Text>
                </View>
                <AnimatedPressable preset="icon" hapticType="none" style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(56,180,186,0.08)', alignItems: 'center', justifyContent: 'center' }}>
                    <ExternalLink size={16} color="#38b4ba" />
                </AnimatedPressable>
            </View>
            <View style={{ marginBottom: 12 }}>
                <Text style={{ fontSize: 10, fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 4 }}>Contract Address</Text>
                <Text style={{ color: '#0f172a', fontSize: 13, fontFamily: isWeb ? 'monospace' : undefined }}>{contract.address}</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View style={{ backgroundColor: 'rgba(56,180,186,0.15)', borderRadius: 9999, paddingHorizontal: 10, paddingVertical: 4, marginRight: 8 }}>
                    <Text style={{ color: '#38b4ba', fontSize: 11, fontWeight: '600' }}>{contract.network}</Text>
                </View>
                <View style={{ backgroundColor: 'rgba(34,197,94,0.15)', borderRadius: 9999, paddingHorizontal: 10, paddingVertical: 4 }}>
                    <Text style={{ color: '#16a34a', fontSize: 11, fontWeight: '600' }}>{contract.status}</Text>
                </View>
            </View>
        </AnimatedPressable>
    );
}

export default function AdminContractsScreen() {
    const Container = isWeb ? View : SafeAreaView;

    return (
        <Container style={{ flex: 1, backgroundColor: isWeb ? '#f8fafc' : 'transparent' }}>
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: isWeb ? 32 : 16, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
                <Text style={{ fontSize: isWeb ? 28 : 24, fontWeight: '800', color: '#0f172a', letterSpacing: -1, marginBottom: 24 }}>
                    Smart Contracts
                </Text>
                {contracts.map((contract) => (
                    <ContractCard key={contract.name} contract={contract} />
                ))}
            </ScrollView>
        </Container>
    );
}
