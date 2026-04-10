import React, { useRef, useState, useEffect } from 'react';
import { View, PanResponder } from 'react-native';

interface SliderProps {
    value: number; // 0 to 1
    onValueChange?: (val: number) => void;
    onSlidingComplete?: (val: number) => void;
    trackColor?: string;
    thumbColor?: string;
    backgroundColor?: string;
}

export default function Slider({
    value,
    onValueChange,
    onSlidingComplete,
    trackColor = '#fff',
    thumbColor = '#fff',
    backgroundColor = 'rgba(255,255,255,0.1)',
}: SliderProps) {
    const widthRef = useRef(0);
    const isSlidingRef = useRef(false);
    const lastReleaseTimeRef = useRef(0);
    
    const [displayValue, setDisplayValue] = useState(value);
    const displayValueRef = useRef(value);
    
    useEffect(() => {
        // Ignore prop updates while sliding or immediately after sliding (debounce for 1s)
        if (!isSlidingRef.current && Date.now() - lastReleaseTimeRef.current > 1000) {
            if (!isNaN(value)) {
                setDisplayValue(value);
                displayValueRef.current = value;
            }
        }
    }, [value]);

    const startValueRef = useRef(0);
    const tapLocValueRef = useRef(0);

    const panResponder = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => true,
            onStartShouldSetPanResponderCapture: () => true,
            // Only capture if dx is significant
            onMoveShouldSetPanResponder: (evt, gestureState) => Math.abs(gestureState.dx) > 5,
            onMoveShouldSetPanResponderCapture: (evt, gestureState) => Math.abs(gestureState.dx) > 5,
            onPanResponderTerminationRequest: () => false,

            onPanResponderGrant: (evt) => {
                isSlidingRef.current = true;
                startValueRef.current = displayValueRef.current;
                
                // Track the exact location of the initial press (grant) to support tap-to-seek
                const w = widthRef.current;
                if (w > 0 && evt.nativeEvent.locationX !== undefined) {
                    tapLocValueRef.current = Math.max(0, Math.min(1, evt.nativeEvent.locationX / w));
                }
            },
            onPanResponderMove: (evt, gestureState) => {
                const w = widthRef.current;
                if (w > 0) {
                    const deltaValue = gestureState.dx / w;
                    const newValue = Math.max(0, Math.min(1, startValueRef.current + deltaValue));
                    setDisplayValue(newValue);
                    displayValueRef.current = newValue;
                    if (onValueChange) onValueChange(newValue);
                }
            },
            onPanResponderRelease: (evt, gestureState) => {
                const w = widthRef.current;
                if (w > 0) {
                    let finalValue = displayValueRef.current;
                    if (Math.abs(gestureState.dx) < 5 && Math.abs(gestureState.dy) < 5) {
                        // It was a tap! Uses the location from grant to avoid release event bugs
                        finalValue = tapLocValueRef.current;
                    } else {
                        const deltaValue = gestureState.dx / w;
                        finalValue = Math.max(0, Math.min(1, startValueRef.current + deltaValue));
                    }
                    setDisplayValue(finalValue);
                    displayValueRef.current = finalValue;
                    if (onSlidingComplete) onSlidingComplete(finalValue);
                }
                isSlidingRef.current = false;
                lastReleaseTimeRef.current = Date.now();
            },
            onPanResponderTerminate: () => {
                isSlidingRef.current = false;
                lastReleaseTimeRef.current = Date.now();
            }
        })
    ).current;

    const safeValue = (!isNaN(displayValue) && displayValue >= 0 && displayValue <= 1) ? displayValue : 0;

    return (
        <View 
            style={{ height: 30, justifyContent: 'center', width: '100%' }}
            onLayout={(e) => { widthRef.current = e.nativeEvent.layout.width; }}
            {...panResponder.panHandlers}
        >
            <View pointerEvents="none" style={{ height: 4, backgroundColor, borderRadius: 2, overflow: 'hidden' }}>
                <View style={{ width: `${safeValue * 100}%`, height: '100%', backgroundColor: trackColor }} />
            </View>
            <View pointerEvents="none" style={{
                position: 'absolute',
                left: `${safeValue * 100}%`,
                width: 14, height: 14, borderRadius: 7,
                backgroundColor: thumbColor,
                transform: [{ translateX: -7 }],
                shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4, elevation: 4
            }} />
        </View>
    );
}
