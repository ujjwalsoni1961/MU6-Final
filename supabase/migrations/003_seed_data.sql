-- ============================================================
-- MU6 – Seed Data for Development / Testing
-- ============================================================
-- Note: In production, profiles are created via the auth flow.
-- For dev/test, we insert directly using service role.
-- These UUIDs are deterministic for reproducibility.

-- ----- PROFILES -----
-- We create auth.users entries first, then profiles.
-- Using Supabase's auth.users table directly for seeding.

INSERT INTO auth.users (id, email, raw_user_meta_data, role, aud, created_at, updated_at, instance_id, encrypted_password, confirmation_token, email_confirmed_at)
VALUES
  ('00000000-0000-0000-0000-000000000001', 'cybersoul@mu6.io', '{"display_name": "Cyber Soul"}', 'authenticated', 'authenticated', now(), now(), '00000000-0000-0000-0000-000000000000', crypt('testpass123', gen_salt('bf')), '', now()),
  ('00000000-0000-0000-0000-000000000002', 'wanderers@mu6.io', '{"display_name": "The Wanderers"}', 'authenticated', 'authenticated', now(), now(), '00000000-0000-0000-0000-000000000000', crypt('testpass123', gen_salt('bf')), '', now()),
  ('00000000-0000-0000-0000-000000000003', 'luna@mu6.io', '{"display_name": "Luna"}', 'authenticated', 'authenticated', now(), now(), '00000000-0000-0000-0000-000000000000', crypt('testpass123', gen_salt('bf')), '', now()),
  ('00000000-0000-0000-0000-000000000004', 'djx@mu6.io', '{"display_name": "DJ X"}', 'authenticated', 'authenticated', now(), now(), '00000000-0000-0000-0000-000000000000', crypt('testpass123', gen_salt('bf')), '', now()),
  ('00000000-0000-0000-0000-000000000005', 'sarah@mu6.io', '{"display_name": "Sarah Jenkins"}', 'authenticated', 'authenticated', now(), now(), '00000000-0000-0000-0000-000000000000', crypt('testpass123', gen_salt('bf')), '', now()),
  ('00000000-0000-0000-0000-000000000006', 'synthsquad@mu6.io', '{"display_name": "Synth Squad"}', 'authenticated', 'authenticated', now(), now(), '00000000-0000-0000-0000-000000000000', crypt('testpass123', gen_salt('bf')), '', now()),
  -- Consumers
  ('00000000-0000-0000-0000-000000000101', 'alice@example.com', '{"display_name": "Alice Cooper"}', 'authenticated', 'authenticated', now(), now(), '00000000-0000-0000-0000-000000000000', crypt('testpass123', gen_salt('bf')), '', now()),
  ('00000000-0000-0000-0000-000000000102', 'bob@example.com', '{"display_name": "Bob Marley"}', 'authenticated', 'authenticated', now(), now(), '00000000-0000-0000-0000-000000000000', crypt('testpass123', gen_salt('bf')), '', now()),
  -- Admin
  ('00000000-0000-0000-0000-000000000200', 'admin@mu6.io', '{"display_name": "Admin User"}', 'authenticated', 'authenticated', now(), now(), '00000000-0000-0000-0000-000000000000', crypt('testpass123', gen_salt('bf')), '', now())
ON CONFLICT (id) DO NOTHING;

-- Now create identities for these users (required by Supabase auth)
INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
VALUES
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000001', '{"sub":"00000000-0000-0000-0000-000000000001","email":"cybersoul@mu6.io"}', 'email', '00000000-0000-0000-0000-000000000001', now(), now(), now()),
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000002', '{"sub":"00000000-0000-0000-0000-000000000002","email":"wanderers@mu6.io"}', 'email', '00000000-0000-0000-0000-000000000002', now(), now(), now()),
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000003', '{"sub":"00000000-0000-0000-0000-000000000003","email":"luna@mu6.io"}', 'email', '00000000-0000-0000-0000-000000000003', now(), now(), now()),
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000004', '{"sub":"00000000-0000-0000-0000-000000000004","email":"djx@mu6.io"}', 'email', '00000000-0000-0000-0000-000000000004', now(), now(), now()),
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000005', '{"sub":"00000000-0000-0000-0000-000000000005","email":"sarah@mu6.io"}', 'email', '00000000-0000-0000-0000-000000000005', now(), now(), now()),
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000006', '{"sub":"00000000-0000-0000-0000-000000000006","email":"synthsquad@mu6.io"}', 'email', '00000000-0000-0000-0000-000000000006', now(), now(), now()),
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000101', '{"sub":"00000000-0000-0000-0000-000000000101","email":"alice@example.com"}', 'email', '00000000-0000-0000-0000-000000000101', now(), now(), now()),
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000102', '{"sub":"00000000-0000-0000-0000-000000000102","email":"bob@example.com"}', 'email', '00000000-0000-0000-0000-000000000102', now(), now(), now()),
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000200', '{"sub":"00000000-0000-0000-0000-000000000200","email":"admin@mu6.io"}', 'email', '00000000-0000-0000-0000-000000000200', now(), now(), now())
ON CONFLICT DO NOTHING;

