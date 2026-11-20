-- ============================================================
-- 064_lead_management_and_assignment.sql
--
-- Enables Lead Management and Auto-Assignment:
-- 1. Enhances meta_lead_logs with agent assignment (assigned_to),
--    college, course, city, notes, lead_status, conversation linkage.
-- 2. Creates lead_assignment_rules table for auto-assigning leads
--    to agents based on College Name, Course Name, or Form Name.
-- ============================================================

-- 1. Add lead tracking and assignment columns to meta_lead_logs
ALTER TABLE public.meta_lead_logs
  ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS college TEXT,
  ADD COLUMN IF NOT EXISTS course TEXT,
  ADD COLUMN IF NOT EXISTS city TEXT,
  ADD COLUMN IF NOT EXISTS lead_status TEXT NOT NULL DEFAULT 'new',
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_meta_lead_logs_assigned ON public.meta_lead_logs(account_id, assigned_to);
CREATE INDEX IF NOT EXISTS idx_meta_lead_logs_status ON public.meta_lead_logs(account_id, lead_status);
CREATE INDEX IF NOT EXISTS idx_meta_lead_logs_college ON public.meta_lead_logs(account_id, college);
CREATE INDEX IF NOT EXISTS idx_meta_lead_logs_course ON public.meta_lead_logs(account_id, course);

-- Allow authenticated members to update lead status, notes, and assignment within their workspace
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'meta_lead_logs' AND policyname = 'Members can update their account lead logs'
  ) THEN
    CREATE POLICY "Members can update their account lead logs"
    ON public.meta_lead_logs FOR UPDATE
    TO authenticated
    USING (account_id = (SELECT account_id FROM profiles WHERE user_id = auth.uid()))
    WITH CHECK (account_id = (SELECT account_id FROM profiles WHERE user_id = auth.uid()));
  END IF;
END $$;

-- 2. Create lead_assignment_rules table
CREATE TABLE IF NOT EXISTS public.lead_assignment_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  priority INT NOT NULL DEFAULT 0,
  criteria_type TEXT NOT NULL DEFAULT 'college', -- 'college', 'course', 'form_name', 'any'
  operator TEXT NOT NULL DEFAULT 'contains', -- 'contains', 'equals', 'starts_with', 'ends_with'
  match_value TEXT NOT NULL,
  assign_to_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lead_assignment_rules_acc ON public.lead_assignment_rules(account_id, priority ASC);

ALTER TABLE public.lead_assignment_rules ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'lead_assignment_rules' AND policyname = 'Members can view lead assignment rules'
  ) THEN
    CREATE POLICY "Members can view lead assignment rules"
    ON public.lead_assignment_rules FOR SELECT
    TO authenticated
    USING (account_id = (SELECT account_id FROM profiles WHERE user_id = auth.uid()));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'lead_assignment_rules' AND policyname = 'Admins can manage lead assignment rules'
  ) THEN
    CREATE POLICY "Admins can manage lead assignment rules"
    ON public.lead_assignment_rules FOR ALL
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
END $$;
