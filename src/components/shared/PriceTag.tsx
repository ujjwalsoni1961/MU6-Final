import React from 'react';
import { Text } from 'react-native';
import { Gem } from 'lucide-react-native';
import GlassPill from './GlassPill';

interface PriceTagProps {
    price: number;
    dark?: boolean;
}

export default function PriceTag({ price, dark = false }: PriceTagProps) {
    return (
        <GlassPill dark={dark}>
            <Gem size={12} color={dark ? '#74e5ea' : '#38b4ba'} />
            <Text
                style={{
                    color: dark ? '#ffffff' : '#38b4ba',
                    fontSize: 11,
                    fontWeight: '700',
                    marginLeft: 4,
                }}
            >
                {price} ETH
            </Text>
        </GlassPill>
    );
}
