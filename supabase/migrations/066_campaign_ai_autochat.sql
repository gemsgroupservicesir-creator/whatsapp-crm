-- ============================================================
-- 066_campaign_ai_autochat.sql
--
-- Enables Campaign-Specific AI Auto Follow-Up & AI Auto-Chat:
-- 1. Enhances lead_assignment_rules with:
--    - followup_template_name: WhatsApp template to send when lead is received
--    - ai_auto_chat_enabled: whether AI should auto-chat with the lead
--    - ai_campaign_prompt: campaign-specific knowledge / prompt guidance for AI
-- 2. Enhances meta_lead_logs with:
--    - ai_chat_enabled: per-lead AI auto-chat switch
--    - ai_followup_status: status of initial auto follow-up
-- ============================================================

ALTER TABLE public.lead_assignment_rules
  ADD COLUMN IF NOT EXISTS followup_template_name TEXT DEFAULT 'education_admissions_welcome',
  ADD COLUMN IF NOT EXISTS ai_auto_chat_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS ai_campaign_prompt TEXT;

ALTER TABLE public.meta_lead_logs
  ADD COLUMN IF NOT EXISTS ai_chat_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS ai_followup_status TEXT NOT NULL DEFAULT 'sent';

-- Update the existing "Mamata MBA" rule with campaign-specific AI guidance
UPDATE public.lead_assignment_rules
SET
  followup_template_name = 'education_admissions_welcome',
  ai_auto_chat_enabled = true,
  ai_campaign_prompt = 'Focus on MBA (Master of Business Administration) admissions in India for Nepalese students. Highlight top universities (Amity, Symbiosis, LPU, Chandigarh University), specializations (Finance, Marketing, HR, Business Analytics), fee structure ranging from 4 to 10 Lakhs INR, and scholarship discounts up to 50% for high-scoring students. Eligibility: Minimum 50% in Bachelor graduation degree (BBA/BBS/B.Tech/B.Sc). Explain the admission process step-by-step and direct them to Senior Counselor Mamata Yadav.'
WHERE criteria_type = 'campaign_name' AND match_value ILIKE '%Mamata MBA%';
