/**
 * MU6 Player Context — Phase 4
 *
 * Real audio playback via expo-av Audio.Sound.
 * - Fetches signed URLs from Supabase Storage (private 'audio' bucket)
 * - Falls back to a silent placeholder when no audio_path exists
 * - Tracks playback duration and logs streams to Supabase
 *   (qualified = >=15 seconds listened)
 * - Exposes volume control for web player bar
 * - Cross-platform: iOS, Android, Web
 */

import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { Audio, AVPlaybackStatus, InterruptionModeIOS, InterruptionModeAndroid } from 'expo-av';
import { Platform } from 'react-native';
import { Song } from '../types';
import * as db from '../services/database';
import { useAuth } from './AuthContext';

// ── Types ──

interface PlayerContextType {
    currentSong: Song | null;
    isPlaying: boolean;
    isFullPlayerVisible: boolean;
    currentTime: number;
    duration: number;
    volume: number;
    isBuffering: boolean;
    playSong: (song: Song) => void;
    togglePlay: () => void;
    openFullPlayer: () => void;
    closeFullPlayer: () => void;
    dismissPlayer: () => void;
    seekTo: (time: number) => void;
    skipNext: () => void;
    skipPrevious: () => void;
    setVolume: (vol: number) => void;
}

const PlayerContext = createContext<PlayerContextType | undefined>(undefined);

// ── Audio mode setup (called once) ──

let audioModeConfigured = false;
async function ensureAudioMode() {
    if (audioModeConfigured) return;
    try {
        await Audio.setAudioModeAsync({
            allowsRecordingIOS: false,
            playsInSilentModeIOS: true,
            staysActiveInBackground: true,
            interruptionModeIOS: InterruptionModeIOS.DoNotMix,
            shouldDuckAndroid: false,
            interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
            playThroughEarpieceAndroid: false,
        });
        audioModeConfigured = true;
        console.log('[Player] Audio mode configured successfully (DoNotMix, playsInSilent)');
    } catch (e) {
        console.warn('[Player] Failed to set audio mode:', e);
    }
}

// ── Provider ──

