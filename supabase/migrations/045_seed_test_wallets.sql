-- ============================================================
-- 045 — Seed test wallets (for E2E QA)
-- ============================================================
-- These 3 Polygon Amoy wallets are used for automated end-to-end testing
-- of the artist / user1 / user2 journeys. Keys live in Vercel preview env
-- vars only (never committed). Seeding here is idempotent.
--
-- profiles.id FKs to auth.users(id) so we insert auth.users rows first with
-- deterministic UUIDs, then insert matching profiles. Run as postgres
-- (migration 046 updated the guard trigger to treat session_user='postgres'
-- as privileged).
--
-- Deterministic UUIDs so re-runs are stable:
--   test-artist uuid: 11111111-1111-1111-1111-aaaaaaaaaaaa
--   test-user-1 uuid: 22222222-2222-2222-2222-bbbbbbbbbbbb
--   test-user-2 uuid: 33333333-3333-3333-3333-cccccccccccc
-- ============================================================

-- 1. Seed auth.users rows (minimal, email-confirmed, password-less — these
--    accounts are only ever logged into via Thirdweb wallet connect).
INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, is_sso_user, is_anonymous
)
VALUES
    (
        '00000000-0000-0000-0000-000000000000',
        '11111111-1111-1111-1111-aaaaaaaaaaaa',
        'authenticated', 'authenticated',
        'test-artist@mu6.app', '',
        now(), '{"provider":"mu6-e2e","providers":["mu6-e2e"]}'::jsonb, '{}'::jsonb,
        now(), now(), false, false
    ),
    (
        '00000000-0000-0000-0000-000000000000',
        '22222222-2222-2222-2222-bbbbbbbbbbbb',
        'authenticated', 'authenticated',
        'test-user-1@mu6.app', '',
        now(), '{"provider":"mu6-e2e","providers":["mu6-e2e"]}'::jsonb, '{}'::jsonb,
        now(), now(), false, false
    ),
    (
        '00000000-0000-0000-0000-000000000000',
        '33333333-3333-3333-3333-cccccccccccc',
        'authenticated', 'authenticated',
        'test-user-2@mu6.app', '',
        now(), '{"provider":"mu6-e2e","providers":["mu6-e2e"]}'::jsonb, '{}'::jsonb,
        now(), now(), false, false
    )
ON CONFLICT (id) DO NOTHING;

-- 2. Seed matching profiles.
INSERT INTO profiles (
    id, wallet_address, email, display_name, bio,
    creator_type, role, is_verified, country, is_blocked, is_active
)
VALUES
    (
        '11111111-1111-1111-1111-aaaaaaaaaaaa',
        '0xe07540793d7e3f1dc3e3ebf2f85c215b2e047828',
        'test-artist@mu6.app',
        'Test Artist',
        'MU6 QA creator account (testnet only)',
        'artist',
        'creator',
        true,
        'US',
        false,
        true
    ),
    (
        '22222222-2222-2222-2222-bbbbbbbbbbbb',
        '0x8bccdc2b685dd995cf3c709304955fd18c225e28',
        'test-user-1@mu6.app',
        'Test User 1',
        'MU6 QA listener (primary buyer)',
        null,
        'listener',
        false,
        'US',
        false,
        true
    ),
    (
        '33333333-3333-3333-3333-cccccccccccc',
        '0x37fe83e0a2d0b1dba6fe1abe72eeaf9a0ef421c4',
        'test-user-2@mu6.app',
        'Test User 2',
        'MU6 QA listener (secondary buyer)',
        null,
        'listener',
        false,
        'US',
        false,
        true
    )
ON CONFLICT (wallet_address) DO NOTHING;
