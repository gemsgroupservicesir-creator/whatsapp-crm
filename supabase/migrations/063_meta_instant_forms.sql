-- ============================================================
-- 063_meta_instant_forms.sql
--
-- Enables Meta Instant Forms (Facebook & Instagram Lead Ads) Integration:
-- 1. meta_lead_configs: Stores page access tokens, webhook verify tokens,
--    auto-tagging, and auto-WhatsApp welcome message configuration per workspace.
-- 2. meta_lead_logs: Stores incoming lead payloads, status, contact linkage,
--    and WhatsApp auto-reply delivery status.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.meta_lead_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  page_id TEXT,
  page_name TEXT,
  page_access_token TEXT,
  verify_token TEXT NOT NULL DEFAULT encode(gen_random_bytes(16), 'hex'),
  auto_whatsapp_enabled BOOLEAN NOT NULL DEFAULT false,
  auto_template_id UUID REFERENCES message_templates(id) ON DELETE SET NULL,
  auto_template_name TEXT,
  auto_tag TEXT NOT NULL DEFAULT 'Meta Lead',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT meta_lead_configs_account_unique UNIQUE(account_id)
);

CREATE TABLE IF NOT EXISTS public.meta_lead_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  leadgen_id TEXT,
  form_id TEXT,
  form_name TEXT,
  full_name TEXT,
  phone TEXT,
  email TEXT,
  raw_data JSONB,
  status TEXT NOT NULL DEFAULT 'received',
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  whatsapp_sent BOOLEAN NOT NULL DEFAULT false,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_meta_lead_configs_account ON meta_lead_configs(account_id);
CREATE INDEX IF NOT EXISTS idx_meta_lead_configs_page ON meta_lead_configs(page_id);
CREATE INDEX IF NOT EXISTS idx_meta_lead_logs_account ON meta_lead_logs(account_id, created_at DESC);

ALTER TABLE public.meta_lead_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meta_lead_logs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'meta_lead_configs' AND policyname = 'Members can view their account lead configs'
  ) THEN
    CREATE POLICY "Members can view their account lead configs"
    ON public.meta_lead_configs FOR SELECT
    TO authenticated
    USING (account_id = (SELECT account_id FROM profiles WHERE user_id = auth.uid()));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'meta_lead_configs' AND policyname = 'Admins can manage their account lead configs'
  ) THEN
    CREATE POLICY "Admins can manage their account lead configs"
    ON public.meta_lead_configs FOR ALL
    TO authenticated
    USING (
      account_id = (SELECT account_id FROM profiles WHERE user_id = auth.uid())
      AND EXISTS (
        SELECT 1 FROM profiles 
        WHERE user_id = auth.uid() 
        AND account_role IN ('owner', 'admin')
      )
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'meta_lead_logs' AND policyname = 'Members can view their account lead logs'
  ) THEN
    CREATE POLICY "Members can view their account lead logs"
    ON public.meta_lead_logs FOR SELECT
    TO authenticated
    USING (account_id = (SELECT account_id FROM profiles WHERE user_id = auth.uid()));
  END IF;
END $$;
