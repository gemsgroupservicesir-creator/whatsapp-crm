-- ============================================================
-- 062_workspace_features.sql
--
-- Enables granular workspace feature access control:
-- Admins can tick/untick features per workspace (e.g. Inbox, Contacts,
-- Pipelines, Broadcasts, Automations, Flows, AI Agents)
-- ============================================================

ALTER TABLE accounts
ADD COLUMN IF NOT EXISTS enabled_features TEXT[]
DEFAULT ARRAY['inbox', 'contacts', 'pipelines', 'broadcasts', 'automations', 'flows', 'agents'];

UPDATE accounts
SET enabled_features = ARRAY['inbox', 'contacts', 'pipelines', 'broadcasts', 'automations', 'flows', 'agents']
WHERE enabled_features IS NULL;
