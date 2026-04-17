-- Migration 025: Disable NFT-holder royalty allocation (Coming Soon)
--
-- Purpose
-- -------
-- For the first launch we are temporarily disabling the "Royalty Allocation
-- to NFT holders" feature. NFT holders will NOT receive any streaming
-- revenue share for now. The UI shows a "Coming Soon" card in the Create
-- NFT Release modal and the Royalty Share card has been removed from the
-- consumer NFT detail page.
--
-- This migration provides defense-in-depth on the database side:
--   1. Default `nft_releases.allocated_royalty_percent` to 0 so any new
--      release created without explicit value gets 0 (matches the UI which
--      now always sends 0).
--   2. Document the temporary freeze with a column comment.
--
-- What we deliberately do NOT do:
--   * We do NOT zero out existing rows. The current royalty engine
--     (migration 007 `generate_stream_royalty`) does not distribute
--     streaming revenue to NFT holders at all — it only credits split-sheet
--     parties or the song creator directly. So existing non-zero values are
--     historically meaningful but functionally inert. Preserving them keeps
--     the data we need to re-enable the feature later.
--   * We do NOT drop the column or its CHECK (0..50) constraint, so the
--     feature can be re-enabled by simply changing the default back and
--     restoring the UI control.
--
-- Safety
-- ------
-- Idempotent: ALTER COLUMN ... SET DEFAULT and COMMENT ON COLUMN are both
-- safe to re-run.

ALTER TABLE nft_releases
    ALTER COLUMN allocated_royalty_percent SET DEFAULT 0;

COMMENT ON COLUMN nft_releases.allocated_royalty_percent IS
    'Percent of streaming revenue allocated to NFT holders for this release. '
    'TEMPORARILY FROZEN at 0 for first launch (see migration 025). UI hides '
    'the input and always sends 0; backend royalty engine '
    '(generate_stream_royalty) does not distribute to NFT holders. Existing '
    'non-zero rows are preserved for history and will be honored when the '
    'feature is re-enabled.';