-- Profiles (creators)
INSERT INTO profiles (id, wallet_address, email, display_name, bio, creator_type, role, is_verified, country) VALUES
  ('00000000-0000-0000-0000-000000000001', '0xCyber0001000000000000000000000000000000', 'cybersoul@mu6.io', 'Cyber Soul', 'Electronic music producer pushing the boundaries of sound. Known for immersive live sets and groundbreaking NFT drops.', 'artist', 'creator', true, 'finland'),
  ('00000000-0000-0000-0000-000000000002', '0xWander002000000000000000000000000000000', 'wanderers@mu6.io', 'The Wanderers', 'Synthwave duo creating nostalgic soundscapes for the digital age.', 'artist', 'creator', true, 'finland'),
  ('00000000-0000-0000-0000-000000000003', '0xLuna00030000000000000000000000000000000', 'luna@mu6.io', 'Luna', 'Ambient artist crafting ethereal soundscapes that transport listeners to other worlds.', 'artist', 'creator', false, 'finland'),
  ('00000000-0000-0000-0000-000000000004', '0xDJX000040000000000000000000000000000000', 'djx@mu6.io', 'DJ X', 'The king of bass. Headlining festivals worldwide with explosive dubstep productions.', 'artist', 'creator', true, 'finland'),
  ('00000000-0000-0000-0000-000000000005', '0xSarah0050000000000000000000000000000000', 'sarah@mu6.io', 'Sarah Jenkins', 'Singer-songwriter with a passion for raw, acoustic storytelling.', 'artist', 'creator', true, 'finland'),
  ('00000000-0000-0000-0000-000000000006', '0xSynth0060000000000000000000000000000000', 'synthsquad@mu6.io', 'Synth Squad', 'Retro-futuristic collective blending 80s synths with modern production techniques.', 'artist', 'creator', false, 'finland')
ON CONFLICT (id) DO NOTHING;

-- Profiles (consumers)
INSERT INTO profiles (id, wallet_address, email, display_name, role) VALUES
  ('00000000-0000-0000-0000-000000000101', '0x71C7656EC7ab88b098defB751B7401B5f6d8976F', 'alice@example.com', 'Alice Cooper', 'listener'),
  ('00000000-0000-0000-0000-000000000102', '0x82D7656EC7ab88b098defB751B7401B5f6d8976F', 'bob@example.com', 'Bob Marley', 'listener')
ON CONFLICT (id) DO NOTHING;

-- Profile (admin)
INSERT INTO profiles (id, wallet_address, email, display_name, role) VALUES
  ('00000000-0000-0000-0000-000000000200', '0xA4F7656EC7ab88b098defB751B7401B5f6d8976F', 'admin@mu6.io', 'Admin User', 'admin')
ON CONFLICT (id) DO NOTHING;

