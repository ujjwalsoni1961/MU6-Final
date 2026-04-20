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
    /** Deployed thirdweb Split contract address for revenue distribution */
    splitContractAddress?: string | null;
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
    /** Custom NFT cover image (from nft_releases.cover_image_path), falls back to song cover */
    nftCoverImage?: string;
    price: number;
    /** Price in native token (POL) */
    priceToken?: number | null;
    /** EUR snapshot at listing/mint time */
    priceEurAtList?: number | null;
    editionNumber: number;
    totalEditions: number;
    mintedCount: number;
    owner: string;
    rarity: 'common' | 'rare' | 'legendary';
    priceHistory?: { price: number; date: string }[];
    /** Release tier name */
    tierName?: string;
    /** Release description */
    description?: string | null;
    /** Benefits/perks of this NFT */
    benefits?: { title: string; description: string }[];
    /** Allocated royalty percent for streaming revenue */
    allocatedRoyaltyPercent?: number;
    /** On-chain token ID (for polygonscan links) */
    onChainTokenId?: string;
    /** Owner wallet address */
    ownerWallet?: string;
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
    /**
     * ERC-1155 contract address for this ownership pair. Carried alongside
     * the tokenId so flows that don't have a DB `nft_tokens` row yet (chain-
     * first discovery) can still list / manage the NFT using the canonical
     * (contract, tokenId) pair as the source of truth.
     */
    contractAddress: string;
    ownershipStatus: NFTOwnershipStatus;
    activeListingId?: string;
    activeListingPrice?: number;
    chainListingId?: string;
    /**
     * How many copies of this ERC-1155 (contract, on_chain_token_id) the wallet
     * currently holds on-chain. Driven by `balanceOf(wallet, tokenId)` — the
     * canonical source of truth. Always >= 1 when the entry is rendered.
     * Used to show a “×N” badge when the wallet owns multiple copies instead
     * of rendering duplicate ledger rows.
     */
    ownedQuantity: number;
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
    price: number;   // Price in ETH/POL
    priceEur?: number; // EUR price at time of trade
    fromWallet: string;
    toWallet: string;
}

/** User's display currency preference */
export type DisplayCurrency = 'EUR' | 'USD' | 'GBP';

/** Profile with display currency */
export interface ProfileSettings {
    displayCurrency: DisplayCurrency;
}

/** NFT token with on-chain price data */
export interface NFTTokenPriceData {
    pricePaidToken?: number | null;
    pricePaidEurAtSale?: number | null;
    lastSalePriceToken?: number | null;
    lastSalePriceEur?: number | null;
}
