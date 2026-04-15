/**
 * MU6 Player Context — Production-ready
 *
 * Real audio playback via expo-av Audio.Sound.
 * - Queue system with shuffle (Fisher-Yates), skip next/prev, auto-advance
 * - Play history tracking (last 50 songs)
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

export interface QueueContext {
    songs: Song[];
    startIndex?: number;
}

interface PlayerContextType {
    currentSong: Song | null;
    isPlaying: boolean;
    isFullPlayerVisible: boolean;
    currentTime: number;
    duration: number;
    volume: number;
    isBuffering: boolean;
    isRepeat: boolean;
    // Queue
    queue: Song[];
    queueIndex: number;
    isShuffled: boolean;
    playHistory: Song[];
    // Methods
    playSong: (song: Song, context?: QueueContext) => void;
    togglePlay: () => void;
    openFullPlayer: () => void;
    closeFullPlayer: () => void;
    dismissPlayer: () => void;
    seekTo: (time: number) => void;
    skipNext: () => void;
    skipPrevious: () => void;
    setVolume: (vol: number) => void;
    toggleRepeat: () => void;
    toggleShuffle: () => void;
    addToQueue: (song: Song) => void;
    playNext: (song: Song) => void;
    removeFromQueue: (index: number) => void;
    clearQueue: () => void;
    playQueue: (songs: Song[], startIndex: number) => void;
    jumpToQueueIndex: (index: number) => void;
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

// ── Fisher-Yates Shuffle ──

function shuffleArray<T>(arr: T[], keepFirstIndex?: number): T[] {
    const result = [...arr];
    // If keepFirstIndex provided, move that item to position 0 first
    if (keepFirstIndex !== undefined && keepFirstIndex >= 0 && keepFirstIndex < result.length) {
        const [item] = result.splice(keepFirstIndex, 1);
        result.unshift(item);
    }
    // Shuffle everything after position 0 (keep current song at front)
    for (let i = result.length - 1; i > 1; i--) {
        const j = 1 + Math.floor(Math.random() * i); // j in [1, i]
        [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
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
    const [isRepeat, setIsRepeat] = useState(false);
    const isRepeatRef = useRef(false);

    // Queue state
    const [queue, setQueue] = useState<Song[]>([]);
    const [queueIndex, setQueueIndex] = useState(-1);
    const [isShuffled, setIsShuffled] = useState(false);
    const [originalQueue, setOriginalQueue] = useState<Song[]>([]);
    const [playHistory, setPlayHistory] = useState<Song[]>([]);

    // Refs for queue state in callbacks
    const queueRef = useRef<Song[]>([]);
    const queueIndexRef = useRef(-1);
    useEffect(() => { queueRef.current = queue; }, [queue]);
    useEffect(() => { queueIndexRef.current = queueIndex; }, [queueIndex]);

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
    const listenStartRef = useRef<number>(0);
    const accumulatedRef = useRef<number>(0);
    const currentSongRef = useRef<Song | null>(null);

    // Keep currentSongRef in sync
    useEffect(() => {
        currentSongRef.current = currentSong;
    }, [currentSong]);

    // ── Play history tracking ──

    const addToPlayHistory = useCallback((song: Song) => {
        setPlayHistory(prev => {
            // No consecutive dupes
            if (prev.length > 0 && prev[0].id === song.id) return prev;
            const next = [song, ...prev.filter(s => s.id !== song.id)];
            return next.slice(0, 50);
        });
    }, []);

    // ── Stream logging ──

    const logCurrentStream = useCallback(async () => {
        const song = currentSongRef.current;
        if (!song) return;

        let totalSeconds = accumulatedRef.current;
        if (listenStartRef.current > 0) {
            totalSeconds += (Date.now() - listenStartRef.current) / 1000;
            listenStartRef.current = 0;
        }

        const rounded = Math.round(totalSeconds);
        if (rounded < 1) return;

        accumulatedRef.current = 0;

        try {
            await db.logStream(song.id, profileIdRef.current, rounded);
        } catch (err) {
            console.warn('[Player] Failed to log stream:', err);
        }
    }, []);

    // ── Unload sound + log stream ──

    const unloadSound = useCallback(async () => {
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

        await unloadSound();

        setIsBuffering(true);

        try {
            let audioUri: string | null = null;

            if (song._audioPath) {
                audioUri = await db.getAudioUrl(song._audioPath);
            }

            if (!audioUri) {
                console.warn(`[Player] No audio file for "${song.title}", using silent playback`);
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

    // ── Auto-advance to next song ──

    const autoAdvance = useCallback(async () => {
        const q = queueRef.current;
        const idx = queueIndexRef.current;

        if (q.length === 0 || idx < 0) {
            setIsPlaying(false);
            return;
        }

        if (idx < q.length - 1) {
            // Play next song
            const nextIdx = idx + 1;
            const nextSong = q[nextIdx];
            setQueueIndex(nextIdx);
            setCurrentSong(nextSong);
            setCurrentTime(0);
            listenStartRef.current = Date.now();
            accumulatedRef.current = 0;
            addToPlayHistory(nextSong);

            useMockTimerRef.current = false;
            const loaded = await loadAndPlay(nextSong);
            if (!loaded) {
                useMockTimerRef.current = true;
                const dur = nextSong._durationSeconds || parseDuration(nextSong.duration);
                setDuration(dur);
                setIsPlaying(true);
            }
        } else {
            // End of queue
            setIsPlaying(false);
        }
    }, [loadAndPlay, addToPlayHistory]);

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
            logCurrentStream();
            if (isRepeatRef.current) {
                if (soundRef.current) {
                    soundRef.current.setPositionAsync(0).then(() => {
                        soundRef.current?.playAsync();
                    }).catch(() => {});
                }
                setCurrentTime(0);
                listenStartRef.current = Date.now();
                accumulatedRef.current = 0;
            } else {
                // Auto-advance to next song in queue
                autoAdvance();
            }
        }
    }, [logCurrentStream, autoAdvance]);

    // ── Mock timer fallback (for songs without audio files) ──

    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const useMockTimerRef = useRef(false);

    useEffect(() => {
        if (!useMockTimerRef.current) return;

        if (isPlaying) {
            timerRef.current = setInterval(() => {
                setCurrentTime((prev) => {
                    if (prev >= duration) {
                        logCurrentStream();
                        if (isRepeatRef.current) {
                            accumulatedRef.current = 0;
                            listenStartRef.current = Date.now();
                            return 0;
                        }
                        // Auto-advance
                        autoAdvance();
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
    }, [isPlaying, duration, logCurrentStream, autoAdvance]);

    // Parse duration string "3:45" to seconds
    const parseDuration = (durationStr: string) => {
        const parts = durationStr.split(':').map(Number);
        if (parts.length === 2) return parts[0] * 60 + parts[1];
        if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
        return 0;
    };

    // ── Public API ──

    const playSong = useCallback(async (song: Song, context?: QueueContext) => {
        if (currentSong?.id === song.id && !context) {
            // Same song — just resume / open full player
            if (soundRef.current) {
                await soundRef.current.playAsync();
            }
            setIsPlaying(true);
            setIsFullPlayerVisible(true);
            listenStartRef.current = Date.now();
            return;
        }

        // Set up queue from context
        if (context?.songs && context.songs.length > 0) {
            const songList = context.songs;
            const startIdx = context.startIndex ?? songList.findIndex(s => s.id === song.id);
            setQueue(songList);
            setOriginalQueue(songList);
            setQueueIndex(startIdx >= 0 ? startIdx : 0);
            setIsShuffled(false);
        } else {
            // Single song play — set minimal queue
            setQueue([song]);
            setOriginalQueue([song]);
            setQueueIndex(0);
            setIsShuffled(false);
        }

        // New song
        setCurrentSong(song);
        setCurrentTime(0);
        setIsFullPlayerVisible(true);
        listenStartRef.current = Date.now();
        accumulatedRef.current = 0;
        useMockTimerRef.current = false;

        addToPlayHistory(song);

        const loaded = await loadAndPlay(song);

        if (!loaded) {
            useMockTimerRef.current = true;
            const dur = song._durationSeconds || parseDuration(song.duration);
            setDuration(dur);
            setIsPlaying(true);
        }
    }, [currentSong, loadAndPlay, addToPlayHistory]);

    const togglePlay = useCallback(async () => {
        if (soundRef.current) {
            const status = await soundRef.current.getStatusAsync();
            if (status.isLoaded) {
                if (status.isPlaying) {
                    await soundRef.current.pauseAsync();
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

    const toggleRepeat = useCallback(() => {
        setIsRepeat(prev => {
            isRepeatRef.current = !prev;
            return !prev;
        });
    }, []);

    const dismissPlayer = useCallback(async () => {
        setIsPlaying(false);
        setIsFullPlayerVisible(false);
        await unloadSound();
        setCurrentSong(null);
        setCurrentTime(0);
        setDuration(0);
        setQueue([]);
        setQueueIndex(-1);
        setOriginalQueue([]);
        setIsShuffled(false);
        useMockTimerRef.current = false;
    }, [unloadSound]);

    // ── Skip next ──
    const skipNext = useCallback(async () => {
        await logCurrentStream();
        accumulatedRef.current = 0;

        const q = queueRef.current;
        const idx = queueIndexRef.current;

        if (q.length === 0 || idx < 0) {
            // No queue — restart current song
            listenStartRef.current = Date.now();
            setCurrentTime(0);
            if (soundRef.current) {
                try { await soundRef.current.setPositionAsync(0); } catch (e) {}
            }
            return;
        }

        if (idx < q.length - 1) {
            const nextIdx = idx + 1;
            const nextSong = q[nextIdx];
            setQueueIndex(nextIdx);
            setCurrentSong(nextSong);
            setCurrentTime(0);
            listenStartRef.current = Date.now();
            addToPlayHistory(nextSong);

            useMockTimerRef.current = false;
            const loaded = await loadAndPlay(nextSong);
            if (!loaded) {
                useMockTimerRef.current = true;
                const dur = nextSong._durationSeconds || parseDuration(nextSong.duration);
                setDuration(dur);
                setIsPlaying(true);
            }
        } else if (isRepeatRef.current) {
            // Wrap to beginning
            const nextSong = q[0];
            setQueueIndex(0);
            setCurrentSong(nextSong);
            setCurrentTime(0);
            listenStartRef.current = Date.now();
            addToPlayHistory(nextSong);

            useMockTimerRef.current = false;
            const loaded = await loadAndPlay(nextSong);
            if (!loaded) {
                useMockTimerRef.current = true;
                const dur = nextSong._durationSeconds || parseDuration(nextSong.duration);
                setDuration(dur);
                setIsPlaying(true);
            }
        } else {
            // At end of queue, no repeat — restart current
            listenStartRef.current = Date.now();
            setCurrentTime(0);
            if (soundRef.current) {
                try { await soundRef.current.setPositionAsync(0); } catch (e) {}
            }
        }
    }, [logCurrentStream, loadAndPlay, addToPlayHistory]);

    // ── Skip previous ──
    const skipPrevious = useCallback(async () => {
        // If more than 3 seconds in, restart current song
        if (currentTime > 3) {
            accumulatedRef.current = 0;
            listenStartRef.current = Date.now();
            setCurrentTime(0);
            if (soundRef.current) {
                try { await soundRef.current.setPositionAsync(0); } catch (e) {}
            }
            return;
        }

        await logCurrentStream();
        accumulatedRef.current = 0;

        const q = queueRef.current;
        const idx = queueIndexRef.current;

        if (q.length === 0 || idx <= 0) {
            // No previous — restart current
            listenStartRef.current = Date.now();
            setCurrentTime(0);
            if (soundRef.current) {
                try { await soundRef.current.setPositionAsync(0); } catch (e) {}
            }
            return;
        }

        const prevIdx = idx - 1;
        const prevSong = q[prevIdx];
        setQueueIndex(prevIdx);
        setCurrentSong(prevSong);
        setCurrentTime(0);
        listenStartRef.current = Date.now();
        addToPlayHistory(prevSong);

        useMockTimerRef.current = false;
        const loaded = await loadAndPlay(prevSong);
        if (!loaded) {
            useMockTimerRef.current = true;
            const dur = prevSong._durationSeconds || parseDuration(prevSong.duration);
            setDuration(dur);
            setIsPlaying(true);
        }
    }, [currentTime, logCurrentStream, loadAndPlay, addToPlayHistory]);

    // ── Shuffle toggle ──
    const toggleShuffle = useCallback(() => {
        setIsShuffled(prev => {
            if (!prev) {
                // Enable shuffle: shuffle queue keeping current song at front
                setQueue(current => {
                    const idx = queueIndexRef.current;
                    const shuffled = shuffleArray(current, idx);
                    setQueueIndex(0); // current song is now at index 0
                    return shuffled;
                });
            } else {
                // Disable shuffle: restore original queue
                setQueue(orig => {
                    const currentSongNow = currentSongRef.current;
                    const origQ = originalQueue;
                    if (currentSongNow) {
                        const origIdx = origQ.findIndex(s => s.id === currentSongNow.id);
                        setQueueIndex(origIdx >= 0 ? origIdx : 0);
                    }
                    return origQ;
                });
            }
            return !prev;
        });
    }, [originalQueue]);

    // ── Queue manipulation ──
    const addToQueue = useCallback((song: Song) => {
        setQueue(prev => [...prev, song]);
        setOriginalQueue(prev => [...prev, song]);
    }, []);

    const playNext = useCallback((song: Song) => {
        setQueue(prev => {
            const idx = queueIndexRef.current;
            const next = [...prev];
            next.splice(idx + 1, 0, song);
            return next;
        });
        setOriginalQueue(prev => {
            const idx = queueIndexRef.current;
            const next = [...prev];
            next.splice(idx + 1, 0, song);
            return next;
        });
    }, []);

    const removeFromQueue = useCallback((index: number) => {
        setQueue(prev => {
            const next = [...prev];
            next.splice(index, 1);
            return next;
        });
        // Adjust queueIndex if needed
        setQueueIndex(prev => {
            if (index < prev) return prev - 1;
            return prev;
        });
    }, []);

    const clearQueue = useCallback(() => {
        const song = currentSongRef.current;
        if (song) {
            setQueue([song]);
            setOriginalQueue([song]);
            setQueueIndex(0);
        } else {
            setQueue([]);
            setOriginalQueue([]);
            setQueueIndex(-1);
        }
    }, []);

    const playQueue = useCallback(async (songs: Song[], startIndex: number) => {
        if (songs.length === 0) return;
        const idx = Math.max(0, Math.min(startIndex, songs.length - 1));
        const song = songs[idx];

        setQueue(songs);
        setOriginalQueue(songs);
        setQueueIndex(idx);
        setIsShuffled(false);
        setCurrentSong(song);
        setCurrentTime(0);
        setIsFullPlayerVisible(true);
        listenStartRef.current = Date.now();
        accumulatedRef.current = 0;
        useMockTimerRef.current = false;

        addToPlayHistory(song);

        const loaded = await loadAndPlay(song);
        if (!loaded) {
            useMockTimerRef.current = true;
            const dur = song._durationSeconds || parseDuration(song.duration);
            setDuration(dur);
            setIsPlaying(true);
        }
    }, [loadAndPlay, addToPlayHistory]);

    const jumpToQueueIndex = useCallback(async (index: number) => {
        const q = queueRef.current;
        if (index < 0 || index >= q.length) return;

        await logCurrentStream();
        accumulatedRef.current = 0;

        const song = q[index];
        setQueueIndex(index);
        setCurrentSong(song);
        setCurrentTime(0);
        listenStartRef.current = Date.now();
        addToPlayHistory(song);

        useMockTimerRef.current = false;
        const loaded = await loadAndPlay(song);
        if (!loaded) {
            useMockTimerRef.current = true;
            const dur = song._durationSeconds || parseDuration(song.duration);
            setDuration(dur);
            setIsPlaying(true);
        }
    }, [logCurrentStream, loadAndPlay, addToPlayHistory]);

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
                isRepeat,
                queue,
                queueIndex,
                isShuffled,
                playHistory,
                playSong,
                togglePlay,
                openFullPlayer,
                closeFullPlayer,
                dismissPlayer,
                seekTo,
                skipNext,
                skipPrevious,
                setVolume,
                toggleRepeat,
                toggleShuffle,
                addToQueue,
                playNext,
                removeFromQueue,
                clearQueue,
                playQueue,
                jumpToQueueIndex,
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
