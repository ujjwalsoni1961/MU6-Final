export interface Song {
    id: string;
    title: string;
    artistName: string;
    coverImage: string;
    genre: string;
    duration: string;
    plays: number;
    likes: number;
    price: number;
    isNFT: boolean;
    isPublished?: boolean;
    totalEditions?: number;
    editionsSold?: number;
    lyrics?: string;
    credits?: {
        performedBy: string;
        writtenBy: string;
        producedBy: string;
        releaseDate: string;
    };
    // Extended fields from DB adapter
    _creatorId?: string;
    _audioPath?: string | null;
    _coverPath?: string | null;
    _durationSeconds?: number | null;
}

export interface Artist {
    id: string;
    name: string;
    avatar: string;
    cover: string | null;
    bio: string;
    followers: number;
    totalSongs: number;
    totalNFTsSold: number;
    totalEarnings: number;
    verified: boolean;
}

export interface NFT {
    id: string;
    songId: string;
    /** Profile ID of the song's creator (used to detect own NFTs) */
    creatorId: string;
    songTitle: string;
    artistName: string;
    coverImage: string;
    price: number;
    editionNumber: number;
    totalEditions: number;
    owner: string;
    rarity: 'common' | 'rare' | 'legendary';
    priceHistory?: { price: number; date: string }[];
}

export interface Transaction {
    id: string;
    type: 'purchase' | 'royalty' | 'withdrawal' | 'listing';
    songTitle?: string;
    buyer?: string;
    seller?: string;
    price: number;
    date: string;
    status: 'completed' | 'pending' | 'failed';
    fee?: number;
    isFlagged?: boolean;
}

export interface User {
    id: string;
    name: string;
    avatar: string;
    walletAddress: string;
    ownedNFTs: number;
    likedSongs: number;
    email: string;
    role: 'consumer' | 'artist' | 'admin';
    joinedDate: string;
    status: 'active' | 'suspended';
}

/** Listing status for an owned NFT in the collection view */
export type NFTOwnershipStatus = 'unlisted' | 'listed' | 'sold';

/** Extended NFT type with ownership/listing details for collection view */
export interface OwnedNFT extends NFT {
    tokenDbId: string;
    onChainTokenId: string;
    ownershipStatus: NFTOwnershipStatus;
    activeListingId?: string;
    activeListingPrice?: number;
    chainListingId?: string;
}

export interface Playlist {
    id: string;
    ownerId: string;
    name: string;
    description?: string;
    coverPath?: string;
    coverImage?: string;
    isPublic: boolean;
    createdAt: string;
    updatedAt: string;
    songCount?: number;
    songs?: Song[];
}

export interface TradeEvent {
    id: string;      // Unique identifier for the event
    type: 'mint' | 'sale';
    date: string;    // ISO string timestamp
    price: number;   // Price in ETH
    fromWallet: string;
    toWallet: string;
}
