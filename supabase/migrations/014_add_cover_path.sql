-- Add cover_path column to profiles table
-- The edit-artist-profile page allows uploading cover art, but the column was missing
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS cover_path text;
