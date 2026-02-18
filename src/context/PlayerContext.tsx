import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { Song } from '../types';

interface PlayerContextType {
    currentSong: Song | null;
    isPlaying: boolean;
    isFullPlayerVisible: boolean;
    currentTime: number;
    duration: number;
    playSong: (song: Song) => void;
    togglePlay: () => void;
    openFullPlayer: () => void;
    closeFullPlayer: () => void;
    dismissPlayer: () => void;
    seekTo: (time: number) => void;
    skipNext: () => void;
    skipPrevious: () => void;
}

const PlayerContext = createContext<PlayerContextType | undefined>(undefined);

export function PlayerProvider({ children }: { children: React.ReactNode }) {
    const [currentSong, setCurrentSong] = useState<Song | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [isFullPlayerVisible, setIsFullPlayerVisible] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0); // Mock duration in seconds

    const timerRef = useRef<NodeJS.Timeout | null>(null);

    // Mock Timer Logic
    useEffect(() => {
        if (isPlaying) {
            timerRef.current = setInterval(() => {
                setCurrentTime((prev) => {
                    if (prev >= duration) {
                        setIsPlaying(false);
                        return duration;
                    }
                    return prev + 1;
                });
            }, 1000);
        } else {
            if (timerRef.current) clearInterval(timerRef.current);
        }
        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, [isPlaying, duration]);

    // Parse duration string "3:45" to seconds
    const parseDuration = (durationStr: string) => {
        const parts = durationStr.split(':').map(Number);
        if (parts.length === 2) return parts[0] * 60 + parts[1];
        if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
        return 0;
    };

    const playSong = (song: Song) => {
        if (currentSong?.id === song.id) {
            setIsPlaying(true);
            setIsFullPlayerVisible(true);
        } else {
            setCurrentSong(song);
            setDuration(parseDuration(song.duration));
            setCurrentTime(0);
            setIsPlaying(true);
            setIsFullPlayerVisible(true);
        }
    };

    const togglePlay = () => setIsPlaying(!isPlaying);

    const openFullPlayer = () => setIsFullPlayerVisible(true);
    const closeFullPlayer = () => setIsFullPlayerVisible(false);

    const dismissPlayer = () => {
        setIsPlaying(false);
        setCurrentSong(null);
        setCurrentTime(0);
        setIsFullPlayerVisible(false);
    };

    const seekTo = (time: number) => setCurrentTime(time);

    // Mock skip behavior (just restart for now, real app would use a queue)
    const skipNext = () => { setCurrentTime(0); };
    const skipPrevious = () => { setCurrentTime(0); };

    return (
        <PlayerContext.Provider
            value={{
                currentSong,
                isPlaying,
                isFullPlayerVisible,
                currentTime,
                duration,
                playSong,
                togglePlay,
                openFullPlayer,
                closeFullPlayer,
                dismissPlayer,
                seekTo,
                skipNext,
                skipPrevious,
            }}
        >
            {children}
        </PlayerContext.Provider>
    );
}

export function usePlayer() {
    const context = useContext(PlayerContext);
    if (!context) throw new Error('usePlayer must be used within a PlayerProvider');
    return context;
}
