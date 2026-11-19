-- Fix permissions and add self-healing to touch_presence RPC

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.member_presence TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.member_presence TO service_role;

CREATE OR REPLACE FUNCTION public.touch_presence(
  p_status TEXT DEFAULT 'online'
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_account_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;

  IF p_status NOT IN ('online', 'away') THEN
    p_status := 'online';
  END IF;

  SELECT account_id INTO v_account_id
  FROM public.profiles
  WHERE user_id = auth.uid();

  -- If profile is missing or account_id is null, self-heal by linking or creating personal account
  IF v_account_id IS NULL THEN
    SELECT id INTO v_account_id
    FROM public.accounts
    WHERE owner_user_id = auth.uid()
    LIMIT 1;

    IF v_account_id IS NULL THEN
      INSERT INTO public.accounts (name, owner_user_id)
      VALUES ('My account', auth.uid())
      RETURNING id INTO v_account_id;
    END IF;

    INSERT INTO public.profiles (user_id, full_name, email, account_id, account_role)
    VALUES (
      auth.uid(),
      COALESCE((SELECT raw_user_meta_data->>'full_name' FROM auth.users WHERE id = auth.uid()), ''),
      COALESCE((SELECT email FROM auth.users WHERE id = auth.uid()), ''),
      v_account_id,
      'owner'
    )
    ON CONFLICT (user_id) DO UPDATE
      SET account_id = excluded.account_id,
          account_role = COALESCE(profiles.account_role, 'owner');
  END IF;

  INSERT INTO public.member_presence (user_id, account_id, status, last_seen_at)
  VALUES (auth.uid(), v_account_id, p_status, now())
  ON CONFLICT (user_id) DO UPDATE
    SET status       = excluded.status,
        last_seen_at = now(),
        account_id   = excluded.account_id;
END;
$$;

ALTER FUNCTION public.touch_presence(TEXT) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.touch_presence(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.touch_presence(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.touch_presence(TEXT) TO service_role;
