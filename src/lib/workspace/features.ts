export interface WorkspaceFeature {
  id: string;
  name: string;
  description: string;
  iconName: string;
  badge?: string;
}

export const WORKSPACE_FEATURES: WorkspaceFeature[] = [
  {
    id: "inbox",
    name: "WhatsApp Inbox & Live Chat",
    description: "Two-way customer messaging, templates, quick replies, and attachments.",
    iconName: "MessageSquare",
  },
  {
    id: "contacts",
    name: "Contacts & Audience CRM",
    description: "Customer directory, tags, custom fields, and conversation history.",
    iconName: "Users",
  },
  {
    id: "pipelines",
    name: "Deals & Sales Pipelines",
    description: "Visual Kanban deal boards, revenue stages, and sales pipelines.",
    iconName: "GitBranch",
  },
  {
    id: "broadcasts",
    name: "Campaign Broadcasts",
    description: "Bulk WhatsApp marketing campaigns and Meta template blasts.",
    iconName: "Radio",
  },
  {
    id: "automations",
    name: "Automations & Rules",
    description: "Trigger-based automatic actions, tag rules, and workflows.",
    iconName: "Zap",
  },
  {
    id: "flows",
    name: "WhatsApp Flows & Chatbots",
    description: "Interactive native WhatsApp forms and multi-step chatbot flows.",
    iconName: "Workflow",
    badge: "Beta",
  },
  {
    id: "agents",
    name: "AI Agents & Auto-Reply",
    description: "AI-assisted drafting, knowledge base, and automated replies.",
    iconName: "Bot",
  },
];

export const DEFAULT_ENABLED_FEATURES = WORKSPACE_FEATURES.map((f) => f.id);

export function normalizeEnabledFeatures(features: unknown): string[] {
  if (!Array.isArray(features) || features.length === 0) {
    return DEFAULT_ENABLED_FEATURES;
  }
  return features.filter((f): f is string => typeof f === "string");
}
