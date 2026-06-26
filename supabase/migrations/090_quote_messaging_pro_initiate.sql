-- G-QUOTE-MESSAGING-FLOW-01: let EITHER side open the message thread.
--
-- Before: glatko_get_or_create_thread allowed ONLY the request owner (customer)
-- to create a thread (`v_request_owner <> v_user_id → Forbidden`). A pro who
-- quoted had no way to reach the customer and depended entirely on the customer
-- messaging first — a one-sided funnel break.
--
-- After: the quoting professional may also initiate, but ONLY:
--   • from their own profile (p_professional_id = caller), AND
--   • if they actually quoted this request (EXISTS in glatko_request_quotes).
-- Any other caller → Forbidden. Anonymous requests (no customer account) stay
-- rejected. customer_id on the thread is ALWAYS the request owner (never the
-- caller), so a pro-initiated thread still binds to the right customer and the
-- disintermediation/PII model is unchanged (pro sees the thread, never contact).
--
-- Signature is byte-identical to the prior single definition, so CREATE OR
-- REPLACE swaps it in place and preserves grants (authenticated EXECUTE).
-- Applied to prod via apply_migration (quote_messaging_pro_can_initiate_thread)
-- + verified: customer ALLOW, quoting-pro ALLOW (thread.customer_id=owner),
-- random-pro Forbidden, anonymous rejected, customer idempotent.

CREATE OR REPLACE FUNCTION public.glatko_get_or_create_thread(p_request_id uuid, p_professional_id uuid, p_initial_quote_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_user_id UUID := auth.uid();
  v_request_owner UUID;
  v_is_quoting_pro BOOLEAN;
  v_thread_id UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT customer_id INTO v_request_owner
  FROM public.glatko_service_requests
  WHERE id = p_request_id;

  IF v_request_owner IS NULL THEN
    RAISE EXCEPTION 'Request not found or anonymous (no customer)';
  END IF;

  v_is_quoting_pro := (v_user_id = p_professional_id) AND EXISTS (
    SELECT 1 FROM public.glatko_request_quotes q
    WHERE q.request_id = p_request_id
      AND q.professional_id = p_professional_id
  );

  IF NOT (v_user_id = v_request_owner OR v_is_quoting_pro) THEN
    RAISE EXCEPTION 'Forbidden: not a participant of this request';
  END IF;

  SELECT id INTO v_thread_id
  FROM public.glatko_message_threads
  WHERE request_id = p_request_id
    AND professional_id = p_professional_id;

  IF v_thread_id IS NOT NULL THEN
    RETURN v_thread_id;
  END IF;

  INSERT INTO public.glatko_message_threads (
    request_id, professional_id, customer_id, initial_quote_id, status
  ) VALUES (
    p_request_id, p_professional_id, v_request_owner, p_initial_quote_id, 'active'
  )
  RETURNING id INTO v_thread_id;

  RETURN v_thread_id;
END;
$function$;
