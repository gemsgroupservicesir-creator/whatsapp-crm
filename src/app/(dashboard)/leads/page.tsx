"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  UserCheck,
  Search,
  Filter,
  RefreshCw,
  MessageSquare,
  Sparkles,
  School,
  GraduationCap,
  MapPin,
  Clock,
  User,
  Plus,
  Trash2,
  ExternalLink,
  Phone,
  Mail,
  SlidersHorizontal,
  ChevronRight,
  HelpCircle,
  FileText,
  CheckCircle2,
  AlertCircle,
  Settings,
  Share2,
  Megaphone,
  Send,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

interface Agent {
  userId: string;
  fullName: string;
  email: string | null;
  role: string;
}

interface Lead {
  id: string;
  account_id: string;
  leadgen_id: string | null;
  form_id: string | null;
  form_name: string | null;
  campaign_name: string | null;
  ad_name: string | null;
  full_name: string;
  phone: string;
  email: string | null;
  college: string | null;
  course: string | null;
  city: string | null;
  status: string;
  lead_status: "new" | "contacted" | "interested" | "in_progress" | "enrolled" | "lost";
  notes: string | null;
  assigned_to: string | null;
  assigned_at: string | null;
  assigned_agent: Agent | null;
  contact_id: string | null;
  conversation_id: string | null;
  whatsapp_sent: boolean;
  raw_data: Record<string, unknown> | null;
  created_at: string;
}

interface AssignmentRule {
  id: string;
  account_id: string;
  name: string;
  is_active: boolean;
  priority: number;
  criteria_type: "college" | "course" | "form_name" | "campaign_name" | "any";
  operator: "contains" | "equals" | "starts_with" | "ends_with";
  match_value: string;
  assign_to_user_id: string;
  followup_template_name?: string;
  ai_auto_chat_enabled?: boolean;
  ai_campaign_prompt?: string | null;
  created_at: string;
  agent?: Agent | null;
}

const STATUS_CONFIG: Record<
  string,
  { label: string; bg: string; text: string; border: string }
> = {
  new: { label: "New Lead", bg: "bg-blue-500/10", text: "text-blue-500", border: "border-blue-500/20" },
  contacted: { label: "Contacted", bg: "bg-amber-500/10", text: "text-amber-500", border: "border-amber-500/20" },
  interested: { label: "Interested", bg: "bg-purple-500/10", text: "text-purple-500", border: "border-purple-500/20" },
  in_progress: { label: "In Counseling", bg: "bg-indigo-500/10", text: "text-indigo-500", border: "border-indigo-500/20" },
  enrolled: { label: "Enrolled", bg: "bg-emerald-500/10", text: "text-emerald-500", border: "border-emerald-500/20" },
  lost: { label: "Lost / Closed", bg: "bg-muted", text: "text-muted-foreground", border: "border-border" },
};

