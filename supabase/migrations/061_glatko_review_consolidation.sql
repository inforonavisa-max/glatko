-- ═══════════════════════════════════════════════════════════════════════════
-- G-REVIEW-R0 (061): Review system consolidation — quote canonical,
-- bid-era review deactivated
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Context: two parallel review systems coexisted —
--   • bid-era  glatko_reviews (001, double-blind, multi-axis) wired to
--     /review/[requestId] + bid CTAs
--   • quote-era glatko_quote_reviews (037, single-axis, Airbnb-style
--     completion state machine) wired to the /messages ChatBox flow
-- Decision (Rohat, 2026-06-10): quote system is CANONICAL. Bid-era review
-- surfaces close in the app; this migration retires its DB-side automation.
-- The glatko_reviews table is intentionally KEPT (no-DROP rule; 0 rows).
--
-- It also fixes an aggregate-writer race on glatko_professional_profiles:
--   1. glatko_on_review_insert      (bid review)  → avg_rating/total_reviews
--   2. glatko_update_pro_rating_…   (quote review) → avg_rating/total_reviews
--                                    + OVERWROTE completed_jobs with a COUNT
--                                    of quote-confirmed jobs (stomping #3)
--   3. glatko_on_job_complete       (bid job flow) → completed_jobs += 1
--                                    (KEPT — job flow, not review system)
-- After this migration each column has exactly one writer per flow, and
-- completed_jobs updates at CONFIRMATION time (review-independent) instead
-- of as a side-effect of a review row being written.

-- ─── A. Deactivate bid-era review trigger ───────────────────────────────────

DROP TRIGGER IF EXISTS trg_glatko_review_insert ON public.glatko_reviews;

COMMENT ON FUNCTION public.glatko_on_review_insert() IS
'DEACTIVATED by G-REVIEW-R0 (061): bid-era review system retired in favor
of glatko_quote_reviews. Trigger trg_glatko_review_insert dropped; function
body kept untouched for rollback reference only.';

-- ─── B. Quote review trigger owns ratings ONLY ──────────────────────────────
-- Same name/trigger wiring as 037; body no longer touches completed_jobs.

CREATE OR REPLACE FUNCTION public.glatko_update_pro_rating_from_quote_reviews()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pro_id UUID := COALESCE(NEW.professional_id, OLD.professional_id);
BEGIN
  UPDATE public.glatko_professional_profiles
  SET
    avg_rating = COALESCE((
      SELECT AVG(rating)::NUMERIC(3,2)
      FROM public.glatko_quote_reviews
      WHERE professional_id = v_pro_id
        AND status = 'published'
    ), 0),
    total_reviews = (
      SELECT COUNT(*)
      FROM public.glatko_quote_reviews
      WHERE professional_id = v_pro_id
        AND status = 'published'
    ),
    updated_at = NOW()
  WHERE id = v_pro_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- ─── C. completed_jobs maintained at confirmation time ──────────────────────
-- Fires on the completion_state transition itself, so a customer who
-- confirms but never reviews still counts. Decrement covers the admin
-- correction path (a row leaving customer_confirmed). Additive with the
-- bid-era glatko_on_job_complete increment — no overwrite.

CREATE OR REPLACE FUNCTION public.glatko_on_quote_completion_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.completion_state = 'customer_confirmed'
     AND OLD.completion_state IS DISTINCT FROM 'customer_confirmed' THEN
    UPDATE public.glatko_professional_profiles
    SET completed_jobs = completed_jobs + 1,
        updated_at = NOW()
    WHERE id = NEW.professional_id;
  ELSIF OLD.completion_state = 'customer_confirmed'
        AND NEW.completion_state IS DISTINCT FROM 'customer_confirmed' THEN
    UPDATE public.glatko_professional_profiles
    SET completed_jobs = GREATEST(completed_jobs - 1, 0),
        updated_at = NOW()
    WHERE id = NEW.professional_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_glatko_quote_completion_change
  ON public.glatko_request_quotes;
CREATE TRIGGER trg_glatko_quote_completion_change
  AFTER UPDATE OF completion_state ON public.glatko_request_quotes
  FOR EACH ROW
  EXECUTE FUNCTION public.glatko_on_quote_completion_change();

COMMENT ON FUNCTION public.glatko_on_quote_completion_change() IS
'G-REVIEW-R0 (061): completed_jobs += 1 when a quote enters
customer_confirmed (review-independent), -= 1 if it ever leaves that state
(admin correction). Coexists additively with bid-era glatko_on_job_complete.';
