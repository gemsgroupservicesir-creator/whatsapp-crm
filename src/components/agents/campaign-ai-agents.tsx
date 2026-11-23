"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Sparkles,
  Megaphone,
  User,
  Bot,
  Send,
  MessageSquare,
  FileText,
  CheckCircle2,
  SlidersHorizontal,
  Plus,
  RefreshCw,
  Trash2,
  ChevronRight,
  ExternalLink,
  HelpCircle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface AgentProfile {
  userId: string;
  fullName: string;
  email: string;
  role: string;
}

interface CampaignRule {
  id: string;
  name: string;
  criteria_type: "campaign_name" | "college" | "course" | "form_name" | "any";
  operator: "contains" | "equals" | "starts_with" | "ends_with";
  match_value: string;
  assign_to_user_id: string;
  priority: number;
  is_active: boolean;
  followup_template_name?: string;
  ai_auto_chat_enabled?: boolean;
  ai_campaign_prompt?: string | null;
  agent?: {
    user_id: string;
    full_name: string;
    email: string;
    account_role: string;
  } | null;
}

const TEMPLATE_PREVIEWS: Record<string, { label: string; text: string }> = {
  education_admissions_welcome: {
    label: "Admissions Desk Welcome (Default)",
    text: "Hello {{Student Name}}! Thank you for inquiring with Gems Group Services. We received your application for admission counseling. Our senior counselor is here to help you choose the best college, verify your scholarship eligibility, and guide you through the process.\n\nReply to this message with your questions, or type your preferred course to get started!",
  },
  education_scholarship_inquiry: {
    label: "Scholarship Desk Inquiry",
    text: "Namaste {{Student Name}}! Welcome to Gems Group Services Admissions Desk. We have received your inquiry regarding higher education admissions and scholarship opportunities.\n\nCould you please share your qualification marks or the program you are looking to join? Our team will provide available scholarship slabs and verified university options right away.",
  },
};