-- ----- SONGS -----
INSERT INTO songs (id, creator_id, title, album, genre, duration_seconds, cover_path, is_published, plays_count, likes_count, release_date, track_type) VALUES
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Neon Nights',      NULL, 'Electronic', 225, 'https://picsum.photos/seed/neon/400/400',     true, 12500, 3400, '2024-10-24', 'original'),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000002', 'Midnight Drive',   NULL, 'Synthwave',  252, 'https://picsum.photos/seed/midnight/400/400',  true, 8900,  2100, '2024-09-15', 'original'),
  ('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000004', 'Urban Jungle',     NULL, 'Hip-Hop',    178, 'https://picsum.photos/seed/urban/400/400',     true, 45000, 12000,'2024-08-01', 'original'),
  ('10000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000003', 'Ethereal Dreams',  NULL, 'Ambient',    330, 'https://picsum.photos/seed/ethereal/400/400',  true, 3200,  890,  '2024-07-20', 'original'),
  ('10000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000004', 'Bass Drop',        NULL, 'Dubstep',    195, 'https://picsum.photos/seed/bass/400/400',      true, 15000, 4500, '2024-06-10', 'original'),
  ('10000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000005', 'Acoustic Morning', NULL, 'Pop',        185, 'https://picsum.photos/seed/acoustic/400/400',  true, 22000, 6700, '2024-05-05', 'original'),
  ('10000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000000006', 'Retro Future',     NULL, 'Synthwave',  230, 'https://picsum.photos/seed/retro/400/400',     true, 9800,  2300, '2024-04-15', 'original'),
  ('10000000-0000-0000-0000-000000000008', '00000000-0000-0000-0000-000000000001', 'Deep Blue',        NULL, 'Ambient',    370, 'https://picsum.photos/seed/deep/400/400',      true, 1800,  450,  '2024-03-10', 'original'),
  ('10000000-0000-0000-0000-000000000009', '00000000-0000-0000-0000-000000000004', 'Street Life',      NULL, 'Hip-Hop',    202, 'https://picsum.photos/seed/street/400/400',    true, 34000, 9000, '2024-02-28', 'original'),
  ('10000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000002', 'Electric Love',    NULL, 'Rock',       213, 'https://picsum.photos/seed/electric/400/400',  true, 28000, 7800, '2024-01-20', 'original'),
  ('10000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000001', 'Lo-fi Study Beats',NULL, 'Lo-fi',      165, 'https://picsum.photos/seed/lofi/400/400',      true, 56000, 15000,'2024-01-05', 'original'),
  ('10000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000000003', 'Golden Hour',      NULL, 'R&B',        235, 'https://picsum.photos/seed/golden/400/400',    true, 11000, 3200, '2023-12-15', 'original')
ON CONFLICT (id) DO NOTHING;

-- ----- SONG RIGHTS SPLITS -----
-- Each song gets a simple 100% split to the creator for MVP
-- Using a transaction block so the deferred constraint trigger validates correctly
BEGIN;
INSERT INTO song_rights_splits (song_id, party_email, party_name, role, share_percent, linked_profile_id) VALUES
  ('10000000-0000-0000-0000-000000000001', 'cybersoul@mu6.io',   'Cyber Soul',      'artist', 100, '00000000-0000-0000-0000-000000000001'),
  ('10000000-0000-0000-0000-000000000002', 'wanderers@mu6.io',   'The Wanderers',   'artist', 100, '00000000-0000-0000-0000-000000000002'),
  ('10000000-0000-0000-0000-000000000003', 'djx@mu6.io',         'DJ X',            'artist', 100, '00000000-0000-0000-0000-000000000004'),
  ('10000000-0000-0000-0000-000000000004', 'luna@mu6.io',        'Luna',            'artist', 100, '00000000-0000-0000-0000-000000000003'),
  ('10000000-0000-0000-0000-000000000005', 'djx@mu6.io',         'DJ X',            'artist', 100, '00000000-0000-0000-0000-000000000004'),
  ('10000000-0000-0000-0000-000000000006', 'sarah@mu6.io',       'Sarah Jenkins',   'artist', 100, '00000000-0000-0000-0000-000000000005'),
  ('10000000-0000-0000-0000-000000000007', 'synthsquad@mu6.io',  'Synth Squad',     'artist', 100, '00000000-0000-0000-0000-000000000006'),
  ('10000000-0000-0000-0000-000000000008', 'cybersoul@mu6.io',   'Cyber Soul',      'artist', 100, '00000000-0000-0000-0000-000000000001'),
  ('10000000-0000-0000-0000-000000000009', 'djx@mu6.io',         'DJ X',            'artist', 100, '00000000-0000-0000-0000-000000000004'),
  ('10000000-0000-0000-0000-000000000010', 'wanderers@mu6.io',   'The Wanderers',   'artist', 100, '00000000-0000-0000-0000-000000000002'),
  ('10000000-0000-0000-0000-000000000011', 'cybersoul@mu6.io',   'Cyber Soul',      'artist', 100, '00000000-0000-0000-0000-000000000001'),
  ('10000000-0000-0000-0000-000000000012', 'luna@mu6.io',        'Luna',            'artist', 100, '00000000-0000-0000-0000-000000000003');
