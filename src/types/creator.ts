export const CREATOR_TYPES = ['artist', 'producer', 'composer'] as const;
export type CreatorType = (typeof CREATOR_TYPES)[number];

export const ENABLED_CREATOR_TYPES: CreatorType[] = ['artist'];

export const CREATOR_TYPE_LABELS: Record<CreatorType, string> = {
    artist: 'Artist',
    producer: 'Producer',
    composer: 'Composer',
};

export interface CreatorProfile {
    legalFullName: string;
    stageName: string;
    email: string;
    country: 'finland' | 'other';
    countryOther?: string;
    creatorType: CreatorType;
}

export const GENRES = ['Electronic', 'Hip-Hop', 'Pop', 'Other'] as const;
export type Genre = (typeof GENRES)[number];

export const TRACK_TYPES = [
    { value: 'original', label: 'Original track (100% my creation)' },
    { value: 'cover', label: 'Cover version' },
    { value: 'remix', label: 'Remix' },
    { value: 'other', label: 'Other' },
] as const;
export type TrackType = (typeof TRACK_TYPES)[number]['value'];

export const OWNERSHIP_OPTIONS = [
    { value: 'i_own_100', label: 'I own 100%' },
    { value: 'label_owns_100', label: 'Record label owns 100%' },
    { value: 'shared', label: 'We share ownership' },
] as const;
export type OwnershipType = (typeof OWNERSHIP_OPTIONS)[number]['value'];

export const COMPOSITION_OPTIONS = [
    { value: 'i_own_100', label: 'I own 100%' },
    { value: 'someone_else_owns_100', label: 'Someone else owns 100%' },
    { value: 'shared', label: 'We share ownership' },
] as const;
export type CompositionOwnership = (typeof COMPOSITION_OPTIONS)[number]['value'];

export const SPLIT_ROLES = ['Artist', 'Producer', 'Composer', 'Other'] as const;
export type SplitRole = (typeof SPLIT_ROLES)[number];

export interface SplitEntry {
    name: string;
    role: SplitRole;
    percentage: string;
    email: string;
}

export interface SampleEntry {
    originalTrack: string;
    originalArtist: string;
    rightsHolder: string;
    licensed: 'yes' | 'no' | 'unsure';
}

export const PAYMENT_METHODS = [
    { value: 'bank_transfer', label: 'Bank Transfer' },
    { value: 'wise', label: 'Wise' },
    { value: 'crypto_wallet', label: 'Crypto Wallet' },
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number]['value'];

export const LEGAL_CONFIRMATIONS = [
    'I confirm that I have the legal right to distribute this track and all underlying compositions.',
    'I confirm that all information provided is accurate and complete to the best of my knowledge.',
    'I confirm that all samples used in this track have been properly cleared and licensed.',
    'I accept responsibility for any claims arising from the content I upload.',
    'I have read, understood, and agree to the MU6 Terms of Service and Creator Agreement.',
    'I understand that providing false information may result in removal of content and termination of my account.',
    'I agree to indemnify MU6 against any claims related to the rights of the content I upload.',
] as const;

export interface UploadFormState {
    legalFullName: string;
    stageName: string;
    email: string;
    country: 'finland' | 'other' | '';
    countryOther: string;

    trackTitle: string;
    albumEp: string;
    genre: Genre | '';
    genreOther: string;
    duration: string;
    releaseDate: string;
    firstReleaseAnywhere: boolean | null;
    audioFileName: string;

    trackType: TrackType | '';
    trackTypeOther: string;

    masterOwnership: OwnershipType | '';
    masterOwnershipPercentage: string;

    compositionOwnership: CompositionOwnership | '';
    compositionOwnerName: string;
    compositionOwnershipPercentage: string;

    splits: SplitEntry[];

    hasSamples: boolean | null;
    samples: SampleEntry[];
    licenseDocFileName: string;

    isFirstRelease: boolean | null;
    previousPlatform: string;
    previousReleaseDate: string;
    exclusiveRightsGranted: boolean | null;
    exclusivePlatform: string;
    exclusiveUntilDate: string;

    paymentMethod: PaymentMethod | '';
    accountHolderName: string;
    ibanOrAddress: string;
    taxId: string;
    payoutCountry: 'finland' | 'other' | '';
    payoutCountryOther: string;

    legalConfirmations: boolean[];
}

export function createInitialUploadFormState(): UploadFormState {
    return {
        legalFullName: '',
        stageName: '',
        email: '',
        country: '',
        countryOther: '',
        trackTitle: '',
        albumEp: '',
        genre: '',
        genreOther: '',
        duration: '',
        releaseDate: '',
        firstReleaseAnywhere: null,
        audioFileName: '',
        trackType: '',
        trackTypeOther: '',
        masterOwnership: '',
        masterOwnershipPercentage: '',
        compositionOwnership: '',
        compositionOwnerName: '',
        compositionOwnershipPercentage: '',
        splits: [{ name: '', role: 'Artist', percentage: '', email: '' }],
        hasSamples: null,
        samples: [{ originalTrack: '', originalArtist: '', rightsHolder: '', licensed: 'unsure' }],
        licenseDocFileName: '',
        isFirstRelease: null,
        previousPlatform: '',
        previousReleaseDate: '',
        exclusiveRightsGranted: null,
        exclusivePlatform: '',
        exclusiveUntilDate: '',
        paymentMethod: '',
        accountHolderName: '',
        ibanOrAddress: '',
        taxId: '',
        payoutCountry: '',
        payoutCountryOther: '',
        legalConfirmations: new Array(LEGAL_CONFIRMATIONS.length).fill(false),
    };
}