export function CampaignAiAgents() {
  const [rules, setRules] = useState<CampaignRule[]>([]);
  const [agents, setAgents] = useState<AgentProfile[]>([]);
  const [loading, setLoading] = useState(true);

  // New Rule Modal
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [newRuleName, setNewRuleName] = useState("");
  const [newCriteriaType, setNewCriteriaType] = useState<"campaign_name" | "college" | "course" | "form_name">("campaign_name");
  const [newMatchValue, setNewMatchValue] = useState("");
  const [newAssigneeId, setNewAssigneeId] = useState("");
  const [newTemplate, setNewTemplate] = useState("education_admissions_welcome");
  const [newAiChatEnabled, setNewAiChatEnabled] = useState(true);
  const [newAiPrompt, setNewAiPrompt] = useState("");
  const [creating, setCreating] = useState(false);

  // Edit Prompt State
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [editingPrompt, setEditingPrompt] = useState("");
  const [savingPrompt, setSavingPrompt] = useState(false);

  // Template Preview Modal
  const [previewTemplate, setPreviewTemplate] = useState<{ name: string; text: string; label: string } | null>(null);

  // Test Simulator State
  const [simulatingRule, setSimulatingRule] = useState<CampaignRule | null>(null);
  const [testStudentName, setTestStudentName] = useState("Rahul Sharma");
  const [testCourse, setTestCourse] = useState("MBA in Finance");
  const [testCollege, setTestCollege] = useState("Top B-Schools");
  const [chatMessages, setChatMessages] = useState<Array<{ role: "user" | "assistant"; content: string }>>([]);
  const [studentInput, setStudentInput] = useState("");
  const [sendingTest, setSendingTest] = useState(false);

  const fetchCampaignData = useCallback(async () => {
    try {
      setLoading(true);
      const [rulesRes, agentsRes] = await Promise.all([
        fetch("/api/leads/rules"),
        fetch("/api/account/users"),
      ]);

      if (rulesRes.ok) {
        const data = await rulesRes.json();
        setRules(data.rules || []);
      }
      if (agentsRes.ok) {
        const data = await agentsRes.json();
        setAgents(data.users || []);
      }
    } catch (err) {
      console.error("Error fetching campaign agent data:", err);
      toast.error("Failed to load campaign AI agents");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCampaignData();
  }, [fetchCampaignData]);

  const handleToggleAiChat = async (rule: CampaignRule, enabled: boolean) => {
    try {
      const res = await fetch("/api/leads/rules", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: rule.id,
          ai_auto_chat_enabled: enabled,
        }),
      });
      if (!res.ok) throw new Error("Failed to update AI chat setting");
      toast.success(enabled ? "AI Auto-Chat activated for this campaign" : "AI Auto-Chat paused for this campaign");
      fetchCampaignData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Update failed");
    }
  };

  const handleChangeTemplate = async (rule: CampaignRule, templateName: string) => {
    try {
      const res = await fetch("/api/leads/rules", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: rule.id,
          followup_template_name: templateName,
        }),
      });
      if (!res.ok) throw new Error("Failed to update template");
      toast.success("Follow-up WhatsApp template updated");
      fetchCampaignData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Update failed");
    }
  };

  const handleSavePrompt = async (ruleId: string) => {
    try {
      setSavingPrompt(true);
      const res = await fetch("/api/leads/rules", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: ruleId,
          ai_campaign_prompt: editingPrompt.trim() || null,
        }),
      });
      if (!res.ok) throw new Error("Failed to save guidance prompt");
      toast.success("AI Campaign Guidance saved successfully!");
      setEditingRuleId(null);
      fetchCampaignData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSavingPrompt(false);
    }
  };

  const handleCreateRule = async () => {
    if (!newRuleName.trim() || !newMatchValue.trim() || !newAssigneeId) {
      toast.error("Please fill in Rule Name, Match Keyword, and Counselor");
      return;
    }

    try {
      setCreating(true);
      const res = await fetch("/api/leads/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newRuleName.trim(),
          criteria_type: newCriteriaType,
          operator: "contains",
          match_value: newMatchValue.trim(),
          assign_to_user_id: newAssigneeId,
          priority: 1,
          followup_template_name: newTemplate,
          ai_auto_chat_enabled: newAiChatEnabled,
          ai_campaign_prompt: newAiPrompt.trim() || null,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create rule");
      toast.success("Campaign AI Agent created successfully!");
      setIsNewModalOpen(false);
      setNewRuleName("");
      setNewMatchValue("");
      setNewAiPrompt("");
      fetchCampaignData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to create");
    } finally {
      setCreating(false);
    }
  };

  const startSimulator = (rule: CampaignRule) => {
    setSimulatingRule(rule);
    const counselorName = rule.agent?.full_name || "Admissions Counselor";
    const template = TEMPLATE_PREVIEWS[rule.followup_template_name || "education_admissions_welcome"];
    const initialGreeting = template
      ? template.text.replace(/\{\{Student Name\}\}/g, testStudentName)
      : `Hello ${testStudentName}! Thank you for your inquiry. How can I help you today?`;

    setChatMessages([
      {
        role: "assistant",
        content: `[WhatsApp Auto Follow-up Template Sent]\n${initialGreeting}`,
      },
    ]);
    setStudentInput("What is the fee for MBA and what scholarships are offered?");
  };

  const handleSendTestMessage = async () => {
    if (!studentInput.trim() || !simulatingRule) return;

    const userText = studentInput.trim();
    const updatedMessages = [...chatMessages, { role: "user" as const, content: userText }];
    setChatMessages(updatedMessages);
    setStudentInput("");
    setSendingTest(true);

    try {
      const res = await fetch("/api/ai/playground", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: updatedMessages.filter((m) => !m.content.startsWith("[WhatsApp Auto Follow-up")),
          campaignPrompt: simulatingRule.ai_campaign_prompt || "",
          studentContext: {
            name: testStudentName,
            course: testCourse,
            college: testCollege,
            campaignName: simulatingRule.match_value,
            counselorName: simulatingRule.agent?.full_name || "Admissions Counselor",
          },
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to generate reply");

      setChatMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: data.reply || "I am here to guide you through your admissions journey!",
        },
      ]);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Simulator failed");
      setChatMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Sorry, I encountered an issue generating the reply. Check your AI configuration or rate limit.",
        },
      ]);
    } finally {
      setSendingTest(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-xl border border-purple-500/20 bg-gradient-to-r from-purple-500/10 via-indigo-500/5 to-transparent">
        <div className="flex items-start gap-3.5">
          <div className="h-10 w-10 rounded-lg bg-purple-500/20 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-foreground">Campaign AI Agents & Auto Follow-up</h2>
            <p className="text-xs text-muted-foreground mt-0.5 max-w-2xl">
              When student leads arrive from specific Meta ad campaigns (e.g. <b>Mamata MBA</b>), automatically dispatch WhatsApp welcome templates and let the Gemini AI Agent conduct instant two-way admission conversations on behalf of the designated counselor.
            </p>
          </div>
        </div>

        <Button
          onClick={() => setIsNewModalOpen(true)}
          size="sm"
          className="gap-2 shrink-0 bg-purple-600 hover:bg-purple-700 text-white cursor-pointer"
        >
          <Plus className="h-4 w-4" />
          New Campaign Agent
        </Button>
      </div>

      {/* Rules & Campaign Cards */}
      {loading ? (
        <div className="py-16 flex flex-col items-center justify-center text-muted-foreground gap-2">
          <RefreshCw className="h-6 w-6 animate-spin text-primary" />
          <p className="text-sm">Loading campaign AI agents...</p>
        </div>
      ) : rules.length === 0 ? (
        <Card className="border-border">
          <CardContent className="py-12 flex flex-col items-center justify-center text-center p-6 gap-3">
            <div className="h-12 w-12 rounded-full bg-purple-500/10 flex items-center justify-center text-purple-600">
              <Megaphone className="h-6 w-6" />
            </div>
            <h3 className="font-semibold text-base">No Campaign AI Agents Configured</h3>
            <p className="text-xs text-muted-foreground max-w-md">
              Create a campaign routing rule to pair incoming ad leads with an automated WhatsApp template and Gemini AI chat.
            </p>
            <Button onClick={() => setIsNewModalOpen(true)} size="sm" className="gap-2 mt-2">
              <Plus className="h-4 w-4" />
              Create First Campaign Agent
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-5">
          {rules.map((rule) => {
            const isEditing = editingRuleId === rule.id;
            const currentPrompt = rule.ai_campaign_prompt || "";
            const counselorName = rule.agent?.full_name || "Assigned Counselor";
            const templateKey = rule.followup_template_name || "education_admissions_welcome";
            const templateInfo = TEMPLATE_PREVIEWS[templateKey] || TEMPLATE_PREVIEWS.education_admissions_welcome;

            return (
              <Card
                key={rule.id}
                className={cn(
                  "border-border shadow-xs transition-all",
                  rule.ai_auto_chat_enabled ? "border-purple-500/30" : "opacity-90"
                )}
              >
                <CardHeader className="p-4 sm:p-5 border-b border-border bg-muted/20">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0">
                        <Megaphone className="h-4 w-4" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <CardTitle className="text-base font-semibold">{rule.name}</CardTitle>
                          <Badge
                            variant="secondary"
                            className={cn(
                              "text-[10px] px-2 py-0.5",
                              rule.ai_auto_chat_enabled
                                ? "bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20"
                                : "bg-muted text-muted-foreground"
                            )}
                          >
                            {rule.ai_auto_chat_enabled ? "AI Auto-Chat Active" : "AI Auto-Chat Paused"}
                          </Badge>
                        </div>
                        <CardDescription className="text-xs mt-0.5 flex items-center gap-2">
                          <span>Condition:</span>
                          <span className="font-semibold text-foreground capitalize">
                            {rule.criteria_type.replace(/_/g, " ")} {rule.operator}
                          </span>
                          <Badge variant="outline" className="text-xs font-mono py-0">
                            &quot;{rule.match_value}&quot;
                          </Badge>
                        </CardDescription>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      {/* Counselor Pill */}
                      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border bg-card text-xs">
                        <Avatar className="h-5 w-5">
                          <AvatarFallback className="text-[10px] bg-blue-500/10 text-blue-600">
                            {counselorName.slice(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <span className="text-[10px] text-muted-foreground block leading-none">Counselor:</span>
                          <span className="font-medium text-foreground">{counselorName}</span>
                        </div>
                      </div>

                      {/* Test Simulator Button */}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => startSimulator(rule)}
                        className="gap-1.5 text-xs h-8 border-purple-500/30 text-purple-600 dark:text-purple-400 hover:bg-purple-500/10 cursor-pointer"
                      >
                        <Sparkles className="h-3.5 w-3.5 text-purple-500" />
                        Test Simulator
                      </Button>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="p-4 sm:p-5 flex flex-col gap-4">
                  {/* Row 1: Follow-up WhatsApp Template & AI Switch */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Follow-up Template selector */}
                    <div className="p-3.5 rounded-lg border border-border bg-card flex flex-col gap-2">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                          <Send className="h-3.5 w-3.5 text-emerald-600" />
                          Outbound WhatsApp Follow-up Template
                        </label>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-[11px] h-6 px-1.5 text-primary hover:underline gap-1"
                          onClick={() =>
                            setPreviewTemplate({
                              name: templateKey,
                              text: templateInfo.text,
                              label: templateInfo.label,
                            })
                          }
                        >
                          <FileText className="h-3 w-3" />
                          Preview
                        </Button>
                      </div>
                      <select
                        value={templateKey}
                        onChange={(e) => handleChangeTemplate(rule, e.target.value)}
                        className="h-8 px-2.5 rounded-md border border-input bg-background text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                      >
                        <option value="education_admissions_welcome">
                          education_admissions_welcome (Admissions Desk Welcome)
                        </option>
                        <option value="education_scholarship_inquiry">
                          education_scholarship_inquiry (Scholarship Desk Inquiry)
                        </option>
                      </select>
                      <p className="text-[11px] text-muted-foreground">
                        Sent instantly to the student on WhatsApp as soon as their Meta lead is received.
                      </p>
                    </div>

                    {/* AI Auto-Chat Toggle */}
                    <div className="p-3.5 rounded-lg border border-border bg-card flex items-center justify-between gap-3">
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-1.5">
                          <Bot className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                          <span className="text-xs font-semibold text-foreground">Inbound AI Auto-Chat</span>
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                          Automatically answers student questions on WhatsApp regarding course fees, eligibility, and scholarship.
                        </p>
                      </div>
                      <Switch
                        checked={rule.ai_auto_chat_enabled !== false}
                        onCheckedChange={(checked) => handleToggleAiChat(rule, checked)}
                      />
                    </div>
                  </div>

                  {/* Row 2: Campaign-Specific AI Instructions / Guidance */}
                  <div className="p-3.5 rounded-lg border border-border bg-muted/20 flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                        <Sparkles className="h-3.5 w-3.5 text-purple-500" />
                        Campaign AI Guidance & Instructions (Prompt Context)
                      </label>
                      {!isEditing && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setEditingRuleId(rule.id);
                            setEditingPrompt(rule.ai_campaign_prompt || "");
                          }}
                          className="h-6 text-[11px] text-primary"
                        >
                          Edit Guidance
                        </Button>
                      )}
                    </div>

                    {isEditing ? (
                      <div className="flex flex-col gap-2">
                        <Textarea
                          value={editingPrompt}
                          onChange={(e) => setEditingPrompt(e.target.value)}
                          placeholder="e.g. You are Senior Admission Assistant for Mamata MBA Campaign. Mention merit scholarships up to 30%, NAAC A+ accredited partner universities, top specializations: Marketing, Finance, HR, Business Analytics. Direct them to Senior Counselor Mamata..."
                          rows={4}
                          className="text-xs font-sans"
                        />
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => setEditingRuleId(null)}
                            disabled={savingPrompt}
                          >
                            Cancel
                          </Button>
                          <Button
                            size="sm"
                            className="h-7 text-xs bg-purple-600 hover:bg-purple-700 text-white"
                            onClick={() => handleSavePrompt(rule.id)}
                            disabled={savingPrompt}
                          >
                            {savingPrompt ? "Saving..." : "Save Guidance"}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="text-xs text-muted-foreground bg-card p-2.5 rounded border border-border whitespace-pre-wrap">
                        {currentPrompt ? (
                          currentPrompt
                        ) : (
                          <span className="italic text-muted-foreground/80">
                            Using default education counseling guidelines. Click &ldquo;Edit Guidance&rdquo; to customize fees, scholarships, or special instructions for this campaign.
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Template Preview Dialog */}
      <Dialog open={Boolean(previewTemplate)} onOpenChange={(open) => !open && setPreviewTemplate(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-emerald-600" />
              WhatsApp Template Preview
            </DialogTitle>
            <DialogDescription className="font-mono text-xs">
              {previewTemplate?.name}
            </DialogDescription>
          </DialogHeader>

          <div className="p-4 rounded-lg bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-500/20 text-xs text-foreground whitespace-pre-wrap leading-relaxed">
            {previewTemplate?.text}
          </div>

          <DialogFooter>
            <Button size="sm" onClick={() => setPreviewTemplate(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create New Campaign Agent Modal */}
      <Dialog open={isNewModalOpen} onOpenChange={setIsNewModalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5 text-purple-600" />
              New Campaign AI Agent
            </DialogTitle>
            <DialogDescription>
              Link a Meta ad campaign with automated WhatsApp follow-up and Gemini AI auto-reply.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-3 py-2 max-h-[70vh] overflow-y-auto">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium">Agent / Campaign Name</label>
              <Input
                placeholder="e.g. Mamata MBA Campaign Agent"
                value={newRuleName}
                onChange={(e) => setNewRuleName(e.target.value)}
                className="h-9 text-xs"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium">Filter By</label>
                <select
                  value={newCriteriaType}
                  onChange={(e) => setNewCriteriaType(e.target.value as any)}
                  className="h-9 px-3 rounded-md border border-input bg-background text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <option value="campaign_name">Campaign Name</option>
                  <option value="form_name">Form Name</option>
                  <option value="college">College Name</option>
                  <option value="course">Course Name</option>
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium">Match Keyword</label>
                <Input
                  placeholder="e.g. Mamata MBA"
                  value={newMatchValue}
                  onChange={(e) => setNewMatchValue(e.target.value)}
                  className="h-9 text-xs"
                />
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium">Assigned Senior Counselor</label>
              <select
                value={newAssigneeId}
                onChange={(e) => setNewAssigneeId(e.target.value)}
                className="h-9 px-3 rounded-md border border-input bg-background text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="">Select Counselor...</option>
                {agents.map((a) => (
                  <option key={a.userId} value={a.userId}>
                    {a.fullName} ({a.role})
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium">Instant WhatsApp Welcome Template</label>
              <select
                value={newTemplate}
                onChange={(e) => setNewTemplate(e.target.value)}
                className="h-9 px-3 rounded-md border border-input bg-background text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="education_admissions_welcome">
                  education_admissions_welcome (Admissions Desk Welcome)
                </option>
                <option value="education_scholarship_inquiry">
                  education_scholarship_inquiry (Scholarship Desk Inquiry)
                </option>
              </select>
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg border border-border bg-card">
              <div>
                <span className="text-xs font-medium text-foreground block">Enable Inbound AI Auto-Chat</span>
                <span className="text-[11px] text-muted-foreground">
                  AI will chat with students when they reply to the WhatsApp message.
                </span>
              </div>
              <Switch checked={newAiChatEnabled} onCheckedChange={setNewAiChatEnabled} />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium">Campaign AI Guidance (Optional)</label>
              <Textarea
                placeholder="Specific guidance for Gemini AI: course fees, scholarship %, admission deadlines, counselor contact info..."
                value={newAiPrompt}
                onChange={(e) => setNewAiPrompt(e.target.value)}
                rows={3}
                className="text-xs"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setIsNewModalOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleCreateRule} disabled={creating} className="bg-purple-600 hover:bg-purple-700 text-white">
              {creating ? "Creating..." : "Create Campaign Agent"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Test Simulator Dialog */}
      <Dialog open={Boolean(simulatingRule)} onOpenChange={(open) => !open && setSimulatingRule(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-purple-600" />
              Campaign AI Chat Simulator
            </DialogTitle>
            <DialogDescription>
              Test how the Gemini AI Agent will automatically respond to students who submit leads for{" "}
              <b>{simulatingRule?.name}</b>.
            </DialogDescription>
          </DialogHeader>

          {/* Context bar */}
          <div className="grid grid-cols-3 gap-2 p-2.5 rounded-lg bg-muted/40 text-xs border border-border">
            <div>
              <span className="text-muted-foreground block text-[10px]">Simulated Student:</span>
              <Input
                value={testStudentName}
                onChange={(e) => setTestStudentName(e.target.value)}
                className="h-7 text-xs bg-card mt-0.5"
              />
            </div>
            <div>
              <span className="text-muted-foreground block text-[10px]">Interested Course:</span>
              <Input
                value={testCourse}
                onChange={(e) => setTestCourse(e.target.value)}
                className="h-7 text-xs bg-card mt-0.5"
              />
            </div>
            <div>
              <span className="text-muted-foreground block text-[10px]">Assigned Counselor:</span>
              <span className="font-semibold text-foreground block mt-1.5 truncate">
                {simulatingRule?.agent?.full_name || "Admissions Team"}
              </span>
            </div>
          </div>

          {/* Transcript box */}
          <div className="flex-1 min-h-[260px] max-h-[360px] overflow-y-auto p-3 rounded-lg border border-border bg-muted/10 flex flex-col gap-3">
            {chatMessages.map((msg, idx) => (
              <div
                key={idx}
                className={cn(
                  "flex flex-col max-w-[85%] rounded-lg p-3 text-xs leading-relaxed",
                  msg.role === "user"
                    ? "self-end bg-purple-600 text-white"
                    : msg.content.startsWith("[WhatsApp Auto Follow-up")
                    ? "self-start bg-emerald-500/10 text-emerald-800 dark:text-emerald-200 border border-emerald-500/30"
                    : "self-start bg-card text-foreground border border-border shadow-2xs"
                )}
              >
                <span className="text-[10px] font-semibold opacity-75 mb-1">
                  {msg.role === "user" ? testStudentName : msg.content.startsWith("[WhatsApp Auto Follow-up") ? "WhatsApp Template Sent" : "Gemini AI Agent"}
                </span>
                <p className="whitespace-pre-wrap">{msg.content}</p>
              </div>
            ))}
            {sendingTest && (
              <div className="self-start bg-card border border-border rounded-lg p-2.5 text-xs flex items-center gap-2 text-muted-foreground">
                <RefreshCw className="h-3.5 w-3.5 animate-spin text-purple-600" />
                Gemini AI Agent is formulating a personalized counseling response...
              </div>
            )}
          </div>

          {/* Input box */}
          <div className="flex items-center gap-2 mt-2">
            <Input
              placeholder="Ask a question as the student (e.g. What is the fee structure and scholarship?)"
              value={studentInput}
              onChange={(e) => setStudentInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSendTestMessage()}
              className="text-xs h-9"
              disabled={sendingTest}
            />
            <Button
              size="sm"
              onClick={handleSendTestMessage}
              disabled={sendingTest || !studentInput.trim()}
              className="h-9 px-3 bg-purple-600 hover:bg-purple-700 text-white cursor-pointer"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>

          <DialogFooter className="mt-2">
            <Button variant="outline" size="sm" onClick={() => setSimulatingRule(null)}>
              Close Simulator
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
