-- ============================================================================
-- TAMILNADU SUPPLIERS - SHARED, PERSISTENT LOGIN RATE LIMITING
-- Migration: 20261023_login_rate_limits.sql
--
-- Replaces the in-memory limiter. State lives in Postgres so it survives app
-- restarts and is shared by every app instance. All mutations are single atomic
-- statements (INSERT .. ON CONFLICT DO UPDATE), so concurrent attempts cannot
-- race. Keys are SHA-256 hashes computed by the app; no usernames, IPs or
-- passwords are stored in clear text.
--
-- MUST be applied BEFORE deploying the matching app version: login fails closed
-- (HTTP 503) when these functions are unavailable.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.login_rate_limits (
    key          TEXT PRIMARY KEY,
    attempts     INTEGER     NOT NULL DEFAULT 0,
    window_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    locked_until TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_login_rate_limits_window ON public.login_rate_limits(window_start);

-- Only the service role (server) may touch this table; no policies = no access for anon/authenticated.
ALTER TABLE public.login_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.login_rate_limits FROM anon, authenticated;
GRANT ALL ON TABLE public.login_rate_limits TO service_role;

-- Is this key currently locked?
CREATE OR REPLACE FUNCTION public.login_rate_limit_status(p_key TEXT)
RETURNS TABLE (blocked BOOLEAN, retry_after_seconds INTEGER)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT
        COALESCE(r.locked_until > NOW(), FALSE),
        COALESCE(GREATEST(CEIL(EXTRACT(EPOCH FROM (r.locked_until - NOW())))::INTEGER, 0), 0)
    FROM (SELECT 1) AS d
    LEFT JOIN public.login_rate_limits r ON r.key = p_key
$$;

-- Atomically record one failed attempt; locks the key when p_max is reached within the window.
CREATE OR REPLACE FUNCTION public.login_rate_limit_record_failure(
    p_key TEXT,
    p_max INTEGER,
    p_window_seconds INTEGER,
    p_lockout_seconds INTEGER
)
RETURNS TABLE (blocked BOOLEAN, retry_after_seconds INTEGER, attempts INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_attempts INTEGER;
    v_locked   TIMESTAMPTZ;
BEGIN
    INSERT INTO public.login_rate_limits AS t (key, attempts, window_start, locked_until)
    VALUES (p_key, 1, NOW(), CASE WHEN 1 >= p_max THEN NOW() + make_interval(secs => p_lockout_seconds) END)
    ON CONFLICT (key) DO UPDATE SET
        attempts = CASE
            WHEN (t.locked_until IS NULL OR t.locked_until <= NOW())
                 AND t.window_start < NOW() - make_interval(secs => p_window_seconds)
            THEN 1 ELSE t.attempts + 1 END,
        window_start = CASE
            WHEN (t.locked_until IS NULL OR t.locked_until <= NOW())
                 AND t.window_start < NOW() - make_interval(secs => p_window_seconds)
            THEN NOW() ELSE t.window_start END,
        locked_until = CASE
            WHEN (t.locked_until IS NULL OR t.locked_until <= NOW())
                 AND t.window_start < NOW() - make_interval(secs => p_window_seconds)
            THEN CASE WHEN 1 >= p_max THEN NOW() + make_interval(secs => p_lockout_seconds) END
            WHEN t.attempts + 1 >= p_max THEN NOW() + make_interval(secs => p_lockout_seconds)
            ELSE t.locked_until END
    RETURNING t.attempts, t.locked_until INTO v_attempts, v_locked;

    -- Opportunistic cleanup of long-expired rows (keeps the table bounded).
    IF random() < 0.05 THEN
        DELETE FROM public.login_rate_limits
        WHERE window_start < NOW() - INTERVAL '1 day'
          AND (locked_until IS NULL OR locked_until < NOW());
    END IF;

    RETURN QUERY SELECT
        COALESCE(v_locked > NOW(), FALSE),
        COALESCE(GREATEST(CEIL(EXTRACT(EPOCH FROM (v_locked - NOW())))::INTEGER, 0), 0),
        v_attempts;
END;
$$;

-- Clear a key after a successful login.
CREATE OR REPLACE FUNCTION public.login_rate_limit_clear(p_key TEXT)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    DELETE FROM public.login_rate_limits WHERE key = p_key
$$;

REVOKE ALL ON FUNCTION public.login_rate_limit_status(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.login_rate_limit_record_failure(TEXT, INTEGER, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.login_rate_limit_clear(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.login_rate_limit_status(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.login_rate_limit_record_failure(TEXT, INTEGER, INTEGER, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.login_rate_limit_clear(TEXT) TO service_role;
NOTIFY pgrst, 'reload schema';
