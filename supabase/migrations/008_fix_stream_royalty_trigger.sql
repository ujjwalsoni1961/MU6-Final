-- Fix: Cast JSONB string value to numeric via text extraction
CREATE OR REPLACE FUNCTION generate_stream_royalty()
RETURNS TRIGGER AS $$
DECLARE
  v_stream_rate NUMERIC(10,4);
  v_event_id UUID;
  v_source_ref TEXT;
BEGIN
  -- Only process qualified streams
  IF NEW.is_qualified = FALSE THEN
    RETURN NEW;
  END IF;

  -- Get stream rate from platform settings (value is JSONB, could be "0.003" or 0.003)
  SELECT COALESCE((value #>> '{}')::numeric, 0.003)
  INTO v_stream_rate
  FROM platform_settings
  WHERE key = 'stream_rate_eur';

  -- Fallback if no setting found
  IF v_stream_rate IS NULL THEN
    v_stream_rate := 0.003;
  END IF;

  -- Build unique source reference
  v_source_ref := 'stream:' || NEW.id::text;

  -- Create royalty event (idempotent via unique index)
  INSERT INTO royalty_events (song_id, source_type, source_reference, gross_amount_eur)
  VALUES (NEW.song_id, 'stream', v_source_ref, v_stream_rate)
  ON CONFLICT (source_type, source_reference) DO NOTHING
  RETURNING id INTO v_event_id;

  -- If event already existed (conflict), skip share creation
  IF v_event_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Create royalty shares based on the song's split sheet
  INSERT INTO royalty_shares (royalty_event_id, party_email, linked_profile_id, wallet_address, share_type, share_percent, amount_eur)
  SELECT
    v_event_id,
    srs.party_email,
    srs.linked_profile_id,
    srs.linked_wallet_address,
    'split',
    srs.share_percent,
    ROUND(v_stream_rate * srs.share_percent / 100, 6)
  FROM song_rights_splits srs
  WHERE srs.song_id = NEW.song_id;

  -- If no split sheet exists, assign 100% to the song creator
  IF NOT FOUND THEN
    INSERT INTO royalty_shares (royalty_event_id, linked_profile_id, share_type, share_percent, amount_eur)
    SELECT
      v_event_id,
      s.creator_id,
      'direct',
      100,
      v_stream_rate
    FROM songs s
    WHERE s.id = NEW.song_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
