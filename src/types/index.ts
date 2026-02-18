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
    totalEditions?: number;
    editionsSold?: number;
    lyrics?: string;
    credits?: {
        performedBy: string;
        writtenBy: string;
        producedBy: string;
        releaseDate: string;
    };
}

export interface Artist {
    id: string;
    name: string;
    avatar: string;
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
