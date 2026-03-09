import React from 'react';
import { View, Text, ActivityIndicator, Platform } from 'react-native';
import AnimatedPressable from './AnimatedPressable';

const isWeb = Platform.OS === 'web';

interface LoadingStateProps {
    loading: boolean;
    error: string | null;
    onRetry?: () => void;
    children: React.ReactNode;
    /** If true, shows inline spinner instead of full-screen */
    inline?: boolean;
}

export default function LoadingState({ loading, error, onRetry, children, inline }: LoadingStateProps) {
    if (loading) {
        if (inline) {
            return (
                <View style={{ padding: 20, alignItems: 'center' }}>
                    <ActivityIndicator size="small" color="#38b4ba" />
                </View>
            );
        }
        return (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 }}>
                <ActivityIndicator size="large" color="#38b4ba" />
                <Text style={{ color: '#64748b', fontSize: 14, marginTop: 12 }}>Loading...</Text>
            </View>
        );
    }

    if (error) {
        return (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 }}>
                <Text style={{ color: '#ef4444', fontSize: 16, fontWeight: '600', marginBottom: 8 }}>
                    Something went wrong
                </Text>
                <Text style={{ color: '#64748b', fontSize: 14, marginBottom: 16, textAlign: 'center' }}>
                    {error}
                </Text>
                {onRetry && (
                    <AnimatedPressable
                        preset="button"
                        onPress={onRetry}
                        style={{
                            backgroundColor: '#38b4ba',
                            paddingHorizontal: 24,
                            paddingVertical: 12,
                            borderRadius: 12,
                        }}
                    >
                        <Text style={{ color: '#fff', fontWeight: '600', fontSize: 14 }}>Try Again</Text>
                    </AnimatedPressable>
                )}
            </View>
        );
    }

    return <>{children}</>;
}

/** Simple empty state component */
export function EmptyState({ icon, message }: { icon?: React.ReactNode; message: string }) {
    return (
        <View style={{ alignItems: 'center', justifyContent: 'center', paddingTop: 60, paddingBottom: 40 }}>
            {icon && <View style={{ marginBottom: 16 }}>{icon}</View>}
            <Text style={{ color: '#64748b', fontSize: 16, fontWeight: '600', textAlign: 'center' }}>
                {message}
            </Text>
        </View>
    );
}
