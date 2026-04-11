import React from 'react';
import { View, Text, Dimensions, Platform } from 'react-native';
import Svg, { Path, Defs, LinearGradient, Stop, Circle, Text as SvgText, G, Line } from 'react-native-svg';
import { TradeEvent } from '../../types';
import { useTheme } from '../../context/ThemeContext';

interface PriceChartProps {
    data: TradeEvent[];
    width?: number;
    height?: number;
}

export default function PriceChart({ data, width: propWidth, height = 220 }: PriceChartProps) {
    const { isDark, colors } = useTheme();
    const width = propWidth || Dimensions.get('window').width - 40;

    if (!data || data.length === 0) {
        return (
            <View style={{
                width, height,
                justifyContent: 'center', alignItems: 'center',
                backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)',
                borderRadius: 16,
                borderWidth: 1,
                borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
            }}>
                <Text style={{ color: colors.text.muted, fontSize: 14 }}>No trade history available</Text>
            </View>
        );
    }

    // Sort ascending by date for plotting (oldest to newest)
    const sortedData = [...data].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const padding = { top: 30, right: 20, bottom: 40, left: 55 };
    const chartW = width - padding.left - padding.right;
    const chartH = height - padding.top - padding.bottom;

    const prices = sortedData.map(d => d.price);
    const maxPrice = Math.max(...prices, 0.001);
    const minPrice = Math.max(Math.min(...prices) * 0.9, 0); // 10% margin below min

    // Calculate X interval spacing evenly
    const stepX = sortedData.length > 1
        ? chartW / (sortedData.length - 1)
        : chartW;

    // Helper to map values to coordinates
    const getX = (index: number) => padding.left + (index * stepX);
    const getY = (price: number) => {
        const range = maxPrice - minPrice;
        if (range === 0) return padding.top + chartH / 2;
        return padding.top + chartH * (1 - (price - minPrice) / range);
    };

    // Construct SVG Path — use smooth curves for better appearance
    let linePath = '';
    let areaPath = '';

    if (sortedData.length === 1) {
        const y = getY(sortedData[0].price);
        linePath = `M ${padding.left} ${y} L ${width - padding.right} ${y}`;
        areaPath = `${linePath} L ${width - padding.right} ${height - padding.bottom} L ${padding.left} ${height - padding.bottom} Z`;
    } else {
        // Smooth curve using cubic bezier
        linePath = sortedData.reduce((acc, point, index) => {
            const x = getX(index);
            const y = getY(point.price);
            if (index === 0) return `M ${x} ${y}`;

            const prevX = getX(index - 1);
            const prevY = getY(sortedData[index - 1].price);
            const cpX1 = prevX + stepX * 0.4;
            const cpX2 = x - stepX * 0.4;
            return `${acc} C ${cpX1} ${prevY} ${cpX2} ${y} ${x} ${y}`;
        }, '');

        areaPath = `${linePath} L ${getX(sortedData.length - 1)} ${height - padding.bottom} L ${getX(0)} ${height - padding.bottom} Z`;
    }

    // Y-axis tick values
    const yTicks = [0, 0.25, 0.5, 0.75, 1].map(ratio => minPrice + (maxPrice - minPrice) * ratio);

    // Format utility for prices
    const formatPrice = (val: number) => {
        if (val === 0) return '0';
        if (val < 0.001) return val.toExponential(1);
        if (val < 1) return val.toFixed(3);
        if (val < 100) return val.toFixed(2);
        return val.toFixed(0);
    };

    // Theme-based colors
    const lineColor = '#8b5cf6';
    const gridColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)';
    const labelColor = isDark ? '#64748b' : '#94a3b8';
    const bgColor = isDark ? 'rgba(15,23,42,0.6)' : 'rgba(248,250,252,1)';
    const borderColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)';

    // Format date labels
    const formatDate = (dateStr: string) => {
        const d = new Date(dateStr);
        return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    };

    // Decide which X labels to show (max 5)
    const labelIndices: number[] = [];
    if (sortedData.length <= 5) {
        sortedData.forEach((_, i) => labelIndices.push(i));
    } else {
        const step = (sortedData.length - 1) / 4;
        for (let i = 0; i < 5; i++) {
            labelIndices.push(Math.round(i * step));
        }
    }

    return (
        <View style={{
            width, height,
            backgroundColor: bgColor,
            borderRadius: 16,
            overflow: 'hidden',
            borderWidth: 1,
            borderColor: borderColor,
        }}>
            <Svg width="100%" height="100%">
                <Defs>
                    <LinearGradient id="gradientArea" x1="0" y1="0" x2="0" y2="1">
                        <Stop offset="0" stopColor={lineColor} stopOpacity="0.2" />
                        <Stop offset="1" stopColor={lineColor} stopOpacity="0.0" />
                    </LinearGradient>
                </Defs>

                {/* Grid Lines & Y-Axis Labels */}
                {yTicks.map((priceValue, i) => {
                    const y = getY(priceValue);
                    return (
                        <G key={`grid-${i}`}>
                            <Line
                                x1={padding.left}
                                y1={y}
                                x2={width - padding.right}
                                y2={y}
                                stroke={gridColor}
                                strokeWidth="1"
                                strokeDasharray="4 4"
                            />
                            <SvgText
                                x={padding.left - 8}
                                y={y + 4}
                                fill={labelColor}
                                fontSize="10"
                                fontWeight="500"
                                textAnchor="end"
                            >
                                {formatPrice(priceValue)} POL
                            </SvgText>
                        </G>
                    );
                })}

                {/* Filled Area beneath line */}
                <Path d={areaPath} fill="url(#gradientArea)" />

                {/* The Main Line */}
                <Path
                    d={linePath}
                    fill="none"
                    stroke={lineColor}
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                />

                {/* Data Points */}
                {sortedData.map((point, index) => {
                    const cx = sortedData.length === 1 ? width / 2 : getX(index);
                    const cy = getY(point.price);

                    return (
                        <G key={`point-${index}`}>
                            <Circle cx={cx} cy={cy} r="5" fill={lineColor} opacity="0.2" />
                            <Circle cx={cx} cy={cy} r="3" fill="#fff" stroke={lineColor} strokeWidth="2" />
                        </G>
                    );
                })}

                {/* X-Axis Date Labels */}
                {labelIndices.map((idx) => {
                    const cx = sortedData.length === 1 ? width / 2 : getX(idx);
                    return (
                        <SvgText
                            key={`label-${idx}`}
                            x={cx}
                            y={height - padding.bottom + 20}
                            fill={labelColor}
                            fontSize="10"
                            fontWeight="500"
                            textAnchor="middle"
                        >
                            {formatDate(sortedData[idx].date)}
                        </SvgText>
                    );
                })}
            </Svg>
        </View>
    );
}
