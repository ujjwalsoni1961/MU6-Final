import React from 'react';
import { Platform } from 'react-native';
import { usePlayer } from '../../context/PlayerContext';
import MiniPlayer from './MiniPlayer';
import FullPlayer from './FullPlayer';
import WebPlayerBar from './WebPlayerBar';

const isWeb = Platform.OS === 'web';

export default function MusicPlayerOverlay() {
    const { currentSong, isFullPlayerVisible } = usePlayer();

    if (!currentSong) return null;

    // Web: use the persistent bottom bar + expandable panel
    if (isWeb) {
        return <WebPlayerBar />;
    }

    // Mobile: Mini Player + Full Player
    return (
        <>
            {!isFullPlayerVisible && <MiniPlayer />}
            {isFullPlayerVisible && <FullPlayer />}
        </>
    );
}