export default function LeadsPage() {
  const [activeTab, setActiveTab] = useState<"all" | "my" | "unassigned" | "rules">("all");
  const [leads, setLeads] = useState<Lead[]>([]);
  const [stats, setStats] = useState({ total: 0, myLeads: 0, unassigned: 0, converted: 0 });
  const [agents, setAgents] = useState<Agent[]>([]);
  const [colleges, setColleges] = useState<string[]>([]);
  const [courses, setCourses] = useState<string[]>([]);
  const [forms, setForms] = useState<string[]>([]);
  const [campaigns, setCampaigns] = useState<string[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const [userRole, setUserRole] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const initialTabSetRef = useRef(false);

  // Filters
  const [search, setSearch] = useState("");
  const [filterCollege, setFilterCollege] = useState("all");
  const [filterCourse, setFilterCourse] = useState("all");
  const [filterCampaign, setFilterCampaign] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterAgent, setFilterAgent] = useState("all");

  // Lead details & notes modal
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [isNotesOpen, setIsNotesOpen] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);

  // Delete lead state
  const [leadToDelete, setLeadToDelete] = useState<Lead | null>(null);
  const [deletingLead, setDeletingLead] = useState(false);

  // Assignment Rules state
  const [rules, setRules] = useState<AssignmentRule[]>([]);
  const [loadingRules, setLoadingRules] = useState(false);
  const [applyingRules, setApplyingRules] = useState(false);
  const [isNewRuleOpen, setIsNewRuleOpen] = useState(false);
  const [ruleName, setRuleName] = useState("");
  const [criteriaType, setCriteriaType] = useState<"college" | "course" | "form_name" | "campaign_name" | "any">("college");
  const [operator, setOperator] = useState<"contains" | "equals" | "starts_with" | "ends_with">("contains");
  const [matchValue, setMatchValue] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [rulePriority, setRulePriority] = useState(1);
  const [ruleFollowupTemplate, setRuleFollowupTemplate] = useState("education_admissions_welcome");
  const [ruleAiChatEnabled, setRuleAiChatEnabled] = useState(true);
  const [ruleAiCampaignPrompt, setRuleAiCampaignPrompt] = useState("");
  const [savingRule, setSavingRule] = useState(false);

  // Test Simulator state
  const [simulating, setSimulating] = useState(false);

  const handleApplyRules = async () => {
    try {
      setApplyingRules(true);
      const res = await fetch("/api/leads/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "apply" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to run auto-assignment");
      toast.success(data.message || `Auto-assignment completed! Assigned ${data.assignedCount ?? 0} leads.`);
      fetchLeads();
      if (activeTab === "rules") fetchRules();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to run auto-assignment");
    } finally {
      setApplyingRules(false);
    }
  };

  const fetchLeads = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (activeTab === "my") params.set("tab", "my");
      if (activeTab === "unassigned") params.set("tab", "unassigned");
      if (filterStatus !== "all") params.set("status", filterStatus);
      if (filterCollege !== "all") params.set("college", filterCollege);
      if (filterCourse !== "all") params.set("course", filterCourse);
      if (filterCampaign !== "all") params.set("campaign", filterCampaign);
      if (filterAgent !== "all") params.set("agentId", filterAgent);
      if (search) params.set("search", search);

      const res = await fetch(`/api/leads?${params.toString()}`, { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to load leads");
      const data = await res.json();

      setLeads(data.leads || []);
      setStats(data.stats || { total: 0, myLeads: 0, unassigned: 0, converted: 0 });
      setAgents(data.agents || []);
      setColleges(data.colleges || []);
      setCourses(data.courses || []);
      setForms(data.forms || []);
      setCampaigns(data.campaigns || []);
      setCurrentUserId(data.currentUserId || "");
      setUserRole(data.userRole || "");

      // Enforce agents strictly to "my" leads tab
      if (data.userRole === "agent" && activeTab !== "my") {
        initialTabSetRef.current = true;
        setActiveTab("my");
      }
    } catch (err) {
      console.error(err);
      toast.error("Failed to fetch leads");
    } finally {
      setLoading(false);
    }
  }, [activeTab, filterStatus, filterCollege, filterCourse, filterCampaign, filterAgent, search]);

  const fetchRules = async () => {
    try {
      setLoadingRules(true);
      const res = await fetch("/api/leads/rules", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to load assignment rules");
      const data = await res.json();
      setRules(data.rules || []);
    } catch (err) {
      console.error(err);
      toast.error("Failed to load rules");
    } finally {
      setLoadingRules(false);
    }
  };

  useEffect(() => {
    if (activeTab === "rules") {
      fetchRules();
    } else {
      fetchLeads();
    }
  }, [fetchLeads, activeTab]);

  // Handle lead status change
  const handleStatusChange = async (leadId: string, newStatus: string) => {
    try {
      const res = await fetch("/api/leads", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: leadId, lead_status: newStatus }),
      });
      if (!res.ok) throw new Error("Failed to update status");
      toast.success("Lead status updated");
      setLeads((prev) =>
        prev.map((l) => (l.id === leadId ? { ...l, lead_status: newStatus as any } : l))
      );
    } catch {
      toast.error("Could not update status");
    }
  };

  // Handle lead agent assignment
  const handleAssignAgent = async (leadId: string, newAgentId: string | null) => {
    try {
      const res = await fetch("/api/leads", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: leadId, assigned_to: newAgentId }),
      });
      if (!res.ok) throw new Error("Failed to assign agent");
      const assignedAgent = agents.find((a) => a.userId === newAgentId) || null;
      toast.success(assignedAgent ? `Assigned to ${assignedAgent.fullName}` : "Lead unassigned");
      setLeads((prev) =>
        prev.map((l) =>
          l.id === leadId
            ? { ...l, assigned_to: newAgentId, assigned_agent: assignedAgent }
            : l
        )
      );
      // Refresh stats
      fetchLeads();
    } catch {
      toast.error("Could not assign lead");
    }
  };

  const [retryingId, setRetryingId] = useState<string | null>(null);

  // Retry fetching lead details from Meta Graph API
  const handleRetryFetch = async (leadId: string) => {
    try {
      setRetryingId(leadId);
      const res = await fetch("/api/leads", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: leadId, action: "retry_fetch" }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to fetch lead details");
      }
      toast.success("Lead details fetched from Meta successfully!");
      fetchLeads();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to fetch lead");
    } finally {
      setRetryingId(null);
    }
  };

  // Delete a lead
  const handleDeleteLead = async (leadId: string) => {
    try {
      setDeletingLead(true);
      const res = await fetch(`/api/leads?id=${leadId}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to delete lead");
      }
      toast.success("Lead deleted successfully");
      setLeadToDelete(null);
      fetchLeads();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to delete lead");
    } finally {
      setDeletingLead(false);
    }
  };

  // Save notes
  const handleSaveNotes = async () => {
    if (!selectedLead) return;
    try {
      setSavingNotes(true);
      const res = await fetch("/api/leads", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: selectedLead.id, notes: noteText }),
      });
      if (!res.ok) throw new Error("Failed to save remarks");
      toast.success("Remarks saved successfully");
      setLeads((prev) =>
        prev.map((l) => (l.id === selectedLead.id ? { ...l, notes: noteText } : l))
      );
      setIsNotesOpen(false);
    } catch {
      toast.error("Failed to save remarks");
    } finally {
      setSavingNotes(false);
    }
  };

  // Create Assignment Rule
  const handleCreateRule = async () => {
    if (!ruleName.trim() || !matchValue.trim() || !assigneeId) {
      toast.error("Please fill in Rule Name, Match Value, and Select an Agent");
      return;
    }
    try {
      setSavingRule(true);
      const res = await fetch("/api/leads/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: ruleName.trim(),
          criteria_type: criteriaType,
          operator,
          match_value: matchValue.trim(),
          assign_to_user_id: assigneeId,
          priority: Number(rulePriority) || 1,
          followup_template_name: ruleFollowupTemplate,
          ai_auto_chat_enabled: ruleAiChatEnabled,
          ai_campaign_prompt: ruleAiCampaignPrompt.trim() || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error || "Failed to create rule");
      }
      toast.success("Lead assignment rule created!");
      setIsNewRuleOpen(false);
      setRuleName("");
      setMatchValue("");
      setRuleAiCampaignPrompt("");
      fetchRules();
    } catch (err: any) {
      toast.error(err.message || "Could not save rule");
    } finally {
      setSavingRule(false);
    }
  };

  // Toggle Rule Status
  const handleToggleRule = async (ruleId: string, currentActive: boolean) => {
    try {
      const res = await fetch("/api/leads/rules", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: ruleId, is_active: !currentActive }),
      });
      if (!res.ok) throw new Error("Failed to update rule");
      setRules((prev) =>
        prev.map((r) => (r.id === ruleId ? { ...r, is_active: !currentActive } : r))
      );
      toast.success(!currentActive ? "Rule activated" : "Rule paused");
    } catch {
      toast.error("Could not update rule");
    }
  };

  // Delete Rule
  const handleDeleteRule = async (ruleId: string) => {
    if (!confirm("Are you sure you want to delete this assignment rule?")) return;
    try {
      const res = await fetch(`/api/leads/rules?id=${ruleId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete rule");
      toast.success("Rule deleted");
      setRules((prev) => prev.filter((r) => r.id !== ruleId));
    } catch {
      toast.error("Could not delete rule");
    }
  };

  // Simulate Lead
  const handleSimulateLead = async () => {
    try {
      setSimulating(true);
      const res = await fetch("/api/account/leads/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: "Aarav Sharma",
          phone: "+919876543210",
          email: "aarav.sharma@example.com",
          college: "Amity University",
          course: "B.Tech Computer Science",
          formName: "GEMS_MBA_NEPAL_2027_HIGH_INTENT",
          campaignName: "Mamata MBA",
          adName: "ad1",
        }),
      });
      if (!res.ok) throw new Error("Simulation failed");
      toast.success("Simulated lead captured & processed!");
      fetchLeads();
    } catch {
      toast.error("Simulation error");
    } finally {
      setSimulating(false);
    }
  };

  const isAdminOrOwner = userRole === "owner" || userRole === "admin";

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6 max-w-7xl mx-auto w-full">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">Leads & Meta Ad Forms</h1>
            <Badge variant="outline" className="border-primary/30 text-primary bg-primary/5">
              Live
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Capture, track, and automatically assign Facebook & Instagram Instant Form leads to counselors.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchLeads}
            disabled={loading}
            className="h-9 gap-1.5"
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            Refresh
          </Button>

          {isAdminOrOwner && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={handleApplyRules}
                disabled={applyingRules}
                className="h-9 gap-1.5 border-emerald-500/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10 cursor-pointer"
                title="Run active auto-assignment rules on all unassigned leads"
              >
                <SlidersHorizontal className={cn("h-4 w-4 text-emerald-500", applyingRules && "animate-spin")} />
                Run Auto-Assignment
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={handleSimulateLead}
                disabled={simulating}
                className="h-9 gap-1.5 border-purple-500/30 text-purple-600 dark:text-purple-400 hover:bg-purple-500/10"
              >
                <Sparkles className={cn("h-4 w-4 text-purple-500", simulating && "animate-spin")} />
                Test Lead Simulator
              </Button>

              <Link href="/settings?tab=leads">
                <Button size="sm" className="h-9 gap-1.5 bg-primary text-primary-foreground">
                  <Share2 className="h-4 w-4" />
                  Meta Webhook Settings
                </Button>
              </Link>
            </>
          )}
        </div>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        {isAdminOrOwner ? (
          <>
            <Card className="bg-card border-border shadow-xs">
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Total Leads</p>
                  <h3 className="text-2xl font-bold mt-1">{stats.total}</h3>
                </div>
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                  <UserCheck className="h-5 w-5" />
                </div>
              </CardContent>
            </Card>

            <Card className="bg-card border-border shadow-xs border-blue-500/20 bg-blue-500/5">
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-blue-600 dark:text-blue-400 uppercase tracking-wider">My Leads</p>
                  <h3 className="text-2xl font-bold mt-1 text-blue-600 dark:text-blue-400">{stats.myLeads}</h3>
                </div>
                <div className="h-10 w-10 rounded-lg bg-blue-500/20 flex items-center justify-center text-blue-500">
                  <User className="h-5 w-5" />
                </div>
              </CardContent>
            </Card>

            <Card className="bg-card border-border shadow-xs">
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Unassigned</p>
                  <h3 className="text-2xl font-bold mt-1 text-amber-500">{stats.unassigned}</h3>
                </div>
                <div className="h-10 w-10 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-500">
                  <AlertCircle className="h-5 w-5" />
                </div>
              </CardContent>
            </Card>

            <Card className="bg-card border-border shadow-xs">
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Enrolled / Won</p>
                  <h3 className="text-2xl font-bold mt-1 text-emerald-500">{stats.converted}</h3>
                </div>
                <div className="h-10 w-10 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-500">
                  <CheckCircle2 className="h-5 w-5" />
                </div>
              </CardContent>
            </Card>
          </>
        ) : (
          <>
            <Card className="bg-card border-border shadow-xs border-blue-500/20 bg-blue-500/5">
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-blue-600 dark:text-blue-400 uppercase tracking-wider">My Assigned Leads</p>
                  <h3 className="text-2xl font-bold mt-1 text-blue-600 dark:text-blue-400">{stats.myLeads}</h3>
                </div>
                <div className="h-10 w-10 rounded-lg bg-blue-500/20 flex items-center justify-center text-blue-500">
                  <User className="h-5 w-5" />
                </div>
              </CardContent>
            </Card>

            <Card className="bg-card border-border shadow-xs">
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">New Inquiries</p>
                  <h3 className="text-2xl font-bold mt-1 text-blue-500">
                    {leads.filter((l) => l.lead_status === "new").length}
                  </h3>
                </div>
                <div className="h-10 w-10 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-500">
                  <Clock className="h-5 w-5" />
                </div>
              </CardContent>
            </Card>

            <Card className="bg-card border-border shadow-xs">
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">In Counseling</p>
                  <h3 className="text-2xl font-bold mt-1 text-indigo-500">
                    {leads.filter((l) => ["contacted", "interested", "in_progress"].includes(l.lead_status)).length}
                  </h3>
                </div>
                <div className="h-10 w-10 rounded-lg bg-indigo-500/10 flex items-center justify-center text-indigo-500">
                  <GraduationCap className="h-5 w-5" />
                </div>
              </CardContent>
            </Card>

            <Card className="bg-card border-border shadow-xs">
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Enrolled / Won</p>
                  <h3 className="text-2xl font-bold mt-1 text-emerald-500">{stats.converted}</h3>
                </div>
                <div className="h-10 w-10 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-500">
                  <CheckCircle2 className="h-5 w-5" />
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Alert banner if Meta lead webhook arrived but needs valid token */}
      {leads.some((l) => l.status === "token_required") && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
            <div className="text-xs">
              <p className="font-semibold text-foreground">
                Meta Lead Webhook Arrived! Reconnect Token to Reveal Student Details
              </p>
              <p className="text-muted-foreground mt-0.5">
                Meta successfully delivered your test lead via webhook. However, Meta Graph API returned:{" "}
                <span className="font-mono text-[11px] text-amber-700 dark:text-amber-300">
                  &ldquo;Error validating access token: The session is invalid because the user logged out (Code 190)&rdquo;
                </span>. Update your Token in{" "}
                <Link href="/settings" className="underline font-semibold text-amber-600 dark:text-amber-400">
                  Settings → WhatsApp / Meta Leads
                </Link>{" "}
                and click &ldquo;Retry Fetch&rdquo; to populate the student&apos;s name, phone, and form answers.
              </p>
            </div>
          </div>
          <Link href="/settings" className="shrink-0">
            <Button size="sm" variant="outline" className="text-xs h-8 gap-1.5 border-amber-500/40 text-amber-600 hover:bg-amber-500/10 w-full sm:w-auto">
              <Settings className="h-3.5 w-3.5" />
              Update Token
            </Button>
          </Link>
        </div>
      )}

      {/* Tabs Navigation */}
      <div className="flex items-center justify-between border-b border-border">
        <div className="flex gap-2">
          {isAdminOrOwner ? (
            <>
              <button
                onClick={() => setActiveTab("all")}
                className={cn(
                  "flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors",
                  activeTab === "all"
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                All Leads
                <Badge variant="secondary" className="text-xs px-1.5 py-0">
                  {stats.total}
                </Badge>
              </button>

              <button
                onClick={() => setActiveTab("my")}
                className={cn(
                  "flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors",
                  activeTab === "my"
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                My Leads
                <Badge variant="secondary" className="text-xs px-1.5 py-0 bg-blue-500/10 text-blue-500 border-none">
                  {stats.myLeads}
                </Badge>
              </button>

              <button
                onClick={() => setActiveTab("unassigned")}
                className={cn(
                  "flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors",
                  activeTab === "unassigned"
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                Unassigned
                <Badge variant="secondary" className="text-xs px-1.5 py-0 bg-amber-500/10 text-amber-500 border-none">
                  {stats.unassigned}
                </Badge>
              </button>

              <button
                onClick={() => setActiveTab("rules")}
                className={cn(
                  "flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors",
                  activeTab === "rules"
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                <SlidersHorizontal className="h-4 w-4" />
                Auto-Assign Rules
              </button>
            </>
          ) : (
            <button
              onClick={() => setActiveTab("my")}
              className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 border-primary text-primary transition-colors"
            >
              <User className="h-4 w-4" />
              My Assigned Leads
              <Badge variant="secondary" className="text-xs px-1.5 py-0 bg-blue-500/10 text-blue-500 border-none">
                {stats.myLeads}
              </Badge>
            </button>
          )}
        </div>
      </div>

      {/* Main Body */}
      {activeTab === "rules" ? (
        /* Auto-Assignment Rules Tab */
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">Auto-Assignment Rules</h2>
              <p className="text-xs text-muted-foreground">
                Automatically route incoming Meta leads to specific agents based on College, Course, Campaign, or Form Name.
              </p>
            </div>
            {isAdminOrOwner && (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleApplyRules}
                  disabled={applyingRules}
                  className="gap-1.5 border-emerald-500/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10 cursor-pointer"
                >
                  <SlidersHorizontal className={cn("h-4 w-4 text-emerald-500", applyingRules && "animate-spin")} />
                  {applyingRules ? "Applying Rules..." : "Apply to Unassigned Leads"}
                </Button>
                <Button onClick={() => setIsNewRuleOpen(true)} size="sm" className="gap-1.5">
                  <Plus className="h-4 w-4" />
                  Add New Rule
                </Button>
              </div>
            )}
          </div>

          <Card className="border-border">
            <CardContent className="p-0">
              {loadingRules ? (
                <div className="py-12 flex flex-col items-center justify-center text-muted-foreground gap-2">
                  <RefreshCw className="h-6 w-6 animate-spin text-primary" />
                  <p className="text-sm">Loading assignment rules...</p>
                </div>
              ) : rules.length === 0 ? (
                <div className="py-12 flex flex-col items-center justify-center text-center p-6 gap-3">
                  <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                    <SlidersHorizontal className="h-6 w-6" />
                  </div>
                  <h3 className="font-semibold text-base">No auto-assignment rules configured yet</h3>
                  <p className="text-xs text-muted-foreground max-w-md">
                    Set up routing rules to automatically assign students to counselors based on the college name, degree/course, or campaign form they submitted.
                  </p>
                  {isAdminOrOwner && (
                    <Button onClick={() => setIsNewRuleOpen(true)} size="sm" className="gap-1.5 mt-2">
                      <Plus className="h-4 w-4" />
                      Create First Rule
                    </Button>
                  )}
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Rule Name</TableHead>
                      <TableHead>Condition</TableHead>
                      <TableHead>Assigned Counselor</TableHead>
                      <TableHead>Follow-up & AI</TableHead>
                      <TableHead>Priority</TableHead>
                      <TableHead>Status</TableHead>
                      {isAdminOrOwner && <TableHead className="text-right">Actions</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rules.map((rule) => (
                      <TableRow key={rule.id}>
                        <TableCell className="font-medium">{rule.name}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5 text-xs">
                            <span className="font-semibold capitalize text-foreground">
                              {rule.criteria_type === "form_name" ? "Form Name" : rule.criteria_type}
                            </span>
                            <span className="text-muted-foreground">{rule.operator}</span>
                            <Badge variant="outline" className="font-mono text-xs">
                              &quot;{rule.match_value}&quot;
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Avatar className="h-6 w-6">
                              <AvatarFallback className="text-[10px] bg-primary/10 text-primary">
                                {rule.agent?.fullName?.slice(0, 2).toUpperCase() || "AG"}
                              </AvatarFallback>
                            </Avatar>
                            <span className="text-sm">{rule.agent?.fullName || "Assigned Agent"}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              <Send className="h-3 w-3 text-emerald-600 shrink-0" />
                              <span className="font-mono text-[11px] truncate max-w-[150px]" title={rule.followup_template_name || "education_admissions_welcome"}>
                                {rule.followup_template_name || "education_admissions_welcome"}
                              </span>
                            </div>
                            <div className="flex items-center gap-1">
                              <Badge
                                variant="secondary"
                                className={cn(
                                  "text-[10px] px-1.5 py-0 flex items-center gap-1 font-normal",
                                  rule.ai_auto_chat_enabled !== false
                                    ? "bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20"
                                    : "bg-muted text-muted-foreground"
                                )}
                              >
                                <Sparkles className="h-2.5 w-2.5" />
                                {rule.ai_auto_chat_enabled !== false ? "AI Auto-Chat Active" : "AI Paused"}
                              </Badge>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="text-xs">
                            Priority #{rule.priority}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={rule.is_active}
                              onCheckedChange={() => handleToggleRule(rule.id, rule.is_active)}
                              disabled={!isAdminOrOwner}
                            />
                            <span className="text-xs text-muted-foreground">
                              {rule.is_active ? "Active" : "Paused"}
                            </span>
                          </div>
                        </TableCell>
                        {isAdminOrOwner && (
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDeleteRule(rule.id)}
                              className="h-8 w-8 text-destructive hover:bg-destructive/10"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      ) : (
        /* Leads Table & Filters */
        <div className="flex flex-col gap-4">
          {/* Filter Bar */}
          <div className="flex flex-col md:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search leads by name, phone, email, college, campaign..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-9"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Campaign Filter */}
              <select
                value={filterCampaign}
                onChange={(e) => setFilterCampaign(e.target.value)}
                className="h-9 px-3 rounded-md border border-input bg-background text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="all">All Campaigns ({campaigns.length})</option>
                {campaigns.map((camp) => (
                  <option key={camp} value={camp}>
                    {camp}
                  </option>
                ))}
              </select>

              {/* College Filter */}
              <select
                value={filterCollege}
                onChange={(e) => setFilterCollege(e.target.value)}
                className="h-9 px-3 rounded-md border border-input bg-background text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="all">All Colleges ({colleges.length})</option>
                {colleges.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>

              {/* Course Filter */}
              <select
                value={filterCourse}
                onChange={(e) => setFilterCourse(e.target.value)}
                className="h-9 px-3 rounded-md border border-input bg-background text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="all">All Courses ({courses.length})</option>
                {courses.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>

              {/* Status Filter */}
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="h-9 px-3 rounded-md border border-input bg-background text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="all">All Statuses</option>
                <option value="new">New Lead</option>
                <option value="contacted">Contacted</option>
                <option value="interested">Interested</option>
                <option value="in_progress">In Counseling</option>
                <option value="enrolled">Enrolled</option>
                <option value="lost">Lost</option>
              </select>

              {/* Agent Filter (only in All Leads) */}
              {activeTab === "all" && (
                <select
                  value={filterAgent}
                  onChange={(e) => setFilterAgent(e.target.value)}
                  className="h-9 px-3 rounded-md border border-input bg-background text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <option value="all">All Counselors ({agents.length})</option>
                  {agents.map((a) => (
                    <option key={a.userId} value={a.userId}>
                      {a.fullName}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>

          {/* Leads Table */}
          <Card className="border-border">
            <CardContent className="p-0">
              {loading ? (
                <div className="py-16 flex flex-col items-center justify-center text-muted-foreground gap-2">
                  <RefreshCw className="h-6 w-6 animate-spin text-primary" />
                  <p className="text-sm">Loading leads...</p>
                </div>
              ) : leads.length === 0 ? (
                <div className="py-16 flex flex-col items-center justify-center text-center p-6 gap-3">
                  <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                    <UserCheck className="h-6 w-6" />
                  </div>
                  <h3 className="font-semibold text-base">No leads found in this view</h3>
                  <p className="text-xs text-muted-foreground max-w-md">
                    {activeTab === "my"
                      ? "You have no leads assigned to you currently. Contact your admin or switch to 'All Leads'."
                      : "When users submit your Facebook or Instagram Lead Ads, their details will automatically show up here."}
                  </p>
                  <Button
                    onClick={handleSimulateLead}
                    variant="outline"
                    size="sm"
                    className="gap-1.5 mt-2 border-purple-500/30 text-purple-600 dark:text-purple-400"
                  >
                    <Sparkles className="h-4 w-4 text-purple-500" />
                    Simulate Test Lead
                  </Button>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Student / Lead</TableHead>
                        <TableHead>Campaign</TableHead>
                        <TableHead>College & Course</TableHead>
                        <TableHead>Meta Form</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Assigned Counselor</TableHead>
                        <TableHead>Received</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {leads.map((lead) => {
                        const statusObj = STATUS_CONFIG[lead.lead_status] || STATUS_CONFIG.new;

                        return (
                          <TableRow key={lead.id} className="hover:bg-muted/50">
                            {/* Contact info */}
                            <TableCell>
                              <div className="flex flex-col gap-0.5">
                                <div className="flex items-center gap-1.5">
                                  <span className="font-semibold text-sm text-foreground">
                                    {lead.status === "token_required" ? "Meta Lead (Pending Token)" : lead.full_name}
                                  </span>
                                  {lead.status === "token_required" && (
                                    <Badge variant="outline" className="text-[10px] px-1 py-0 border-amber-500/50 text-amber-500 bg-amber-500/10">
                                      Token Expired
                                    </Badge>
                                  )}
                                </div>
                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                  {lead.phone === "Pending Token" ? (
                                    <span className="text-[11px] text-amber-600 dark:text-amber-400 font-medium">
                                      Needs Valid Token to reveal phone
                                    </span>
                                  ) : (
                                    <span className="flex items-center gap-1">
                                      <Phone className="h-3 w-3 text-muted-foreground" />
                                      {lead.phone}
                                    </span>
                                  )}
                                  {lead.email && (
                                    <span className="flex items-center gap-1 truncate max-w-[150px]">
                                      <Mail className="h-3 w-3 text-muted-foreground" />
                                      {lead.email}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </TableCell>

                            {/* Campaign */}
                            <TableCell>
                              <div className="flex flex-col gap-0.5 max-w-[200px]">
                                {lead.campaign_name ? (
                                  <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground truncate">
                                    <Megaphone className="h-3.5 w-3.5 text-purple-600 dark:text-purple-400 shrink-0" />
                                    <span className="truncate" title={lead.campaign_name}>
                                      {lead.campaign_name}
                                    </span>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground italic">
                                    <Megaphone className="h-3.5 w-3.5 opacity-40 shrink-0" />
                                    <span>Direct / Organic</span>
                                  </div>
                                )}
                                {lead.ad_name ? (
                                  <span className="text-[11px] text-muted-foreground truncate pl-5" title={lead.ad_name}>
                                    Ad: {lead.ad_name}
                                  </span>
                                ) : (
                                  <Badge variant="outline" className="w-fit text-[10px] px-1 py-0 text-muted-foreground ml-5">
                                    Paid Campaign
                                  </Badge>
                                )}
                              </div>
                            </TableCell>

                            {/* College & Course */}
                            <TableCell>
                              <div className="flex flex-col gap-1 max-w-[200px]">
                                {lead.college ? (
                                  <div className="flex items-center gap-1 text-xs font-medium text-foreground truncate">
                                    <School className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                                    <span className="truncate">{lead.college}</span>
                                  </div>
                                ) : (
                                  <span className="text-xs text-muted-foreground italic">College not specified</span>
                                )}

                                {lead.course ? (
                                  <div className="flex items-center gap-1 text-xs text-muted-foreground truncate">
                                    <GraduationCap className="h-3.5 w-3.5 text-purple-500 shrink-0" />
                                    <span className="truncate">{lead.course}</span>
                                  </div>
                                ) : (
                                  lead.city && (
                                    <div className="flex items-center gap-1 text-xs text-muted-foreground truncate">
                                      <MapPin className="h-3 w-3 shrink-0" />
                                      <span>{lead.city}</span>
                                    </div>
                                  )
                                )}
                              </div>
                            </TableCell>

                            {/* Form Name */}
                            <TableCell>
                              <div className="flex flex-col gap-0.5">
                                <span className="text-xs font-medium truncate max-w-[150px]">
                                  {lead.form_name || "Meta Instant Form"}
                                </span>
                                <Badge variant="outline" className="w-fit text-[10px] px-1 py-0 text-muted-foreground">
                                  Meta Lead Ad
                                </Badge>
                              </div>
                            </TableCell>

                            {/* Status Selector */}
                            <TableCell>
                              <DropdownMenu>
                                <DropdownMenuTrigger
                                  className={cn(
                                    "inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors cursor-pointer",
                                    statusObj.bg,
                                    statusObj.text,
                                    statusObj.border
                                  )}
                                >
                                  <span className="h-1.5 w-1.5 rounded-full bg-current" />
                                  {statusObj.label}
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="start" className="w-44">
                                  <DropdownMenuLabel className="text-xs">Update Status</DropdownMenuLabel>
                                  <DropdownMenuSeparator />
                                  {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
                                    <DropdownMenuItem
                                      key={key}
                                      onClick={() => handleStatusChange(lead.id, key)}
                                      className="text-xs flex items-center justify-between"
                                    >
                                      <span>{cfg.label}</span>
                                      {lead.lead_status === key && <CheckCircle2 className="h-3.5 w-3.5 text-primary" />}
                                    </DropdownMenuItem>
                                  ))}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </TableCell>

                            {/* Counselor Dropdown / Static Badge */}
                            <TableCell>
                              {isAdminOrOwner ? (
                                <DropdownMenu>
                                  <DropdownMenuTrigger className="flex items-center gap-1.5 text-xs text-left hover:bg-muted/80 px-2 py-1 rounded-md border border-input transition-colors cursor-pointer">
                                    <Avatar className="h-5 w-5">
                                      <AvatarFallback className="text-[9px] bg-primary/10 text-primary">
                                        {lead.assigned_agent?.fullName?.slice(0, 2).toUpperCase() || "UN"}
                                      </AvatarFallback>
                                    </Avatar>
                                    <span className="truncate max-w-[100px]">
                                      {lead.assigned_agent?.fullName || "Unassigned"}
                                    </span>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="start" className="w-52">
                                    <DropdownMenuLabel className="text-xs">Assign Counselor</DropdownMenuLabel>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                      onClick={() => handleAssignAgent(lead.id, null)}
                                      className="text-xs text-muted-foreground"
                                    >
                                      Unassigned
                                    </DropdownMenuItem>
                                    {agents.map((a) => (
                                      <DropdownMenuItem
                                        key={a.userId}
                                        onClick={() => handleAssignAgent(lead.id, a.userId)}
                                        className="text-xs flex items-center justify-between"
                                      >
                                        <span>{a.fullName}</span>
                                        {lead.assigned_to === a.userId && (
                                          <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                                        )}
                                      </DropdownMenuItem>
                                    ))}
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              ) : (
                                <div className="inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-md border border-input/60 bg-muted/40">
                                  <Avatar className="h-5 w-5">
                                    <AvatarFallback className="text-[9px] bg-primary/10 text-primary">
                                      {lead.assigned_agent?.fullName?.slice(0, 2).toUpperCase() || "AG"}
                                    </AvatarFallback>
                                  </Avatar>
                                  <span className="truncate max-w-[100px] font-medium text-foreground">
                                    {lead.assigned_agent?.fullName || "Assigned"}
                                  </span>
                                </div>
                              )}
                            </TableCell>

                            {/* Date */}
                            <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                              {new Date(lead.created_at).toLocaleDateString("en-IN", {
                                month: "short",
                                day: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </TableCell>

                            {/* Actions */}
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                {/* Retry fetch if token was missing or expired */}
                                {lead.status === "token_required" && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleRetryFetch(lead.id)}
                                    disabled={retryingId === lead.id}
                                    className="h-8 gap-1 text-xs px-2.5 border-amber-500/40 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10 cursor-pointer"
                                  >
                                    <RefreshCw className={cn("h-3.5 w-3.5", retryingId === lead.id && "animate-spin")} />
                                    Retry Fetch
                                  </Button>
                                )}

                                {/* Open WhatsApp Conversation */}
                                {lead.conversation_id ? (
                                  <Link href={`/inbox?c=${lead.conversation_id}`}>
                                    <Button
                                      size="sm"
                                      variant="default"
                                      className="h-8 gap-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs px-2.5"
                                    >
                                      <MessageSquare className="h-3.5 w-3.5" />
                                      Chat
                                    </Button>
                                  </Link>
                                ) : (
                                  <Link href={`/inbox`}>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-8 gap-1 text-xs px-2.5"
                                    >
                                      <MessageSquare className="h-3.5 w-3.5" />
                                      Inbox
                                    </Button>
                                  </Link>
                                )}

                                {/* Remarks & Questions */}
                                <DropdownMenu>
                                  <DropdownMenuTrigger
                                    render={
                                      <Button variant="ghost" size="icon" className="h-8 w-8 cursor-pointer">
                                        <SlidersHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
                                      </Button>
                                    }
                                  />
                                  <DropdownMenuContent align="end" className="w-44">
                                    <DropdownMenuItem
                                      onClick={() => {
                                        setSelectedLead(lead);
                                        setIsDetailsOpen(true);
                                      }}
                                      className="text-xs gap-2"
                                    >
                                      <FileText className="h-3.5 w-3.5" />
                                      View Form Answers
                                    </DropdownMenuItem>

                                    <DropdownMenuItem
                                      onClick={() => {
                                        setSelectedLead(lead);
                                        setNoteText(lead.notes || "");
                                        setIsNotesOpen(true);
                                      }}
                                      className="text-xs gap-2"
                                    >
                                      <FileText className="h-3.5 w-3.5" />
                                      Counseling Remarks
                                    </DropdownMenuItem>

                                    {isAdminOrOwner && (
                                      <>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem
                                          onClick={() => setLeadToDelete(lead)}
                                          className="text-xs gap-2 text-destructive focus:bg-destructive/10 focus:text-destructive cursor-pointer"
                                        >
                                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                                          Delete Lead
                                        </DropdownMenuItem>
                                      </>
                                    )}
                                  </DropdownMenuContent>
                                </DropdownMenu>

                                {/* Direct Delete Button (Admins/Owners Only) */}
                                {isAdminOrOwner && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => setLeadToDelete(lead)}
                                    className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 cursor-pointer"
                                    title="Delete Lead"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Form Details Dialog */}
      <Dialog open={isDetailsOpen} onOpenChange={setIsDetailsOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              Meta Instant Form Answers
            </DialogTitle>
            <DialogDescription>
              Questions and answers submitted by {selectedLead?.full_name}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-3 py-2 max-h-[60vh] overflow-y-auto">
            <div className="grid grid-cols-2 gap-2 p-3 rounded-lg bg-muted/40 text-xs">
              <div>
                <span className="text-muted-foreground">Full Name:</span>
                <p className="font-semibold text-foreground">{selectedLead?.full_name}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Phone:</span>
                <p className="font-semibold text-foreground">{selectedLead?.phone}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Campaign:</span>
                <p className="font-semibold text-foreground flex items-center gap-1">
                  <Megaphone className="h-3 w-3 text-purple-500" />
                  {selectedLead?.campaign_name || "—"}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">Ad Name:</span>
                <p className="font-semibold text-foreground">{selectedLead?.ad_name || "—"}</p>
              </div>
              <div>
                <span className="text-muted-foreground">College:</span>
                <p className="font-semibold text-foreground">{selectedLead?.college || "—"}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Course:</span>
                <p className="font-semibold text-foreground">{selectedLead?.course || "—"}</p>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Raw Form Questions & Answers
              </h4>
              {selectedLead?.raw_data && Object.keys(selectedLead.raw_data).length > 0 ? (
                <div className="flex flex-col gap-2">
                  {Object.entries(selectedLead.raw_data).map(([key, val]) => (
                    <div key={key} className="p-2.5 rounded-md border border-border bg-card text-xs">
                      <span className="text-muted-foreground capitalize font-mono text-[11px]">
                        {key.replace(/_/g, " ")}:
                      </span>
                      <p className="font-medium text-foreground mt-0.5">{String(val)}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground italic">No extra questions found.</p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button onClick={() => setIsDetailsOpen(false)} size="sm">
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Counseling Remarks Dialog */}
      <Dialog open={isNotesOpen} onOpenChange={setIsNotesOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Counseling Remarks</DialogTitle>
            <DialogDescription>
              Record notes, call feedback, or next steps for {selectedLead?.full_name}.
            </DialogDescription>
          </DialogHeader>

          <div className="py-2">
            <Textarea
              placeholder="e.g. Student is interested in B.Tech CSE 2026 batch. Follow up on Monday..."
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              rows={4}
              className="text-xs"
            />
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setIsNotesOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleSaveNotes} disabled={savingNotes}>
              {savingNotes ? "Saving..." : "Save Remarks"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Auto-Assign Rule Dialog */}
      <Dialog open={isNewRuleOpen} onOpenChange={setIsNewRuleOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5 text-primary" />
              New Auto-Assignment Rule
            </DialogTitle>
            <DialogDescription>
              Route leads matching this condition automatically to a designated counselor.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-3 py-2">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium">Rule Name</label>
              <Input
                placeholder="e.g. Amity College Leads to Rahul"
                value={ruleName}
                onChange={(e) => setRuleName(e.target.value)}
                className="h-9 text-xs"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium">When Field</label>
                <select
                  value={criteriaType}
                  onChange={(e) => setCriteriaType(e.target.value as any)}
                  className="h-9 px-3 rounded-md border border-input bg-background text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <option value="college">College Name</option>
                  <option value="course">Course Name</option>
                  <option value="campaign_name">Campaign Name</option>
                  <option value="form_name">Form Name</option>
                  <option value="any">Any Field</option>
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium">Operator</label>
                <select
                  value={operator}
                  onChange={(e) => setOperator(e.target.value as any)}
                  className="h-9 px-3 rounded-md border border-input bg-background text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <option value="contains">Contains</option>
                  <option value="equals">Equals</option>
                  <option value="starts_with">Starts With</option>
                  <option value="ends_with">Ends With</option>
                </select>
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium">Match Text (Keywords)</label>
              <Input
                placeholder="e.g. Amity, MBA, B.Tech, or Engineering"
                value={matchValue}
                onChange={(e) => setMatchValue(e.target.value)}
                className="h-9 text-xs"
              />
              <span className="text-[11px] text-muted-foreground">
                Matches case-insensitively when a lead form includes this keyword.
              </span>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium">Assign To Counselor</label>
              <select
                value={assigneeId}
                onChange={(e) => setAssigneeId(e.target.value)}
                className="h-9 px-3 rounded-md border border-input bg-background text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="">Select a team member...</option>
                {agents.map((a) => (
                  <option key={a.userId} value={a.userId}>
                    {a.fullName} ({a.role})
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium">Follow-up WhatsApp Template</label>
              <select
                value={ruleFollowupTemplate}
                onChange={(e) => setRuleFollowupTemplate(e.target.value)}
                className="h-9 px-3 rounded-md border border-input bg-background text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="education_admissions_welcome">
                  education_admissions_welcome (Admissions Desk Welcome)
                </option>
                <option value="education_scholarship_inquiry">
                  education_scholarship_inquiry (Scholarship Desk Inquiry)
                </option>
              </select>
              <span className="text-[11px] text-muted-foreground">
                Sent to the student immediately when their lead is received.
              </span>
            </div>

            <div className="flex items-center justify-between p-2.5 rounded-lg border border-border bg-card">
              <div>
                <span className="text-xs font-medium text-foreground block">Inbound AI Auto-Chat</span>
                <span className="text-[11px] text-muted-foreground">
                  AI automatically answers student questions when they reply on WhatsApp.
                </span>
              </div>
              <Switch checked={ruleAiChatEnabled} onCheckedChange={setRuleAiChatEnabled} />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium">Campaign AI Guidance (Optional)</label>
              <Textarea
                placeholder="Guidance for Gemini AI: e.g. Mention MBA specializations, merit scholarships up to 30%, guide them to counselor..."
                value={ruleAiCampaignPrompt}
                onChange={(e) => setRuleAiCampaignPrompt(e.target.value)}
                rows={3}
                className="text-xs"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium">Priority Order</label>
              <Input
                type="number"
                min={1}
                max={99}
                value={rulePriority}
                onChange={(e) => setRulePriority(Number(e.target.value) || 1)}
                className="h-9 text-xs"
              />
              <span className="text-[11px] text-muted-foreground">
                Lower numbers are evaluated first (e.g. Priority 1 runs before Priority 2).
              </span>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setIsNewRuleOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleCreateRule} disabled={savingRule}>
              {savingRule ? "Creating..." : "Save Rule"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Lead Confirmation Dialog */}
      <Dialog open={Boolean(leadToDelete)} onOpenChange={(open) => !open && setLeadToDelete(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-5 w-5" />
              Delete Lead
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to delete the lead for{" "}
              <span className="font-semibold text-foreground">
                {leadToDelete?.full_name}
              </span>
              {leadToDelete?.phone && leadToDelete.phone !== "Pending Token" ? ` (${leadToDelete.phone})` : ""}? This action cannot be undone and will remove the lead record from your pipeline.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="gap-2 sm:gap-0 mt-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setLeadToDelete(null)}
              disabled={deletingLead}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => leadToDelete && handleDeleteLead(leadToDelete.id)}
              disabled={deletingLead}
              className="gap-1.5"
            >
              {deletingLead ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4" />
                  Delete Lead
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
