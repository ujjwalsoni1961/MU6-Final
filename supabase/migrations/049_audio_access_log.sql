-- ============================================================
-- 049 — Audio access log (light DRM visibility)
-- ============================================================
-- Best-effort log of signed-URL requests issued by get-audio-url.
-- Written by edge function service_role only; clients have no access.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.audio_access_log (
    id BIGSERIAL PRIMARY KEY,
    profile_id UUID,
    path TEXT NOT NULL,
    ip TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audio_access_log_profile_created_idx
    ON public.audio_access_log (profile_id, created_at DESC);

ALTER TABLE public.audio_access_log ENABLE ROW LEVEL SECURITY;
-- No policies → service_role only.
