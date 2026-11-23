-- ============================================================
-- 065_lead_campaign_name.sql
--
-- Adds campaign_name and ad_name to meta_lead_logs for tracking
-- Meta ad campaign attribution in the Leads tab.
-- ============================================================

ALTER TABLE public.meta_lead_logs
  ADD COLUMN IF NOT EXISTS campaign_name TEXT,
  ADD COLUMN IF NOT EXISTS ad_name TEXT;

CREATE INDEX IF NOT EXISTS idx_meta_lead_logs_campaign ON public.meta_lead_logs(account_id, campaign_name);
