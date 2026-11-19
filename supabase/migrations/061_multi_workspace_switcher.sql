-- ============================================================
-- 061_multi_workspace_switcher.sql
--
-- Enables Multi-Workspace Management:
-- 1. Drops idx_accounts_one_per_owner so an admin can create
--    multiple workspaces (e.g. Sales, Support, Admissions)
-- 2. Creates account_members table for workspace memberships
-- 3. Adds switch_active_account RPC to safely switch active workspace
-- 4. Adds create_workspace RPC to create and switch to a new workspace
-- 5. Adds list_my_workspaces RPC to list all accessible workspaces
-- ============================================================

-- 1. Drop the single-account-per-owner constraint
DROP INDEX IF EXISTS idx_accounts_one_per_owner;

-- 2. Create account_members table
CREATE TABLE IF NOT EXISTS account_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role account_role_enum NOT NULL DEFAULT 'agent',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (account_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_account_members_user ON account_members(user_id);
CREATE INDEX IF NOT EXISTS idx_account_members_account ON account_members(account_id);

ALTER TABLE account_members ENABLE ROW LEVEL SECURITY;

-- Members can see memberships of accounts they belong to
DROP POLICY IF EXISTS account_members_select ON account_members;
CREATE POLICY account_members_select ON account_members
  FOR SELECT USING (
    user_id = auth.uid() OR is_account_member(account_id, 'admin')
  );

-- Admins can insert/update/delete memberships in their account
DROP POLICY IF EXISTS account_members_admin ON account_members;
CREATE POLICY account_members_admin ON account_members
  FOR ALL USING (is_account_member(account_id, 'admin'));

-- 3. Backfill account_members from current accounts (owners) and profiles
INSERT INTO account_members (account_id, user_id, role)
SELECT id, owner_user_id, 'owner'::account_role_enum
FROM accounts
ON CONFLICT (account_id, user_id) DO NOTHING;

INSERT INTO account_members (account_id, user_id, role)
SELECT account_id, user_id, COALESCE(account_role, 'agent'::account_role_enum)
FROM profiles
WHERE account_id IS NOT NULL
ON CONFLICT (account_id, user_id) DO NOTHING;

-- 4. RPC to switch active account
CREATE OR REPLACE FUNCTION public.switch_active_account(p_account_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role account_role_enum;
  v_account_name TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;

  -- Verify membership: caller must either be the account owner or exist in account_members
  SELECT a.name, COALESCE(am.role, 'owner'::account_role_enum)
  INTO v_account_name, v_role
  FROM accounts a
  LEFT JOIN account_members am ON am.account_id = a.id AND am.user_id = auth.uid()
  WHERE a.id = p_account_id
    AND (a.owner_user_id = auth.uid() OR am.user_id = auth.uid());

  IF v_account_name IS NULL THEN
    RAISE EXCEPTION 'You are not a member of this workspace' USING ERRCODE = '42501';
  END IF;

  -- Atomically switch the active profile account_id and account_role
  UPDATE profiles
  SET account_id = p_account_id,
      account_role = v_role
  WHERE user_id = auth.uid();

  RETURN json_build_object(
    'ok', true,
    'account_id', p_account_id,
    'account_name', v_account_name,
    'role', v_role
  );
END;
$$;

ALTER FUNCTION public.switch_active_account(UUID) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.switch_active_account(UUID) TO authenticated;

-- 5. RPC to create a workspace and switch to it
CREATE OR REPLACE FUNCTION public.create_workspace(p_name TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_account_id UUID;
  v_trimmed TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;

  v_trimmed := TRIM(p_name);
  IF v_trimmed = '' THEN
    RAISE EXCEPTION 'Workspace name cannot be empty' USING ERRCODE = '22023';
  END IF;

  -- 1. Create account
  INSERT INTO accounts (name, owner_user_id)
  VALUES (v_trimmed, auth.uid())
  RETURNING id INTO v_account_id;

  -- 2. Add as owner in account_members
  INSERT INTO account_members (account_id, user_id, role)
  VALUES (v_account_id, auth.uid(), 'owner'::account_role_enum)
  ON CONFLICT (account_id, user_id) DO NOTHING;

  -- 3. Switch active workspace to the new one
  UPDATE profiles
  SET account_id = v_account_id,
      account_role = 'owner'::account_role_enum
  WHERE user_id = auth.uid();

  RETURN json_build_object(
    'ok', true,
    'account_id', v_account_id,
    'account_name', v_trimmed,
    'role', 'owner'
  );
END;
$$;

ALTER FUNCTION public.create_workspace(TEXT) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.create_workspace(TEXT) TO authenticated;

-- 6. RPC to list all accessible workspaces for the user
CREATE OR REPLACE FUNCTION public.list_my_workspaces()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSON;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;

  SELECT json_agg(
    json_build_object(
      'id', a.id,
      'name', a.name,
      'role', COALESCE(am.role, 'owner'::account_role_enum),
      'is_active', (a.id = p.account_id),
      'phone_number_id', wc.phone_number_id,
      'whatsapp_status', wc.status
    ) ORDER BY a.created_at ASC
  ) INTO v_result
  FROM accounts a
  LEFT JOIN account_members am ON am.account_id = a.id AND am.user_id = auth.uid()
  LEFT JOIN whatsapp_config wc ON wc.account_id = a.id
  JOIN profiles p ON p.user_id = auth.uid()
  WHERE a.owner_user_id = auth.uid() OR am.user_id = auth.uid();

  RETURN COALESCE(v_result, '[]'::JSON);
END;
$$;

ALTER FUNCTION public.list_my_workspaces() OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.list_my_workspaces() TO authenticated;
