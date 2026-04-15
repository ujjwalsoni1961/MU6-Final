/**
 * Split Contract Service
 *
 * Deploys thirdweb Split contracts for songs that have split sheets,
 * enabling on-chain revenue distribution to collaborators.
 *
 * Deployment is done server-side via the nft-admin edge function
 * (which uses thirdweb Engine API with the server wallet).
 */

import { supabase } from '../lib/supabase';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

/**
 * Deploy a Split contract for a song via the nft-admin edge function.
 *
 * The edge function reads the song's split sheet, deploys a thirdweb Split
 * contract with the correct payees/shares, and writes the contract address
 * back to songs.split_contract_address.
 *
 * @param songId - UUID of the song
 * @returns The deployed Split contract address, or null on failure
 */
export async function deploySplitForSong(
    songId: string,
): Promise<{ success: boolean; contractAddress?: string; error?: string }> {
    try {
        // Call the nft-admin edge function with the deploySplit action
        const url = `${SUPABASE_URL}/functions/v1/nft-admin`;
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            },
            body: JSON.stringify({
                action: 'deploySplit',
                songId,
            }),
        });

        const data = await response.json();
        if (!response.ok || !data.success) {
            console.error('[splitContracts] deploySplit failed:', data.error);
            return { success: false, error: data.error || 'Deploy failed' };
        }

        console.log('[splitContracts] Split contract deployed:', data.contractAddress);
        return { success: true, contractAddress: data.contractAddress };
    } catch (err: any) {
        console.error('[splitContracts] deploySplitForSong error:', err);
        return { success: false, error: err.message };
    }
}

/**
 * Check if a song has a deployed Split contract.
 */
export async function getSplitContractAddress(songId: string): Promise<string | null> {
    const { data } = await supabase
        .from('songs')
        .select('split_contract_address')
        .eq('id', songId)
        .maybeSingle();

    return data?.split_contract_address || null;
}

/**
 * Get the split sheet for a song — used to display split info
 * and to determine if a Split contract can be deployed.
 */
export async function getSongSplitSheet(songId: string): Promise<{
    splits: Array<{
        id: string;
        party_name: string;
        party_email: string;
        share_percent: number;
        linked_wallet_address: string | null;
        linked_profile_id: string | null;
    }>;
    allHaveWallets: boolean;
}> {
    const { data: splits } = await supabase
        .from('song_rights_splits')
        .select('id, party_name, party_email, share_percent, linked_wallet_address, linked_profile_id')
        .eq('song_id', songId);

    const list = splits || [];
    const allHaveWallets = list.length > 0 && list.every((s) => !!s.linked_wallet_address);

    return { splits: list, allHaveWallets };
}
