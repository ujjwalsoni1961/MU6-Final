import { createThirdwebClient } from 'thirdweb';

export const thirdwebClient = createThirdwebClient({
    clientId: process.env.EXPO_PUBLIC_THIRDWEB_CLIENT_ID!,
});
