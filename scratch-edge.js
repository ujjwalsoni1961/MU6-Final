const args = process.argv.slice(2);
fetch("https://ukavmvxelsfdfktiiyvg.supabase.co/functions/v1/payout-list", {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer sb_publishable_wL9HMvfWm4JZiSMuPI_mEw_P2Etx1D1'
    },
    body: JSON.stringify({ profileId: "77ac3f2d-8de5-4f38-8957-c8112c3000b2" }) // Try with some junk id
})
.then(r => r.json()).then(console.log).catch(console.error);
