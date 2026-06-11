-- ═══════════════════════════════════════════════════════════════
-- 063: G-REVIEW-R1 — reminder idempotency + review_request notif
--      type + pro response RPC
-- ═══════════════════════════════════════════════════════════════
-- Applied to prod 2026-06-11 via MCP apply_migration (Gate-1 approved).
-- Verification: column timestamptz ✓, CHECK 12 types ✓,
-- RPC prosecdef=true + search_path=public ✓.
--
-- Rollback:
--   ALTER TABLE public.glatko_request_quotes DROP COLUMN review_reminder_sent_at;
--   (re-create glatko_notifications_type_check with the 054 11-type list)
--   DROP FUNCTION public.glatko_pro_respond_to_review(UUID, TEXT);

-- (a) one-shot reminder stamp (K1 idempotency)
ALTER TABLE public.glatko_request_quotes
  ADD COLUMN IF NOT EXISTS review_reminder_sent_at TIMESTAMPTZ;

COMMENT ON COLUMN public.glatko_request_quotes.review_reminder_sent_at IS
'G-REVIEW-R1: set once by /api/cron/review-reminders when the single
3-day review reminder email is claimed for this job. NULL = not sent.
Atomic claim (UPDATE ... WHERE ... IS NULL RETURNING) makes a second
reminder structurally impossible.';

-- (b) notification type CHECK expand (054 pattern): + review_request
ALTER TABLE public.glatko_notifications
  DROP CONSTRAINT IF EXISTS glatko_notifications_type_check;
ALTER TABLE public.glatko_notifications
  ADD CONSTRAINT glatko_notifications_type_check
  CHECK (type IN (
    'new_bid','bid_accepted','bid_rejected','message','status_change',
    'review','verification_approved','verification_rejected',
    'new_request_match','thread_message','new_quote',
    'review_request'
  ));

-- (c) pro responds to a review about them — column-scoped via RPC
CREATE OR REPLACE FUNCTION public.glatko_pro_respond_to_review(
  p_review_id UUID, p_response TEXT
) RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_pro UUID;
BEGIN
  IF p_response IS NULL OR length(btrim(p_response)) NOT BETWEEN 1 AND 1000 THEN
    RAISE EXCEPTION 'Response must be 1-1000 characters';
  END IF;
  SELECT professional_id INTO v_pro FROM public.glatko_quote_reviews
   WHERE id = p_review_id AND status = 'published';
  IF v_pro IS NULL OR v_pro <> auth.uid() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  UPDATE public.glatko_quote_reviews
     SET pro_response = btrim(p_response), pro_response_at = NOW()
   WHERE id = p_review_id;
  RETURN TRUE;
END; $$;

REVOKE ALL ON FUNCTION public.glatko_pro_respond_to_review(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.glatko_pro_respond_to_review(UUID, TEXT) TO authenticated;
