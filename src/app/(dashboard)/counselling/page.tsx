"use client";

import { Suspense, useState, useEffect, useCallback, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import {
  GraduationCap,
  Globe,
  BookOpen,
  Sparkles,
  RefreshCw,
  Send,
  Mail,
  MessageSquare,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  BookmarkPlus,
  Trash2,
  ExternalLink,
  Users,
  Search,
  Bot,
  Phone,
  HelpCircle,
  Zap,
  ShieldCheck,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type {
  CounsellingPlaybook,
  CounsellingPointCategory,
  CounsellingAutomationRecipientResult,
} from "@/lib/counselling/engine";

interface LeadOption {
  id: string;
  full_name: string | null;
  phone: string | null;
  email: string | null;
  college: string | null;
  course: string | null;
  city: string | null;
  lead_status: string | null;
}

interface ChannelStatus {
  whatsappPhone: string;
  waLink: string;
  emailConfigured: boolean;
  fromEmail: string | null;
  aiConfigured: boolean;
  aiAutoReplyEnabled: boolean;
}

const CATEGORY_META: Record<
  CounsellingPointCategory,
  { label: string; className: string }
> = {
  highlights: {
    label: "Key Highlight",
    className: "border-primary/40 bg-primary/10 text-primary",
  },
  eligibility: {
    label: "Eligibility",
    className: "border-emerald-500/40 bg-emerald-500/10 text-emerald-400",
  },
  fees_scholarship: {
    label: "Fees & Scholarship",
    className: "border-amber-500/40 bg-amber-500/10 text-amber-400",
  },
  career_outcomes: {
    label: "Career & Placement",
    className: "border-violet-500/40 bg-violet-500/10 text-violet-400",
  },
  admission_process: {
    label: "Admission Steps",
    className: "border-cyan-500/40 bg-cyan-500/10 text-cyan-400",
  },
};

export default function CounsellingPage() {
  return (
    <Suspense fallback={null}>
      <CounsellingPageInner />
    </Suspense>
  );
}

function CounsellingPageInner() {
  const searchParams = useSearchParams();

  // Intake fields
  const [universityName, setUniversityName] = useState("");
  const [courseName, setCourseName] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [additionalNotes, setAdditionalNotes] = useState("");

  // Workspace data
  const [playbooks, setPlaybooks] = useState<CounsellingPlaybook[]>([]);
  const [leads, setLeads] = useState<LeadOption[]>([]);
  const [channels, setChannels] = useState<ChannelStatus | null>(null);
  const [loadingInitial, setLoadingInitial] = useState(true);

  // Generation & Active Kit State
  const [generating, setGenerating] = useState(false);
  const [activeKitId, setActiveKitId] = useState<string | null>(null);
  const [universityOverview, setUniversityOverview] = useState("");
  const [counsellingPoints, setCounsellingPoints] = useState<
    CounsellingPlaybook["counsellingPoints"]
  >([]);
  const [openingPitch, setOpeningPitch] = useState("");
  const [objectionHandlers, setObjectionHandlers] = useState<
    CounsellingPlaybook["objectionHandlers"]
  >([]);
  const [whatsappDraft, setWhatsappDraft] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailHeadline, setEmailHeadline] = useState("");
  const [emailBodyText, setEmailBodyText] = useState("");
  const [emailSummaryPoints, setEmailSummaryPoints] = useState<string[]>([]);
  const [emailHtmlPreview, setEmailHtmlPreview] = useState("");
  const [websiteStatus, setWebsiteStatus] = useState<{
    ok: boolean;
    url?: string;
    title?: string;
    note?: string;
  } | null>(null);
  const [generationSource, setGenerationSource] = useState<"ai" | "fallback" | null>(null);
  const [hasGeneratedKit, setHasGeneratedKit] = useState(false);

  // Automation settings for current kit
  const [autoWhatsappEnabled, setAutoWhatsappEnabled] = useState(true);
  const [autoEmailEnabled, setAutoEmailEnabled] = useState(true);
  const [savingPlaybook, setSavingPlaybook] = useState(false);

  // Lead / Recipient Targeting for immediate automated WhatsApp + Mail send
  const [leadSearch, setLeadSearch] = useState("");
  const [selectedLeadIds, setSelectedLeadIds] = useState<string[]>([]);
  const [customName, setCustomName] = useState("");
  const [customPhone, setCustomPhone] = useState("");
  const [customEmail, setCustomEmail] = useState("");
  const [dispatching, setDispatching] = useState(false);
  const [deliveryResults, setDeliveryResults] = useState<
    CounsellingAutomationRecipientResult[] | null
  >(null);

  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [activeSubTab, setActiveSubTab] = useState("points");

  // Pre-fill from query params if navigated from Intelligence / Leads
  useEffect(() => {
    const qUni = searchParams.get("university");
    const qCourse = searchParams.get("course");
    const qWeb = searchParams.get("website");
    if (qUni) setUniversityName(qUni);
    if (qCourse) setCourseName(qCourse);
    if (qWeb) setWebsiteUrl(qWeb);
  }, [searchParams]);

  const loadWorkspaceData = useCallback(async () => {
    try {
      setLoadingInitial(true);
      const res = await fetch("/api/counselling/generate");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load counselling workspace");
      setPlaybooks(data.playbooks || []);
      setLeads(data.leads || []);
      setChannels(data.channels || null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load counselling workspace");
    } finally {
      setLoadingInitial(false);
    }
  }, []);

  useEffect(() => {
    loadWorkspaceData();
  }, [loadWorkspaceData]);

  const filteredLeads = useMemo(() => {
    const q = leadSearch.trim().toLowerCase();
    if (!q) return leads.slice(0, 40);
    return leads
      .filter(
        (l) =>
          (l.full_name || "").toLowerCase().includes(q) ||
          (l.course || "").toLowerCase().includes(q) ||
          (l.college || "").toLowerCase().includes(q) ||
          (l.phone || "").toLowerCase().includes(q) ||
          (l.email || "").toLowerCase().includes(q)
      )
      .slice(0, 40);
  }, [leads, leadSearch]);

  const handleCopy = (key: string, text: string) => {
    navigator.clipboard?.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1800);
    toast.success("Copied to clipboard");
  };

  const applyPlaybookToWorkbench = (pb: CounsellingPlaybook) => {
    setActiveKitId(pb.id);
    setUniversityName(pb.universityName);
    setCourseName(pb.courseName);
    setWebsiteUrl(pb.websiteUrl);
    setAdditionalNotes(pb.additionalNotes || "");
    setUniversityOverview(pb.universityOverview);
    setCounsellingPoints(pb.counsellingPoints);
    setOpeningPitch(pb.openingPitch);
    setObjectionHandlers(pb.objectionHandlers);
    setWhatsappDraft(pb.whatsappReplyDraft);
    setEmailSubject(pb.emailDraft.subject);
    setEmailHeadline(pb.emailDraft.headline);
    setEmailBodyText(pb.emailDraft.bodyText);
    setEmailSummaryPoints(pb.emailDraft.summaryPoints);
    setEmailHtmlPreview(pb.emailDraft.bodyHtml);
    setAutoWhatsappEnabled(pb.autoWhatsappEnabled);
    setAutoEmailEnabled(pb.autoEmailEnabled);
    setWebsiteStatus({
      ok: pb.websiteSynced,
      url: pb.websiteUrl,
      title: pb.websiteTitle,
      note: pb.websiteNote,
    });
    setHasGeneratedKit(true);
    setDeliveryResults(null);
    toast.success(`Loaded "${pb.universityName} — ${pb.courseName}"`);
  };

  const handleGenerateKit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!universityName.trim() || !courseName.trim()) {
      toast.error("Please enter both University Name and Course Name");
      return;
    }

    try {
      setGenerating(true);
      setDeliveryResults(null);

      // Personalize student name hint if exactly 1 lead is picked
      const selectedSingleLead =
        selectedLeadIds.length === 1
          ? leads.find((l) => l.id === selectedLeadIds[0])
          : null;

      const res = await fetch("/api/counselling/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          universityName: universityName.trim(),
          courseName: courseName.trim(),
          websiteUrl: websiteUrl.trim(),
          studentName: selectedSingleLead?.full_name || customName.trim() || undefined,
          additionalNotes: additionalNotes.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Generation failed");

      const kit = data.kit;
      setActiveKitId(null);
      setUniversityOverview(kit.universityOverview || "");
      setCounsellingPoints(kit.counsellingPoints || []);
      setOpeningPitch(kit.openingPitch || "");
      setObjectionHandlers(kit.objectionHandlers || []);
      setWhatsappDraft(kit.whatsappReplyDraft || "");
      setEmailSubject(kit.emailDraft?.subject || "");
      setEmailHeadline(kit.emailDraft?.headline || "");
      setEmailBodyText(kit.emailDraft?.bodyText || "");
      setEmailSummaryPoints(kit.emailDraft?.summaryPoints || []);
      setEmailHtmlPreview(kit.emailDraft?.bodyHtml || "");
      setWebsiteStatus({
        ok: Boolean(data.scrapeStatus?.ok),
        url: data.scrapeStatus?.url || websiteUrl.trim(),
        title: data.scrapeStatus?.title,
        note: kit.websiteNote,
      });
      setGenerationSource(data.source || "ai");
      setHasGeneratedKit(true);
      setActiveSubTab("points");
      toast.success(
        data.scrapeStatus?.ok
          ? "Website analyzed & AI counselling points ready!"
          : "AI counselling kit generated!"
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to generate counselling kit");
    } finally {
      setGenerating(false);
    }
  };

  const handleSavePlaybook = async () => {
    if (!universityName.trim() || !courseName.trim()) {
      toast.error("University Name and Course Name are required");
      return;
    }

    try {
      setSavingPlaybook(true);
      const res = await fetch("/api/counselling/playbooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: activeKitId || undefined,
          universityName: universityName.trim(),
          courseName: courseName.trim(),
          websiteUrl: websiteUrl.trim(),
          websiteTitle: websiteStatus?.title,
          websiteSynced: websiteStatus?.ok,
          websiteNote: websiteStatus?.note,
          additionalNotes: additionalNotes.trim(),
          universityOverview,
          counsellingPoints,
          openingPitch,
          objectionHandlers,
          whatsappReplyDraft: whatsappDraft,
          emailDraft: {
            subject: emailSubject,
            headline: emailHeadline,
            bodyText: emailBodyText,
            summaryPoints: emailSummaryPoints,
          },
          autoWhatsappEnabled,
          autoEmailEnabled,
          syncToKb: true,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save playbook");

      setActiveKitId(data.playbook.id);
      setPlaybooks(data.playbooks || []);
      setEmailHtmlPreview(data.playbook.emailDraft.bodyHtml);
      toast.success(
        data.kbWarning
          ? `Playbook saved (${data.kbWarning})`
          : "Playbook saved, synced to AI Knowledge Base & automation armed!"
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save playbook");
    } finally {
      setSavingPlaybook(false);
    }
  };

  const handleTogglePlaybookFlag = async (
    pb: CounsellingPlaybook,
    field: "autoWhatsappEnabled" | "autoEmailEnabled",
    value: boolean
  ) => {
    try {
      const res = await fetch("/api/counselling/playbooks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: pb.id,
          [field]: value,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Update failed");
      setPlaybooks(data.playbooks || []);
      if (activeKitId === pb.id) {
        if (field === "autoWhatsappEnabled") setAutoWhatsappEnabled(value);
        if (field === "autoEmailEnabled") setAutoEmailEnabled(value);
      }
      toast.success(
        `${field === "autoWhatsappEnabled" ? "Auto WhatsApp Reply" : "Auto Email"} ${value ? "enabled" : "paused"}`
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to toggle automation");
    }
  };

  const handleDeletePlaybook = async (id: string) => {
    try {
      const res = await fetch(`/api/counselling/playbooks?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Delete failed");
      setPlaybooks(data.playbooks || []);
      if (activeKitId === id) setActiveKitId(null);
      toast.success("Playbook removed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete playbook");
    }
  };

  const handleAutomateSend = async (mode: { whatsapp: boolean; email: boolean }) => {
    if (
      selectedLeadIds.length === 0 &&
      !customPhone.trim() &&
      !customEmail.trim()
    ) {
      toast.error("Select at least one student lead OR enter a recipient phone/email below");
      return;
    }

    try {
      setDispatching(true);
      setDeliveryResults(null);
      const res = await fetch("/api/counselling/automate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          universityName: universityName.trim(),
          courseName: courseName.trim(),
          websiteUrl: websiteUrl.trim(),
          whatsappMessage: whatsappDraft,
          emailSubject,
          emailHeadline,
          emailBodyText,
          emailSummaryPoints,
          sendWhatsApp: mode.whatsapp,
          sendEmail: mode.email,
          leadIds: selectedLeadIds,
          customRecipient:
            customPhone.trim() || customEmail.trim()
              ? {
                  name: customName.trim() || "Student",
                  phone: customPhone.trim(),
                  email: customEmail.trim(),
                }
              : undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Automation dispatch failed");

      setDeliveryResults(data.results || []);
      const parts: string[] = [];
      if (mode.whatsapp) parts.push(`${data.whatsappSuccessCount} WhatsApp sent`);
      if (mode.email) parts.push(`${data.emailSuccessCount} Email sent`);
      toast.success(`Outreach completed: ${parts.join(", ")}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to automate outreach");
    } finally {
      setDispatching(false);
    }
  };

  const toggleLeadSelection = (id: string) => {
    setSelectedLeadIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <GraduationCap className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Agent Counselling
            </h1>
            <Badge variant="outline" className="border-primary/40 bg-primary/10 text-primary">
              AI + Website Powered
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Enter a university, course &amp; official website link to extract verified counselling points and automate WhatsApp replies &amp; emails.
          </p>
        </div>

        {channels && (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Badge variant="secondary" className="gap-1.5">
              <MessageSquare className="h-3.5 w-3.5 text-emerald-400" />
              WA Cloud: {channels.whatsappPhone}
            </Badge>
            <Badge
              variant="secondary"
              className={cn(
                "gap-1.5",
                channels.emailConfigured ? "text-emerald-400" : "text-amber-400"
              )}
            >
              <Mail className="h-3.5 w-3.5" />
              {channels.emailConfigured
                ? `Mail: ${channels.fromEmail}`
                : "Mail: Configure Resend in Settings"}
            </Badge>
          </div>
        )}
      </div>

      {/* Main Split Grid */}
      <div className="grid gap-6 xl:grid-cols-12">
        {/* Left Sidebar: Program Input + Saved Playbooks + Target Leads */}
        <div className="space-y-5 xl:col-span-5">
          {/* University / Course / Website Intake Card */}
          <Card className="border-primary/20">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Sparkles className="h-4 w-4 text-primary" />
                University &amp; Course Analyzer
              </CardTitle>
              <CardDescription className="text-xs">
                AI reads the website link and combines CRM history to build a complete counselling kit.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleGenerateKit} className="space-y-3.5">
                <div className="space-y-1.5">
                  <Label htmlFor="uni-name" className="text-xs font-medium">
                    University / College Name *
                  </Label>
                  <Input
                    id="uni-name"
                    value={universityName}
                    onChange={(e) => setUniversityName(e.target.value)}
                    placeholder="e.g. NIT Rourkela / GEMS B-School / Jain University"
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="course-name" className="text-xs font-medium">
                    Course / Program Name *
                  </Label>
                  <Input
                    id="course-name"
                    value={courseName}
                    onChange={(e) => setCourseName(e.target.value)}
                    placeholder="e.g. B.Sc Nursing / MBA in Finance / B.Tech AI & ML"
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="website-url" className="text-xs font-medium">
                    Official University / Course Website Link
                  </Label>
                  <div className="relative">
                    <Globe className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="website-url"
                      value={websiteUrl}
                      onChange={(e) => setWebsiteUrl(e.target.value)}
                      placeholder="https://university.edu/program"
                      className="pl-9"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="extra-notes" className="text-xs font-medium">
                    Special Fees, Scholarship or Counselor Notes (Optional)
                  </Label>
                  <Textarea
                    id="extra-notes"
                    value={additionalNotes}
                    onChange={(e) => setAdditionalNotes(e.target.value)}
                    placeholder="e.g. 30% merit scholarship available before Dec 15; hostel fee separate"
                    rows={2}
                  />
                </div>

                <Button type="submit" className="w-full" disabled={generating}>
                  {generating ? (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                      Analyzing Website &amp; Generating Kit...
                    </>
                  ) : (
                    <>
                      <Sparkles className="mr-2 h-4 w-4" />
                      Get Counselling Points &amp; Automate Kit
                    </>
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Target Student / Lead Picker */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Users className="h-4 w-4 text-primary" />
                  Select Student / Lead to Send Automatically
                </CardTitle>
                {selectedLeadIds.length > 0 && (
                  <Badge variant="default" className="text-xs">
                    {selectedLeadIds.length} Selected
                  </Badge>
                )}
              </div>
              <CardDescription className="text-xs">
                Pick one or more CRM leads, or enter a direct phone/email below.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  value={leadSearch}
                  onChange={(e) => setLeadSearch(e.target.value)}
                  placeholder="Search leads by name, course, phone, email..."
                  className="h-8 pl-8 text-xs"
                />
              </div>

              <div className="max-h-44 space-y-1 overflow-y-auto rounded-md border border-border p-1.5">
                {loadingInitial ? (
                  <p className="py-4 text-center text-xs text-muted-foreground">Loading leads...</p>
                ) : filteredLeads.length === 0 ? (
                  <p className="py-4 text-center text-xs text-muted-foreground">
                    No matching leads found. Use direct recipient fields below.
                  </p>
                ) : (
                  filteredLeads.map((lead) => {
                    const checked = selectedLeadIds.includes(lead.id);
                    return (
                      <div
                        key={lead.id}
                        onClick={() => toggleLeadSelection(lead.id)}
                        className={cn(
                          "flex cursor-pointer items-center justify-between gap-2 rounded px-2 py-1.5 text-xs transition-colors",
                          checked ? "bg-primary/15 text-foreground" : "hover:bg-muted/60"
                        )}
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          <Checkbox checked={checked} />
                          <div className="min-w-0">
                            <p className="truncate font-medium text-foreground">
                              {lead.full_name || "Unnamed Student"}
                            </p>
                            <p className="truncate text-[11px] text-muted-foreground">
                              {lead.course || "Course N/A"} &bull; {lead.phone || "No phone"}{" "}
                              {lead.email ? `• ${lead.email}` : ""}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Direct recipient fallback */}
              <div className="space-y-2 rounded-md border border-dashed border-border p-2.5">
                <p className="text-[11px] font-medium text-muted-foreground">
                  Or Send Directly to Walk-in / Manual Student:
                </p>
                <div className="grid gap-2 sm:grid-cols-3">
                  <Input
                    value={customName}
                    onChange={(e) => setCustomName(e.target.value)}
                    placeholder="Student Name"
                    className="h-8 text-xs"
                  />
                  <Input
                    value={customPhone}
                    onChange={(e) => setCustomPhone(e.target.value)}
                    placeholder="+91 98..."
                    className="h-8 text-xs"
                  />
                  <Input
                    value={customEmail}
                    onChange={(e) => setCustomEmail(e.target.value)}
                    placeholder="student@mail.com"
                    className="h-8 text-xs"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Saved Counselling Playbooks */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <BookOpen className="h-4 w-4 text-primary" />
                Saved Counselling Playbooks ({playbooks.length})
              </CardTitle>
              <CardDescription className="text-xs">
                Playbooks with Auto WhatsApp or Auto Mail active automatically respond to matching student inquiries &amp; new leads.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2.5">
              {playbooks.length === 0 ? (
                <p className="py-4 text-center text-xs text-muted-foreground">
                  No playbooks saved yet. Generate your first university counselling kit above!
                </p>
              ) : (
                playbooks.map((pb) => (
                  <div
                    key={pb.id}
                    className={cn(
                      "rounded-lg border p-3 transition-colors",
                      activeKitId === pb.id
                        ? "border-primary/50 bg-primary/5"
                        : "border-border bg-card/60"
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => applyPlaybookToWorkbench(pb)}
                        className="text-left"
                      >
                        <p className="text-sm font-semibold text-foreground hover:text-primary">
                          {pb.universityName} — {pb.courseName}
                        </p>
                        {pb.websiteUrl && (
                          <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                            <Globe className="h-3 w-3" /> {pb.websiteUrl}
                          </p>
                        )}
                      </button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                        onClick={() => handleDeletePlaybook(pb.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>

                    <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-2 text-[11px]">
                      <div className="flex items-center gap-3">
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <Switch
                            checked={pb.autoWhatsappEnabled}
                            onCheckedChange={(v) =>
                              handleTogglePlaybookFlag(pb, "autoWhatsappEnabled", v)
                            }
                          />
                          <span>Auto WA Reply</span>
                        </label>
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <Switch
                            checked={pb.autoEmailEnabled}
                            onCheckedChange={(v) =>
                              handleTogglePlaybookFlag(pb, "autoEmailEnabled", v)
                            }
                          />
                          <span>Auto Mail</span>
                        </label>
                      </div>
                      {pb.kbDocumentId && (
                        <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/10 text-[10px] text-emerald-400">
                          <ShieldCheck className="mr-1 h-3 w-3" /> AI KB Synced
                        </Badge>
                      )}
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Main Workbench */}
        <div className="xl:col-span-7">
          {!hasGeneratedKit ? (
            <Card className="flex h-full min-h-[460px] flex-col items-center justify-center border-dashed p-8 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <GraduationCap className="h-7 w-7" />
              </div>
              <h2 className="mt-4 text-lg font-semibold text-foreground">
                Ready to Build Your Program Counselling &amp; Automation Kit
              </h2>
              <p className="mt-2 max-w-md text-sm text-muted-foreground">
                Enter the <strong>University Name</strong>, <strong>Course</strong>, and <strong>Website Link</strong> on the left. AI will extract verified details from the website and prepare:
              </p>
              <div className="mt-6 grid max-w-lg gap-3 text-left sm:grid-cols-3">
                <div className="rounded-lg border border-border bg-card p-3">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <p className="mt-1.5 text-xs font-semibold">Counselling Points</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    Eligibility, USPs, fee &amp; career highlights + call pitch
                  </p>
                </div>
                <div className="rounded-lg border border-border bg-card p-3">
                  <MessageSquare className="h-4 w-4 text-emerald-400" />
                  <p className="mt-1.5 text-xs font-semibold">Auto WhatsApp</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    Syncs with AI Auto-Reply + 1-click lead dispatch
                  </p>
                </div>
                <div className="rounded-lg border border-border bg-card p-3">
                  <Mail className="h-4 w-4 text-blue-400" />
                  <p className="mt-1.5 text-xs font-semibold">Automated Email</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    Branded HTML brochure &amp; auto-welcome for new leads
                  </p>
                </div>
              </div>
            </Card>
          ) : (
            <div className="space-y-4">
              {/* Top Action & Status Bar */}
              <Card>
                <CardContent className="p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-base font-bold text-foreground">
                          {universityName} &mdash; {courseName}
                        </h2>
                        {websiteStatus && (
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-[11px]",
                              websiteStatus.ok
                                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
                                : "border-amber-500/40 bg-amber-500/10 text-amber-400"
                            )}
                          >
                            {websiteStatus.ok ? "Website Grounded ✓" : "AI / Standard Guide"}
                          </Badge>
                        )}
                        {generationSource && (
                          <Badge variant="secondary" className="text-[11px] uppercase">
                            {generationSource}
                          </Badge>
                        )}
                      </div>
                      {websiteStatus?.url && (
                        <a
                          href={websiteStatus.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                        >
                          <ExternalLink className="h-3 w-3" />
                          {websiteStatus.title || websiteStatus.url}
                        </a>
                      )}
                      {websiteStatus?.note && (
                        <p className="text-[11px] text-muted-foreground">
                          {websiteStatus.note}
                        </p>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleSavePlaybook}
                        disabled={savingPlaybook}
                      >
                        {savingPlaybook ? (
                          <RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <BookmarkPlus className="mr-1.5 h-3.5 w-3.5" />
                        )}
                        Save &amp; Sync Automation
                      </Button>

                      <Button
                        size="sm"
                        onClick={() => handleAutomateSend({ whatsapp: true, email: true })}
                        disabled={dispatching}
                      >
                        {dispatching ? (
                          <RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Zap className="mr-1.5 h-3.5 w-3.5" />
                        )}
                        Automate Both (WA + Mail)
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Delivery Receipt Feedback */}
              {deliveryResults && deliveryResults.length > 0 && (
                <Card className="border-primary/30 bg-primary/5">
                  <CardContent className="space-y-2 p-3.5">
                    <p className="text-xs font-semibold text-foreground">
                      Automated Outreach Results:
                    </p>
                    {deliveryResults.map((r, i) => (
                      <div
                        key={i}
                        className="flex flex-wrap items-center justify-between gap-2 rounded bg-card px-3 py-2 text-xs"
                      >
                        <span className="font-medium text-foreground">{r.name}</span>
                        <div className="flex flex-wrap items-center gap-2">
                          {r.whatsappSent ? (
                            <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/10 text-emerald-400">
                              <CheckCircle2 className="mr-1 h-3 w-3" /> WhatsApp ({r.whatsappMode})
                            </Badge>
                          ) : r.whatsappError ? (
                            <Badge variant="outline" className="border-red-500/40 bg-red-500/10 text-red-400">
                              <AlertCircle className="mr-1 h-3 w-3" /> WA: {r.whatsappError.slice(0, 70)}
                            </Badge>
                          ) : null}

                          {r.emailSent ? (
                            <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/10 text-emerald-400">
                              <CheckCircle2 className="mr-1 h-3 w-3" /> Email Sent
                            </Badge>
                          ) : r.emailError ? (
                            <Badge variant="outline" className="border-red-500/40 bg-red-500/10 text-red-400">
                              <AlertCircle className="mr-1 h-3 w-3" /> Mail: {r.emailError.slice(0, 70)}
                            </Badge>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              {/* Tabbed Counselling Workbench */}
              <Tabs value={activeSubTab} onValueChange={setActiveSubTab}>
                <TabsList className="flex-wrap">
                  <TabsTrigger value="points">
                    <Sparkles className="mr-1.5 h-3.5 w-3.5" /> Counselling Points &amp; Pitch
                  </TabsTrigger>
                  <TabsTrigger value="whatsapp">
                    <MessageSquare className="mr-1.5 h-3.5 w-3.5" /> Automate WhatsApp Reply
                  </TabsTrigger>
                  <TabsTrigger value="email">
                    <Mail className="mr-1.5 h-3.5 w-3.5" /> Automate Counselling Email
                  </TabsTrigger>
                </TabsList>

                {/* Tab 1: Counselling Points, Call Script & Objections */}
                <TabsContent value="points" className="mt-4 space-y-4">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Executive Overview</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm leading-relaxed text-muted-foreground">
                        {universityOverview}
                      </p>
                    </CardContent>
                  </Card>

                  <Card className="border-emerald-500/30 bg-emerald-500/5">
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <CardTitle className="flex items-center gap-2 text-sm text-emerald-400">
                          <Phone className="h-4 w-4" />
                          30-Second Call Opening Pitch
                        </CardTitle>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => handleCopy("pitch", openingPitch)}
                        >
                          {copiedKey === "pitch" ? (
                            <Check className="mr-1 h-3 w-3" />
                          ) : (
                            <Copy className="mr-1 h-3 w-3" />
                          )}
                          Copy
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                        &ldquo;{openingPitch}&rdquo;
                      </p>
                    </CardContent>
                  </Card>

                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold text-foreground">
                      Key Counselling Talking Points ({counsellingPoints.length})
                    </h3>
                    <div className="grid gap-3 md:grid-cols-2">
                      {counsellingPoints.map((pt, idx) => {
                        const meta = CATEGORY_META[pt.category] || CATEGORY_META.highlights;
                        return (
                          <Card key={idx}>
                            <CardContent className="p-3.5">
                              <Badge variant="outline" className={cn("text-[10px]", meta.className)}>
                                {meta.label}
                              </Badge>
                              <h4 className="mt-2 text-sm font-semibold text-foreground">
                                {pt.title}
                              </h4>
                              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                                {pt.detail}
                              </p>
                            </CardContent>
                          </Card>
                        );
                      })}
                    </div>
                  </div>

                  {objectionHandlers.length > 0 && (
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="flex items-center gap-2 text-sm">
                          <HelpCircle className="h-4 w-4 text-primary" />
                          Parent &amp; Student Objection Handling
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {objectionHandlers.map((obj, idx) => (
                          <div
                            key={idx}
                            className="rounded-lg border border-border bg-muted/30 p-3"
                          >
                            <p className="text-xs font-semibold text-foreground">
                              Q: {obj.question}
                            </p>
                            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                              A: {obj.answer}
                            </p>
                          </div>
                        ))}
                      </CardContent>
                    </Card>
                  )}
                </TabsContent>

                {/* Tab 2: Automate WhatsApp Reply */}
                <TabsContent value="whatsapp" className="mt-4 space-y-4">
                  <Card>
                    <CardHeader className="pb-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <CardTitle className="flex items-center gap-2 text-sm">
                            <Bot className="h-4 w-4 text-emerald-400" />
                            Automated WhatsApp Reply Configuration
                          </CardTitle>
                          <CardDescription className="text-xs">
                            Edit the WhatsApp reply sent to students and arm 24/7 AI Auto-Reply for inbound questions about {courseName}.
                          </CardDescription>
                        </div>
                        <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-xs font-medium">
                          <Switch
                            checked={autoWhatsappEnabled}
                            onCheckedChange={setAutoWhatsappEnabled}
                          />
                          Auto-Reply Inbound WA
                        </label>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <Textarea
                        value={whatsappDraft}
                        onChange={(e) => setWhatsappDraft(e.target.value)}
                        rows={9}
                        className="font-sans text-sm"
                      />
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-[11px] text-muted-foreground">
                          Tip: Keep <code className="rounded bg-muted px-1">{"{{student_name}}"}</code> for automatic personalization.
                        </p>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleCopy("wa", whatsappDraft)}
                          >
                            <Copy className="mr-1.5 h-3.5 w-3.5" /> Copy Text
                          </Button>
                          <Button
                            size="sm"
                            onClick={() =>
                              handleAutomateSend({ whatsapp: true, email: false })
                            }
                            disabled={dispatching}
                          >
                            <Send className="mr-1.5 h-3.5 w-3.5" />
                            Send WhatsApp Now
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* Tab 3: Automate Email */}
                <TabsContent value="email" className="mt-4 space-y-4">
                  <Card>
                    <CardHeader className="pb-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <CardTitle className="flex items-center gap-2 text-sm">
                            <Mail className="h-4 w-4 text-blue-400" />
                            Automated Counselling Email Composer
                          </CardTitle>
                          <CardDescription className="text-xs">
                            Customize the subject and body, or auto-send to every new incoming lead interested in {courseName}.
                          </CardDescription>
                        </div>
                        <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-xs font-medium">
                          <Switch
                            checked={autoEmailEnabled}
                            onCheckedChange={setAutoEmailEnabled}
                          />
                          Auto-Mail New Leads
                        </label>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs">Email Subject</Label>
                        <Input
                          value={emailSubject}
                          onChange={(e) => setEmailSubject(e.target.value)}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Email Body Paragraphs</Label>
                        <Textarea
                          value={emailBodyText}
                          onChange={(e) => setEmailBodyText(e.target.value)}
                          rows={7}
                        />
                      </div>
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          onClick={() => handleAutomateSend({ whatsapp: false, email: true })}
                          disabled={dispatching}
                        >
                          <Mail className="mr-1.5 h-3.5 w-3.5" />
                          Send Counselling Email Now
                        </Button>
                      </div>

                      {emailHtmlPreview && (
                        <div className="pt-3">
                          <Label className="mb-2 block text-xs text-muted-foreground">
                            Branded Email Layout Preview
                          </Label>
                          <div className="overflow-hidden rounded-lg border border-border bg-white">
                            <iframe
                              title="Email Preview"
                              srcDoc={emailHtmlPreview}
                              className="h-[420px] w-full border-0"
                            />
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
