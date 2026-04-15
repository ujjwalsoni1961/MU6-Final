/**
 * Hook to determine if the current user is an artist (creator) or collaborator.
 *
 * Artist: has created songs (songs.creator_id = profile.id) OR creator_type = 'artist'
 * Collaborator: no created songs, but appears in song_rights_splits
 */

import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';

export interface CreatorRole {
    isArtist: boolean;
    isCollaborator: boolean;
    role: 'artist' | 'collaborator' | 'unknown';
    songsCreated: number;
    loading: boolean;
}

export function useCreatorRole(): CreatorRole {
    const { profile } = useAuth();
    const [state, setState] = useState<CreatorRole>({
        isArtist: true, // default to artist until determined
        isCollaborator: false,
        role: 'artist',
        songsCreated: 0,
        loading: true,
    });

    useEffect(() => {
        if (!profile?.id) {
            setState({ isArtist: true, isCollaborator: false, role: 'artist', songsCreated: 0, loading: false });
            return;
        }

        let cancelled = false;

        (async () => {
            try {
                // Count songs created by this user
                const { count: songsCreated } = await supabase
                    .from('songs')
                    .select('*', { count: 'exact', head: true })
                    .eq('creator_id', profile.id);

                if (cancelled) return;

                const createdCount = songsCreated || 0;

                // If they have created songs or their creator_type is 'artist', they're an artist
                if (createdCount > 0 || profile.creatorType === 'artist') {
                    setState({
                        isArtist: true,
                        isCollaborator: false,
                        role: 'artist',
                        songsCreated: createdCount,
                        loading: false,
                    });
                    return;
                }

                // Check if they appear in song_rights_splits (as a collaborator)
                const { count: splitCount } = await supabase
                    .from('song_rights_splits')
                    .select('*', { count: 'exact', head: true })
                    .or(`linked_profile_id.eq.${profile.id},party_email.eq.${profile.email}`);

                if (cancelled) return;

                const hasSplits = (splitCount || 0) > 0;

                // Collaborator types: producer, composer, songwriter, publisher, featured, other
                const collaboratorTypes = ['producer', 'composer', 'songwriter', 'publisher', 'featured', 'other'];
                const isCollabType = profile.creatorType ? collaboratorTypes.includes(profile.creatorType) : false;

                if (hasSplits || isCollabType) {
                    setState({
                        isArtist: false,
                        isCollaborator: true,
                        role: 'collaborator',
                        songsCreated: 0,
                        loading: false,
                    });
                } else {
                    // Default to artist view
                    setState({
                        isArtist: true,
                        isCollaborator: false,
                        role: 'artist',
                        songsCreated: 0,
                        loading: false,
                    });
                }
            } catch (err) {
                console.error('[useCreatorRole] Error:', err);
                if (!cancelled) {
                    setState({ isArtist: true, isCollaborator: false, role: 'artist', songsCreated: 0, loading: false });
                }
            }
        })();

        return () => { cancelled = true; };
    }, [profile?.id, profile?.creatorType, profile?.email]);

    return state;
}
