/**
 * ActivityDetailModal
 *
 * Shows the full fee breakdown for a wallet activity row (sale / purchase / mint).
 * All math comes from `src/constants/fees.ts` — i.e. the on-chain-enforced splits.
 * The user can tap the tx hash to open Polygonscan and verify the numbers
 * against the chain themselves.
 */

import React from 'react';
import { View, Text, Modal, Linking, ScrollView, Platform } from 'react-native';
import { X, ExternalLink } from 'lucide-react-native';
import AnimatedPressable from './AnimatedPressable';
import { useTheme } from '../../context/ThemeContext';
import type { UserActivity } from '../../services/database';
import { formatPol } from '../../constants/fees';
import { EXPLORER_BASE } from '../../config/network';

interface ActivityDetailModalProps {
    visible: boolean;
    onClose: () => void;
    activity: UserActivity | null;
}

export default function ActivityDetailModal({ visible, onClose, activity }: ActivityDetailModalProps) {
    const { isDark, colors } = useTheme();

    if (!activity) return null;

    const gross = activity.grossPriceEth;
    const net = activity.netPriceEth;
    const breakdown = activity.feeBreakdown;

    const title =
        activity.type === 'sale' ? 'Sale details'
        : activity.type === 'purchase' ? 'Purchase details'
        : activity.type === 'mint' ? 'Mint details'
        : 'Listing details';

    const netLabel =
        activity.type === 'sale' ? 'You received'
        : activity.type === 'purchase' ? 'You paid'
        : activity.type === 'mint' ? 'You paid'
        : 'Listed for';

    const netColor =
        activity.type === 'sale' ? '#8b5cf6'
        : activity.type === 'purchase' ? '#22c55e'
        : colors.text.primary;

    const openTx = () => {
        if (!activity.txHash) return;
        const url = `${EXPLORER_BASE}/tx/${activity.txHash}`;
        Linking.openURL(url).catch(() => {});
    };

    const shortTx = activity.txHash
        ? `${activity.txHash.slice(0, 10)}\u2026${activity.txHash.slice(-6)}`
        : null;

    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
            <View style={{
                flex: 1,
                backgroundColor: 'rgba(0,0,0,0.55)',
                justifyContent: 'center',
                alignItems: 'center',
                padding: 24,
            }}>
                <View style={{
                    backgroundColor: isDark ? '#111827' : '#ffffff',
                    borderRadius: 24,
                    padding: 24,
                    width: '100%',
                    maxWidth: 420,
                }}>
                    {/* Header */}
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                        <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 20, fontWeight: '800', color: colors.text.primary }} numberOfLines={1}>
                                {title}
                            </Text>
                            <Text style={{ fontSize: 13, color: colors.text.secondary, marginTop: 2 }} numberOfLines={1}>
                                {activity.songTitle}
                            </Text>
                        </View>
                        <AnimatedPressable preset="icon" onPress={onClose} style={{ padding: 4, marginLeft: 12 }}>
                            <X size={22} color={colors.text.secondary} />
                        </AnimatedPressable>
                    </View>

                    <ScrollView showsVerticalScrollIndicator={false}>
                        {/* Net amount (the number that actually moved) */}
                        {net != null && (
                            <View style={{
                                backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
                                borderRadius: 16,
                                padding: 16,
                                marginBottom: 16,
                            }}>
                                <Text style={{ fontSize: 12, color: colors.text.tertiary, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
                                    {netLabel}
                                </Text>
                                <Text style={{ fontSize: 28, fontWeight: '800', color: netColor, letterSpacing: -0.5 }}>
                                    {formatPol(net)} POL
                                </Text>
                                {gross != null && gross !== net && (
                                    <Text style={{ fontSize: 13, color: colors.text.secondary, marginTop: 4 }}>
                                        from {formatPol(gross)} POL listed
                                    </Text>
                                )}
                            </View>
                        )}

                        {/* Fee breakdown */}
                        {breakdown && gross != null && (
                            <View style={{ marginBottom: 16 }}>
                                <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text.secondary, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
                                    Breakdown
                                </Text>

                                {/* Gross row */}
                                <Row
                                    label={breakdown.recipientRole === 'seller' ? 'Listing price' : 'Amount paid'}
                                    valueText={`${formatPol(gross)} POL`}
                                    colors={colors}
                                    isDark={isDark}
                                    kind="base"
                                />

                                {/* Deduction / distribution lines */}
                                {breakdown.lines.map((line, idx) => (
                                    <Row
                                        key={idx}
                                        label={`${line.label} (${line.percentLabel})`}
                                        valueText={`${breakdown.recipientRole === 'seller' ? '\u2212' : ''}${formatPol(line.amountEth)} POL`}
                                        colors={colors}
                                        isDark={isDark}
                                        kind={breakdown.recipientRole === 'seller' ? 'minus' : 'info'}
                                    />
                                ))}

                                {/* Net / total row */}
                                <View style={{
                                    marginTop: 10,
                                    paddingTop: 10,
                                    borderTopWidth: 1,
                                    borderTopColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
                                }}>
                                    <Row
                                        label={breakdown.recipientRole === 'seller' ? 'You received' : 'Total paid'}
                                        valueText={`${formatPol(net ?? gross)} POL`}
                                        colors={colors}
                                        isDark={isDark}
                                        kind="total"
                                    />
                                </View>
                            </View>
                        )}

                        {/* Tx link */}
                        {activity.txHash && (
                            <AnimatedPressable preset="button" onPress={openTx}>
                                <View style={{
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
                                    borderRadius: 14,
                                    paddingVertical: 14,
                                    paddingHorizontal: 16,
                                }}>
                                    <View style={{ flex: 1 }}>
                                        <Text style={{ fontSize: 12, color: colors.text.tertiary, marginBottom: 2 }}>
                                            Transaction
                                        </Text>
                                        <Text style={{
                                            fontSize: 13,
                                            color: colors.text.primary,
                                            fontWeight: '600',
                                            fontFamily: Platform.OS === 'web' ? 'monospace' : undefined,
                                        }}>
                                            {shortTx}
                                        </Text>
                                    </View>
                                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                        <Text style={{ fontSize: 13, color: colors.accent.purple, fontWeight: '600', marginRight: 6 }}>
                                            View
                                        </Text>
                                        <ExternalLink size={15} color={colors.accent.purple} />
                                    </View>
                                </View>
                            </AnimatedPressable>
                        )}

                        {/* Footnote */}
                        <Text style={{ fontSize: 11, color: colors.text.tertiary, marginTop: 14, lineHeight: 16 }}>
                            Fee splits are enforced by the smart contract and settled atomically inside the transaction. Verify on Polygonscan for full transparency.
                        </Text>
                    </ScrollView>
                </View>
            </View>
        </Modal>
    );
}

function Row({
    label, valueText, colors, isDark, kind,
}: {
    label: string;
    valueText: string;
    colors: any;
    isDark: boolean;
    kind: 'base' | 'minus' | 'info' | 'total';
}) {
    const weight = kind === 'total' ? '800' : kind === 'base' ? '700' : '600';
    const size = kind === 'total' ? 16 : 14;
    const color =
        kind === 'total' ? colors.text.primary
        : kind === 'minus' ? (isDark ? '#fca5a5' : '#b91c1c')
        : colors.text.primary;
    const labelColor = kind === 'info' || kind === 'minus' ? colors.text.secondary : colors.text.primary;
    return (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6 }}>
            <Text style={{ fontSize: size, color: labelColor, fontWeight: kind === 'total' ? '700' : '500', flex: 1 }} numberOfLines={1}>
                {label}
            </Text>
            <Text style={{ fontSize: size, color, fontWeight: weight, marginLeft: 12 }}>
                {valueText}
            </Text>
        </View>
    );
}
