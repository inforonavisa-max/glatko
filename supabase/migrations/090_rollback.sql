-- Rollback for 090_quote_messaging_pro_initiate.sql
-- Restores the customer-only thread creation (pre-G-QUOTE-MESSAGING). Pros lose
-- the ability to initiate; thread creation reverts to request-owner-only.

CREATE OR REPLACE FUNCTION public.glatko_get_or_create_thread(p_request_id uuid, p_professional_id uuid, p_initial_quote_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_user_id UUID := auth.uid();
  v_request_owner UUID;
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
  IF v_request_owner <> v_user_id THEN
    RAISE EXCEPTION 'Forbidden: not request owner';
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
    p_request_id, p_professional_id, v_user_id, p_initial_quote_id, 'active'
  )
  RETURNING id INTO v_thread_id;

  RETURN v_thread_id;
END;
$function$;
