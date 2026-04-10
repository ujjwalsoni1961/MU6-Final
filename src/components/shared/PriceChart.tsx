import React from 'react';
import { View, Text, Dimensions } from 'react-native';
import Svg, { Path, Defs, LinearGradient, Stop, Circle, Text as SvgText, G } from 'react-native-svg';
import { TradeEvent } from '../../types';

interface PriceChartProps {
    data: TradeEvent[];
    width?: number;
    height?: number;
}

export default function PriceChart({ data, width = Dimensions.get('window').width - 40, height = 220 }: PriceChartProps) {
    if (!data || data.length === 0) {
        return (
            <View style={{ width, height, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 16 }}>
                <Text style={{ color: '#64748b' }}>No trade history available</Text>
            </View>
        );
    }

    // Sort ascending by date for plotting (oldest to newest)
    const sortedData = [...data].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const padding = { top: 30, right: 20, bottom: 40, left: 50 };
    const maxPrice = Math.max(...sortedData.map(d => d.price), 0.01); // Avoid 0 max
    const minPrice = 0; // Always start Y axis at 0
    
    // Calculate X interval spacing evenly
    const stepX = sortedData.length > 1 
        ? (width - padding.left - padding.right) / (sortedData.length - 1)
        : width - padding.left - padding.right;

    // Helper to map values to coordinates
    const getX = (index: number) => padding.left + (index * stepX);
    const getY = (price: number) => padding.top + (height - padding.top - padding.bottom) * (1 - (price - minPrice) / (maxPrice - minPrice));

    // Construct SVG Path Definition
    let linePath = '';
    let areaPath = '';

    if (sortedData.length === 1) {
        // Flat line for single data point
        linePath = `M ${padding.left} ${getY(sortedData[0].price)} L ${width - padding.right} ${getY(sortedData[0].price)}`;
        areaPath = `${linePath} L ${width - padding.right} ${height - padding.bottom} L ${padding.left} ${height - padding.bottom} Z`;
    } else {
        // Line through all points
        linePath = sortedData.reduce((acc, point, index) => {
            const x = getX(index);
            const y = getY(point.price);
            return `${acc} ${index === 0 ? 'M' : 'L'} ${x} ${y}`;
        }, '');

        // Area path adds the bottom corners to the line path
        areaPath = `${linePath} L ${getX(sortedData.length - 1)} ${height - padding.bottom} L ${getX(0)} ${height - padding.bottom} Z`;
    }

    // Format utility for prices
    const formatEth = (val: number) => (val % 1 === 0 ? val.toString() : val.toFixed(3));

    return (
        <View style={{ width, height, backgroundColor: '#0f172a', borderRadius: 24, overflow: 'hidden', paddingVertical: 10 }}>
            <Svg width="100%" height="100%">
                <Defs>
                    <LinearGradient id="gradientArea" x1="0" y1="0" x2="0" y2="1">
                        <Stop offset="0" stopColor="#8b5cf6" stopOpacity="0.3" />
                        <Stop offset="1" stopColor="#8b5cf6" stopOpacity="0.0" />
                    </LinearGradient>
                </Defs>

                {/* Grid Lines & Y-Axis Labels */}
                {[0, 0.5, 1].map((ratio) => {
                    const priceValue = minPrice + (maxPrice - minPrice) * ratio;
                    const y = getY(priceValue);
                    return (
                        <G key={`grid-${ratio}`}>
                            {/* Horizontal Grid Line */}
                            <Path d={`M ${padding.left} ${y} L ${width - padding.right} ${y}`} stroke="rgba(255,255,255,0.05)" strokeWidth="1" strokeDasharray="4 4" />
                            {/* Label */}
                            <SvgText x={padding.left - 10} y={y + 4} fill="#64748b" fontSize="10" fontWeight="600" textAnchor="end">
                                {formatEth(priceValue)} ETH
                            </SvgText>
                        </G>
                    );
                })}

                {/* Filled Area beneath line */}
                <Path d={areaPath} fill="url(#gradientArea)" />
                
                {/* The Main Line */}
                <Path d={linePath} fill="none" stroke="#8b5cf6" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />

                {/* Data Points */}
                {sortedData.map((point, index) => {
                    // Only render points if lengths > 1 to avoid a dot in middle of flat line, or render at X=0
                    const cx = sortedData.length === 1 ? width / 2 : getX(index);
                    const cy = getY(point.price);

                    return (
                        <G key={`point-${index}`}>
                            {/* Outer Glow */}
                            <Circle cx={cx} cy={cy} r="6" fill="#8b5cf6" opacity="0.3" />
                            {/* Inner Dot */}
                            <Circle cx={cx} cy={cy} r="3" fill="#fff" stroke="#8b5cf6" strokeWidth="2" />
                            
                            {/* Only show dates for first and last, or evenly spaced if many */}
                            {(index === 0 || index === sortedData.length - 1) && (
                                <SvgText 
                                    x={cx} 
                                    y={height - padding.bottom + 20} 
                                    fill="#94a3b8" 
                                    fontSize="10" 
                                    textAnchor="middle"
                                >
                                    {new Date(point.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric'})}
                                </SvgText>
                            )}
                        </G>
                    );
                })}
            </Svg>
        </View>
    );
}