COMMIT;

-- ----- NFT RELEASES (tiers) -----
INSERT INTO nft_releases (id, song_id, tier_name, rarity, total_supply, allocated_royalty_percent, price_eth, minted_count) VALUES
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Neon Nights - Legendary', 'legendary', 10,  10, 0.05, 5),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'Neon Nights - Common',    'common',    100, 5,  0.02, 45),
  ('20000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000002', 'Midnight Drive - Rare',   'rare',      50,  8,  0.03, 12),
  ('20000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000004', 'Ethereal Dreams - Rare',  'rare',      20,  10, 0.08, 18),
  ('20000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000005', 'Bass Drop - Common',      'common',    100, 5,  0.04, 89),
  ('20000000-0000-0000-0000-000000000006', '10000000-0000-0000-0000-000000000005', 'Bass Drop - Legendary',   'legendary', 10,  15, 0.10, 2),
  ('20000000-0000-0000-0000-000000000007', '10000000-0000-0000-0000-000000000007', 'Retro Future - Rare',     'rare',      75,  7,  0.06, 30),
  ('20000000-0000-0000-0000-000000000008', '10000000-0000-0000-0000-000000000008', 'Deep Blue - Legendary',   'legendary', 10,  15, 0.10, 2),
  ('20000000-0000-0000-0000-000000000009', '10000000-0000-0000-0000-000000000010', 'Electric Love - Common',  'common',    100, 5,  0.05, 90),
  ('20000000-0000-0000-0000-000000000010', '10000000-0000-0000-0000-000000000010', 'Electric Love - Rare',    'rare',      50,  10, 0.08, 50),
  ('20000000-0000-0000-0000-000000000011', '10000000-0000-0000-0000-000000000012', 'Golden Hour - Rare',      'rare',      80,  8,  0.07, 45)
ON CONFLICT (id) DO NOTHING;

-- ----- SAMPLE NFT TOKENS -----
-- A few minted tokens for the consumers
INSERT INTO nft_tokens (id, nft_release_id, token_id, owner_wallet_address, minted_at) VALUES
  -- Alice owns some NFTs
  ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '1', '0x71C7656EC7ab88b098defB751B7401B5f6d8976F', now() - interval '30 days'),
  ('30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000005', '45', '0x71C7656EC7ab88b098defB751B7401B5f6d8976F', now() - interval '25 days'),
  ('30000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000007', '3', '0x71C7656EC7ab88b098defB751B7401B5f6d8976F', now() - interval '20 days'),
  ('30000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000009', '88', '0x71C7656EC7ab88b098defB751B7401B5f6d8976F', now() - interval '15 days'),
  -- Bob owns some NFTs
  ('30000000-0000-0000-0000-000000000005', '20000000-0000-0000-0000-000000000003', '12', '0x82D7656EC7ab88b098defB751B7401B5f6d8976F', now() - interval '28 days'),
  ('30000000-0000-0000-0000-000000000006', '20000000-0000-0000-0000-000000000004', '5', '0x82D7656EC7ab88b098defB751B7401B5f6d8976F', now() - interval '22 days'),
  ('30000000-0000-0000-0000-000000000007', '20000000-0000-0000-0000-000000000008', '1', '0x82D7656EC7ab88b098defB751B7401B5f6d8976F', now() - interval '18 days'),
  ('30000000-0000-0000-0000-000000000008', '20000000-0000-0000-0000-000000000011', '22', '0x82D7656EC7ab88b098defB751B7401B5f6d8976F', now() - interval '10 days')
ON CONFLICT (id) DO NOTHING;

-- ----- SAMPLE FOLLOWS -----
INSERT INTO follows (follower_id, following_id) VALUES
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000004'),
  ('00000000-0000-0000-0000-000000000102', '00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-000000000102', '00000000-0000-0000-0000-000000000002'),
  ('00000000-0000-0000-0000-000000000102', '00000000-0000-0000-0000-000000000005')
ON CONFLICT DO NOTHING;