export function PlayerProvider({ children }: { children: React.ReactNode }) {
    const [currentSong, setCurrentSong] = useState<Song | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [isFullPlayerVisible, setIsFullPlayerVisible] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [volume, setVolumeState] = useState(1);
    const [isBuffering, setIsBuffering] = useState(false);

    // Eagerly configure audio mode on mount (critical for iOS volume)
    useEffect(() => {
        if (Platform.OS !== 'web') {
            ensureAudioMode();
        }
    }, []);

    // Get current user for stream attribution
    const { profile } = useAuth();
    const profileIdRef = useRef<string | null>(null);
    useEffect(() => { profileIdRef.current = profile?.id || null; }, [profile?.id]);

    // Refs for the Sound instance and stream tracking
    const soundRef = useRef<Audio.Sound | null>(null);
    const listenStartRef = useRef<number>(0); // timestamp when current listen session started
    const accumulatedRef = useRef<number>(0); // seconds accumulated so far for this song
    const currentSongRef = useRef<Song | null>(null); // for cleanup closures

    // Keep currentSongRef in sync
    useEffect(() => {
        currentSongRef.current = currentSong;
    }, [currentSong]);

    // ── Stream logging ──

    const logCurrentStream = useCallback(async () => {
        const song = currentSongRef.current;
        if (!song) return;

        // Calculate total listen time for this song
        let totalSeconds = accumulatedRef.current;
        if (listenStartRef.current > 0) {
            totalSeconds += (Date.now() - listenStartRef.current) / 1000;
            listenStartRef.current = 0;
        }

        const rounded = Math.round(totalSeconds);
        if (rounded < 1) return; // don't log sub-second listens

        // Reset accumulator
        accumulatedRef.current = 0;

        try {
            await db.logStream(song.id, profileIdRef.current, rounded);
        } catch (err) {
            console.warn('[Player] Failed to log stream:', err);
        }
    }, []);

    // ── Unload sound + log stream ──

    const unloadSound = useCallback(async () => {
        // Log the stream before unloading
        await logCurrentStream();

        if (soundRef.current) {
            try {
                await soundRef.current.unloadAsync();
            } catch (e) {
                // ignore unload errors
            }
            soundRef.current = null;
        }
    }, [logCurrentStream]);

    // ── Load and play a song ──

    const loadAndPlay = useCallback(async (song: Song) => {
        await ensureAudioMode();

        // Unload previous (this also logs the previous stream)
        await unloadSound();

        setIsBuffering(true);

        try {
            // Resolve audio URL
            let audioUri: string | null = null;

            if (song._audioPath) {
                // Fetch signed URL from Supabase private 'audio' bucket
                audioUri = await db.getAudioUrl(song._audioPath);
            }

            if (!audioUri) {
                // No audio file — use a short silent placeholder so the UI still works.
                // This lets the player open and show metadata even without an actual track.
                console.warn(`[Player] No audio file for "${song.title}", using silent playback`);
                // We'll still run the mock timer approach if no real audio
                setIsBuffering(false);
                return false;
            }

            const { sound } = await Audio.Sound.createAsync(
                { uri: audioUri },
                {
                    shouldPlay: true,
                    volume: 1.0,
                    progressUpdateIntervalMillis: 500,
                },
                onPlaybackStatusUpdate,
            );

            soundRef.current = sound;

            // Explicitly force volume to max after creation (iOS workaround)
            try {
                await sound.setVolumeAsync(1.0);
            } catch (e) {
                // ignore
            }

            setIsBuffering(false);
            return true;
        } catch (err) {
            console.error('[Player] Error loading audio:', err);
            setIsBuffering(false);
            return false;
        }
    }, [unloadSound]);

    // ── Playback status callback ──

    const onPlaybackStatusUpdate = useCallback((status: AVPlaybackStatus) => {
        if (!status.isLoaded) {
            if (status.error) {
                console.error('[Player] Playback error:', status.error);
            }
            return;
        }

        setCurrentTime(Math.floor((status.positionMillis || 0) / 1000));
        setDuration(Math.floor((status.durationMillis || 0) / 1000));
        setIsPlaying(status.isPlaying);
        setIsBuffering(status.isBuffering);

        // Song finished
        if (status.didJustFinish) {
            setIsPlaying(false);
            // Log the completed stream
            logCurrentStream();
        }
    }, [logCurrentStream]);

    // ── Mock timer fallback (for songs without audio files) ──

    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const useMockTimer = useRef(false);

    useEffect(() => {
        if (!useMockTimer.current) return;

        if (isPlaying) {
            timerRef.current = setInterval(() => {
                setCurrentTime((prev) => {
                    if (prev >= duration) {
                        setIsPlaying(false);
                        logCurrentStream();
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
    }, [isPlaying, duration, logCurrentStream]);

    // Parse duration string "3:45" to seconds
    const parseDuration = (durationStr: string) => {
        const parts = durationStr.split(':').map(Number);
        if (parts.length === 2) return parts[0] * 60 + parts[1];
        if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
        return 0;
    };

    // ── Public API ──

    const playSong = useCallback(async (song: Song) => {
        if (currentSong?.id === song.id) {
            // Same song — just resume / open full player
            if (soundRef.current) {
                await soundRef.current.playAsync();
            }
            setIsPlaying(true);
            setIsFullPlayerVisible(true);
            // Restart listen timer
            listenStartRef.current = Date.now();
            return;
        }

        // New song
        setCurrentSong(song);
        setCurrentTime(0);
        setIsFullPlayerVisible(true);
        listenStartRef.current = Date.now();
        accumulatedRef.current = 0;
        useMockTimer.current = false;

        const loaded = await loadAndPlay(song);

        if (!loaded) {
            // No real audio — fall back to mock timer
            useMockTimer.current = true;
            const dur = song._durationSeconds || parseDuration(song.duration);
            setDuration(dur);
            setIsPlaying(true);
        }
    }, [currentSong, loadAndPlay]);

    const togglePlay = useCallback(async () => {
        if (soundRef.current) {
            const status = await soundRef.current.getStatusAsync();
            if (status.isLoaded) {
                if (status.isPlaying) {
                    await soundRef.current.pauseAsync();
                    // Accumulate listen time
                    if (listenStartRef.current > 0) {
                        accumulatedRef.current += (Date.now() - listenStartRef.current) / 1000;
                        listenStartRef.current = 0;
                    }
                    setIsPlaying(false);
                } else {
                    await soundRef.current.playAsync();
                    listenStartRef.current = Date.now();
                    setIsPlaying(true);
                }
                return;
            }
        }
        // Mock timer fallback
        if (isPlaying) {
            if (listenStartRef.current > 0) {
                accumulatedRef.current += (Date.now() - listenStartRef.current) / 1000;
                listenStartRef.current = 0;
            }
        } else {
            listenStartRef.current = Date.now();
        }
        setIsPlaying(!isPlaying);
    }, [isPlaying]);

    const seekTo = useCallback(async (time: number) => {
        setCurrentTime(time);
        if (soundRef.current) {
            try {
                await soundRef.current.setPositionAsync(time * 1000);
            } catch (e) {
                // ignore seek errors
            }
        }
    }, []);

    const setVolume = useCallback(async (vol: number) => {
        const clamped = Math.max(0, Math.min(1, vol));
        setVolumeState(clamped);
        if (soundRef.current) {
            try {
                await soundRef.current.setVolumeAsync(clamped);
            } catch (e) {
                // ignore volume errors
            }
        }
    }, []);

    const openFullPlayer = useCallback(() => setIsFullPlayerVisible(true), []);
    const closeFullPlayer = useCallback(() => setIsFullPlayerVisible(false), []);

    const dismissPlayer = useCallback(async () => {
        setIsPlaying(false);
        setIsFullPlayerVisible(false);
        await unloadSound();
        setCurrentSong(null);
        setCurrentTime(0);
        setDuration(0);
        useMockTimer.current = false;
    }, [unloadSound]);

    // Mock skip behavior (restart — real queue would be Phase 7+)
    const skipNext = useCallback(async () => {
        await logCurrentStream();
        accumulatedRef.current = 0;
        listenStartRef.current = Date.now();
        setCurrentTime(0);
        if (soundRef.current) {
            try { await soundRef.current.setPositionAsync(0); } catch (e) {}
        }
    }, [logCurrentStream]);

    const skipPrevious = useCallback(async () => {
        accumulatedRef.current = 0;
        listenStartRef.current = Date.now();
        setCurrentTime(0);
        if (soundRef.current) {
            try { await soundRef.current.setPositionAsync(0); } catch (e) {}
        }
    }, []);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (soundRef.current) {
                soundRef.current.unloadAsync();
            }
        };
    }, []);

    return (
        <PlayerContext.Provider
            value={{
                currentSong,
                isPlaying,
                isFullPlayerVisible,
                currentTime,
                duration,
                volume,
                isBuffering,
                playSong,
                togglePlay,
                openFullPlayer,
                closeFullPlayer,
                dismissPlayer,
                seekTo,
                skipNext,
                skipPrevious,
                setVolume,
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
