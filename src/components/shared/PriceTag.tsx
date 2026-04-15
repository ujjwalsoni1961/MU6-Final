import React, { useState, useEffect } from 'react';
import { View, Text } from 'react-native';
import { Gem } from 'lucide-react-native';
import GlassPill from './GlassPill';
import { convertTokenToFiat, formatFiat, type FiatCurrency } from '../../services/fxRate';

interface PriceTagProps {
    price: number;
    dark?: boolean;
    /** Optional: show fiat price alongside POL. Pass the user's preferred fiat currency. */
    fiatCurrency?: FiatCurrency;
}

export default function PriceTag({ price, dark = false, fiatCurrency }: PriceTagProps) {
    const [fiatLabel, setFiatLabel] = useState<string | null>(null);

    useEffect(() => {
        if (!fiatCurrency || price <= 0) {
            setFiatLabel(null);
            return;
        }
        let cancelled = false;
        convertTokenToFiat(price, fiatCurrency)
            .then((val) => {
                if (!cancelled) setFiatLabel(formatFiat(val, fiatCurrency));
            })
            .catch(() => {
                if (!cancelled) setFiatLabel(null);
            });
        return () => { cancelled = true; };
    }, [price, fiatCurrency]);

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
                {fiatLabel ? `${fiatLabel}` : `${price} POL`}
            </Text>
        </GlassPill>
    );
}
