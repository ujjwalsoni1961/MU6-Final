import React from 'react';
import { View, ActivityIndicator, Text } from 'react-native';
import { Redirect } from 'expo-router';
import { useAuth } from '../src/context/AuthContext';

/**
 * Root index – routes based on auth state:
 * - Not connected → login screen
 * - Connected + admin → admin dashboard
 * - Connected + creator → artist dashboard
 * - Connected + listener → consumer home
 */
export default function Index() {
    const { isConnected, isLoading, role } = useAuth();

    // Show loading while auth state is being determined
    if (isLoading) {
        return (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#030711' }}>
                <ActivityIndicator size="large" color="#38b4ba" />
                <Text style={{ color: '#64748b', marginTop: 12, fontSize: 14 }}>Loading...</Text>
            </View>
        );
    }

    // Not connected → login
    if (!isConnected) {
        return <Redirect href="/(auth)/login" />;
    }

    // Route by role
    switch (role) {
        case 'admin':
            return <Redirect href="/(admin)/dashboard" />;
        case 'creator':
            return <Redirect href="/(artist)/dashboard" />;
        default:
            return <Redirect href="/(consumer)/home" />;
    }
}
