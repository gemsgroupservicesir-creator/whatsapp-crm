"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BrainCircuit,
  Sparkles,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Zap,
  ArrowRight,
  MessageSquare,
  Users,
  BookOpen,
  Clock,
  Send,
  GraduationCap,
  X,
  RotateCcw,
  History,
  ShieldAlert,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type {
  CrmIntelligenceReport,
  CrmRecommendation,
  RecommendationImpact,
} from "@/lib/ai/crm-intelligence";

const IMPACT_BADGE: Record<
  RecommendationImpact,
  { label: string; className: string }
> = {
  critical: {
    label: "Critical Impact",
    className: "border-red-500/40 bg-red-500/15 text-red-400",
  },
  high: {
    label: "High Impact",
    className: "border-amber-500/40 bg-amber-500/15 text-amber-400",
  },
  medium: {
    label: "Medium Impact",
    className: "border-blue-500/40 bg-blue-500/15 text-blue-400",
  },
  low: {
    label: "Low Impact",
    className: "border-border bg-muted text-muted-foreground",
  },
};

const QUICK_QUESTIONS = [
  "What is the biggest bottleneck slowing down our admissions team right now?",
  "Which courses have the highest lead volume and need Counselling Playbooks?",
  "Why are outbound WhatsApp messages failing and what should we do?",
  "How should we rebalance lead workload across our counselors today?",
];

export function CrmAiIntelligence({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const [report, setReport] = useState<CrmIntelligenceReport | null>(null);
  const [callerRole, setCallerRole] = useState<string>("agent");
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [filterTab, setFilterTab] = useState<"pending" | "applied" | "dismissed">("pending");

  // Interactive Ask AI State
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const [qaHistory, setQaHistory] = useState<
    Array<{ q: string; a: string; source: "ai" | "fallback" }>
  >([]);

  const fetchIntelligence = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/ai/intelligence");
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to load CRM Intelligence");
      }
      setReport(data.report);
      if (data.role) setCallerRole(data.role);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load CRM Intelligence");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchIntelligence();
  }, [fetchIntelligence]);

  const handleRunScan = async () => {
    try {
      setScanning(true);
      const res = await fetch("/api/ai/intelligence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "scan" }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Scan failed");
      }
      setReport(data.report);
      toast.success("AI finished learning from your entire CRM!");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to run CRM scan");
    } finally {
      setScanning(false);
    }
  };

  const handleApplyRecommendation = async (rec: CrmRecommendation) => {
    if (rec.action.type === "navigate" && rec.action.href) {
      router.push(rec.action.href);
      return;
    }

    try {
      setApplyingId(rec.id);
      const res = await fetch("/api/ai/intelligence/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recommendationId: rec.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Could not apply change");
      }
      setReport(data.report);
      toast.success(data.summary || "Change applied successfully!");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to apply change");
    } finally {
      setApplyingId(null);
    }
  };

  const handleUpdateStatus = async (
    recommendationId: string,
    action: "dismiss" | "reopen"
  ) => {
    try {
      const res = await fetch("/api/ai/intelligence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, recommendationId }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Update failed");
      }
      setReport(data.report);
      toast.success(
        action === "dismiss" ? "Recommendation dismissed" : "Recommendation reopened"
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update status");
    }
  };

  const handleAsk = async (promptText?: string) => {
    const q = (promptText ?? question).trim();
    if (!q) return;

    try {
      setAsking(true);
      const res = await fetch("/api/ai/intelligence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "ask", question: q }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to ask AI");
      }
      setQaHistory((prev) => [
        { q, a: data.answer, source: data.source || "ai" },
        ...prev,
      ]);
      if (!promptText) setQuestion("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to get AI answer");
    } finally {
      setAsking(false);
    }
  };

  if (loading && !report) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12 text-sm text-muted-foreground">
          <RefreshCw className="mr-2 h-4 w-4 animate-spin text-primary" />
          Scanning entire CRM (leads, chats, notes, rules & playbooks)...
        </CardContent>
      </Card>
    );
  }

  if (!report) return null;

  const isAdmin = callerRole === "owner" || callerRole === "admin";
  const pendingRecs = report.recommendations.filter((r) => r.status === "pending");
  const appliedRecs = report.recommendations.filter((r) => r.status === "applied");
  const dismissedRecs = report.recommendations.filter((r) => r.status === "dismissed");
  const displayedRecs =
    filterTab === "pending"
      ? pendingRecs
      : filterTab === "applied"
        ? appliedRecs
        : dismissedRecs;

  // Compact Dashboard Summary Mode
  if (compact) {
    const topRecs = pendingRecs.slice(0, 3);
    return (
      <Card className="border-primary/20 bg-gradient-to-br from-primary/5 via-card to-card">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 text-primary">
                <BrainCircuit className="h-4 w-4" />
              </div>
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  AI CRM Intelligence
                  <Badge variant="outline" className="border-primary/30 text-xs text-primary">
                    Health {report.healthScore}/100
                  </Badge>
                </CardTitle>
                <CardDescription className="text-xs">
                  {report.executiveSummary}
                </CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleRunScan}
                disabled={scanning}
              >
                <RefreshCw className={cn("mr-1.5 h-3.5 w-3.5", scanning && "animate-spin")} />
                {scanning ? "Learning..." : "Re-Scan CRM"}
              </Button>
              <Link href="/agents?tab=intelligence">
                <Button size="sm">
                  Open Advisor <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                </Button>
              </Link>
            </div>
          </div>
        </CardHeader>
        {topRecs.length > 0 && (
          <CardContent className="grid gap-2.5 pt-0 md:grid-cols-3">
            {topRecs.map((rec) => {
              const badge = IMPACT_BADGE[rec.impact];
              const isNav = rec.action.type === "navigate";
              return (
                <div
                  key={rec.id}
                  className="flex flex-col justify-between rounded-lg border border-border/80 bg-card/80 p-3"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <Badge variant="outline" className={cn("text-[10px]", badge.className)}>
                        {badge.label}
                      </Badge>
                      <span className="text-[11px] text-muted-foreground">
                        {rec.estimatedTimeSaved}
                      </span>
                    </div>
                    <p className="mt-1.5 text-sm font-medium text-foreground line-clamp-2">
                      {rec.title}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                      {rec.finding}
                    </p>
                  </div>
                  <div className="mt-3 flex justify-end">
                    <Button
                      size="sm"
                      variant={isNav ? "outline" : "default"}
                      className="h-7 text-xs"
                      disabled={applyingId === rec.id || (!isNav && !isAdmin)}
                      onClick={() => handleApplyRecommendation(rec)}
                    >
                      {applyingId === rec.id ? (
                        <RefreshCw className="mr-1 h-3 w-3 animate-spin" />
                      ) : (
                        <Zap className="mr-1 h-3 w-3" />
                      )}
                      {rec.action.label}
                    </Button>
                  </div>
                </div>
              );
            })}
          </CardContent>
        )}
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Hero Header */}
      <Card className="border-primary/25 bg-gradient-to-r from-primary/10 via-card to-card">
        <CardContent className="p-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <BrainCircuit className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-bold text-foreground">
                  AI Agent Intelligence — Whole-CRM Brain
                </h2>
                <Badge
                  variant="outline"
                  className={cn(
                    "font-semibold",
                    report.healthScore >= 80
                      ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-400"
                      : report.healthScore >= 55
                        ? "border-amber-500/40 bg-amber-500/15 text-amber-400"
                        : "border-red-500/40 bg-red-500/15 text-red-400"
                  )}
                >
                  CRM Health Score: {report.healthScore}/100
                </Badge>
                <Badge variant="secondary" className="text-xs">
                  Scan #{report.scanCount}
                </Badge>
              </div>
              <p className="max-w-3xl text-sm text-muted-foreground">
                {report.executiveSummary}
              </p>
              <p className="text-xs text-muted-foreground">
                Last learned: {new Date(report.lastScannedAt).toLocaleString()}
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <Link href="/counselling">
                <Button variant="outline" size="sm">
                  <GraduationCap className="mr-1.5 h-4 w-4" />
                  Agent Counselling
                </Button>
              </Link>
              <Button onClick={handleRunScan} disabled={scanning} size="sm">
                <RefreshCw className={cn("mr-1.5 h-4 w-4", scanning && "animate-spin")} />
                {scanning ? "Learning from Whole CRM..." : "Learn from Whole CRM"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Telemetry Strip */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Leads & Routing</span>
              <Users className="h-4 w-4 text-primary" />
            </div>
            <div className="mt-2 text-2xl font-bold text-foreground">
              {report.snapshot.leads.total}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {report.snapshot.leads.unassignedCount} unassigned &bull;{" "}
              {report.snapshot.leads.staleUncontactedCount} stale &gt;24h
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>WhatsApp & Inbox</span>
              <MessageSquare className="h-4 w-4 text-emerald-400" />
            </div>
            <div className="mt-2 text-2xl font-bold text-foreground">
              {report.snapshot.messaging.totalConversations}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {report.snapshot.messaging.awaitingReplyCount} awaiting reply &bull;{" "}
              {report.snapshot.messaging.failedOutboundCount} failed sends
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Counselling & AI KB</span>
              <BookOpen className="h-4 w-4 text-violet-400" />
            </div>
            <div className="mt-2 text-2xl font-bold text-foreground">
              {report.snapshot.automation.counsellingPlaybooksCount} Playbooks
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {report.snapshot.automation.kbDocumentCount} KB docs &bull;{" "}
              {report.snapshot.automation.activeAssignmentRulesCount} routing rules
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Team Execution Today</span>
              <Clock className="h-4 w-4 text-amber-400" />
            </div>
            <div className="mt-2 text-2xl font-bold text-foreground">
              {report.snapshot.team.tasksCompletedTodayCount}/
              {report.snapshot.team.tasksAssignedTodayCount} Tasks
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {report.snapshot.team.presentTodayCount}/{report.snapshot.team.totalMembers} clocked in today
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Grid: Recommended Changes + Learnings */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left 2 cols: Recommended Changes */}
        <div className="space-y-4 lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="flex items-center gap-2 text-base font-semibold text-foreground">
                <Zap className="h-4 w-4 text-amber-400" />
                Recommended Workflow Changes
              </h3>
              <p className="text-xs text-muted-foreground">
                Apply improvements directly in one click to automate manual counselor work.
              </p>
            </div>
            <div className="flex items-center gap-1 rounded-lg border border-border bg-muted/40 p-1">
              {(["pending", "applied", "dismissed"] as const).map((statusTab) => {
                const count =
                  statusTab === "pending"
                    ? pendingRecs.length
                    : statusTab === "applied"
                      ? appliedRecs.length
                      : dismissedRecs.length;
                return (
                  <button
                    key={statusTab}
                    type="button"
                    onClick={() => setFilterTab(statusTab)}
                    className={cn(
                      "rounded-md px-2.5 py-1 text-xs font-medium capitalize transition-colors",
                      filterTab === statusTab
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {statusTab} ({count})
                  </button>
                );
              })}
            </div>
          </div>

          {displayedRecs.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-10 text-center">
                <CheckCircle2 className="h-8 w-8 text-emerald-400" />
                <p className="mt-2 text-sm font-medium text-foreground">
                  {filterTab === "pending"
                    ? "All caught up! No pending changes right now."
                    : `No ${filterTab} recommendations yet.`}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Click &ldquo;Learn from Whole CRM&rdquo; anytime as new leads and messages arrive.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {displayedRecs.map((rec) => {
                const badge = IMPACT_BADGE[rec.impact];
                const isNav = rec.action.type === "navigate";
                return (
                  <Card
                    key={rec.id}
                    className={cn(
                      "transition-colors",
                      rec.impact === "critical" && rec.status === "pending"
                        ? "border-red-500/35"
                        : "border-border"
                    )}
                  >
                    <CardContent className="p-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="space-y-1.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="outline" className={cn("text-[11px]", badge.className)}>
                              {badge.label}
                            </Badge>
                            <Badge variant="secondary" className="text-[11px] capitalize">
                              {rec.category.replace("_", " ")}
                            </Badge>
                            {rec.source === "ai" && (
                              <Badge variant="outline" className="border-violet-500/40 bg-violet-500/10 text-[11px] text-violet-300">
                                <Sparkles className="mr-1 h-3 w-3" />
                                AI Discovered
                              </Badge>
                            )}
                            <span className="text-xs font-medium text-emerald-400">
                              {rec.estimatedTimeSaved}
                            </span>
                          </div>

                          <h4 className="text-sm font-semibold text-foreground">
                            {rec.title}
                          </h4>
                          <p className="text-xs leading-relaxed text-muted-foreground">
                            <strong className="text-foreground">Finding:</strong> {rec.finding}
                          </p>
                          <p className="text-xs leading-relaxed text-muted-foreground">
                            <strong className="text-foreground">Change Recommended:</strong>{" "}
                            {rec.recommendation}
                          </p>

                          {rec.actionResult && (
                            <div className="mt-2 flex items-center gap-1.5 rounded-md bg-emerald-500/10 px-2.5 py-1.5 text-xs text-emerald-400">
                              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                              <span>{rec.actionResult}</span>
                            </div>
                          )}
                        </div>

                        <div className="flex shrink-0 flex-wrap items-center gap-2 sm:flex-col sm:items-end">
                          {rec.status === "pending" && (
                            <>
                              <Button
                                size="sm"
                                variant={isNav ? "outline" : "default"}
                                disabled={applyingId === rec.id || (!isNav && !isAdmin)}
                                title={
                                  !isNav && !isAdmin
                                    ? "Admin access required to apply workspace-wide changes"
                                    : undefined
                                }
                                onClick={() => handleApplyRecommendation(rec)}
                              >
                                {applyingId === rec.id ? (
                                  <RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                                ) : isNav ? (
                                  <ArrowRight className="mr-1.5 h-3.5 w-3.5" />
                                ) : (
                                  <Zap className="mr-1.5 h-3.5 w-3.5" />
                                )}
                                {rec.action.label}
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 px-2 text-xs text-muted-foreground"
                                onClick={() => handleUpdateStatus(rec.id, "dismiss")}
                              >
                                <X className="mr-1 h-3 w-3" /> Dismiss
                              </Button>
                            </>
                          )}
                          {rec.status === "dismissed" && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs"
                              onClick={() => handleUpdateStatus(rec.id, "reopen")}
                            >
                              <RotateCcw className="mr-1 h-3 w-3" /> Reopen
                            </Button>
                          )}
                          {rec.status === "applied" && (
                            <Badge
                              variant="outline"
                              className="border-emerald-500/40 bg-emerald-500/15 text-emerald-400"
                            >
                              <CheckCircle2 className="mr-1 h-3 w-3" /> Applied
                            </Badge>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          {/* Ask CRM Intelligence Box */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                <Sparkles className="h-4 w-4 text-primary" />
                Ask CRM Intelligence
              </CardTitle>
              <CardDescription className="text-xs">
                Ask anything about your leads, counselor performance, message errors, or course demand.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-1.5">
                {QUICK_QUESTIONS.map((q) => (
                  <button
                    key={q}
                    type="button"
                    disabled={asking}
                    onClick={() => handleAsk(q)}
                    className="rounded-full border border-border bg-muted/50 px-2.5 py-1 text-left text-[11px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
                  >
                    {q}
                  </button>
                ))}
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleAsk();
                }}
                className="flex gap-2"
              >
                <Input
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  placeholder="Ask AI about bottlenecks, courses, or automations..."
                  disabled={asking}
                />
                <Button type="submit" disabled={asking || !question.trim()}>
                  {asking ? (
                    <RefreshCw className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>
              </form>

              {qaHistory.length > 0 && (
                <div className="space-y-2 pt-2">
                  {qaHistory.map((item, idx) => (
                    <div
                      key={idx}
                      className="rounded-lg border border-border bg-muted/30 p-3 text-xs"
                    >
                      <p className="font-semibold text-foreground">Q: {item.q}</p>
                      <p className="mt-1.5 whitespace-pre-wrap leading-relaxed text-muted-foreground">
                        {item.a}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right col: Learnings + Knowledge Gaps + History */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                <BrainCircuit className="h-4 w-4 text-primary" />
                What AI Learned From Your CRM
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {report.learnings.map((item, i) => (
                <div
                  key={i}
                  className="rounded-lg border border-border/80 bg-muted/25 p-3"
                >
                  <p className="text-xs font-semibold text-primary">{item.topic}</p>
                  <p className="mt-1 text-xs leading-relaxed text-foreground">
                    {item.insight}
                  </p>
                  {item.evidence && (
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Evidence: {item.evidence}
                    </p>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>

          {report.knowledgeGaps.length > 0 && (
            <Card className="border-amber-500/30">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                  <AlertTriangle className="h-4 w-4 text-amber-400" />
                  Detected Knowledge Gaps
                </CardTitle>
                <CardDescription className="text-xs">
                  Fix these gaps in Agent Counselling so AI replies & emails stay accurate.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {report.knowledgeGaps.map((gap, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-2 rounded-md border border-border/70 bg-muted/30 p-2.5 text-xs text-muted-foreground"
                  >
                    <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
                    <span className="flex-1">{gap}</span>
                  </div>
                ))}
                <Link href="/counselling" className="block pt-1">
                  <Button variant="outline" size="sm" className="w-full text-xs">
                    <GraduationCap className="mr-1.5 h-3.5 w-3.5" />
                    Fill Gaps in Agent Counselling
                  </Button>
                </Link>
              </CardContent>
            </Card>
          )}

          {report.snapshot.messaging.topFailureReasons.length > 0 && (
            <Card className="border-red-500/30">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm font-semibold text-red-400">
                  <ShieldAlert className="h-4 w-4" />
                  Delivery Diagnostics
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-xs">
                {report.snapshot.messaging.topFailureReasons.map((err, i) => (
                  <div key={i} className="flex items-center justify-between rounded bg-red-500/10 px-2.5 py-1.5">
                    <span className="text-red-300">
                      [{err.code}] {err.title}
                    </span>
                    <Badge variant="outline" className="border-red-500/40 text-red-300">
                      {err.count}
                    </Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {report.learnedHistory.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                  <History className="h-4 w-4 text-muted-foreground" />
                  Optimization Log
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5">
                {report.learnedHistory.slice(-6).reverse().map((entry, idx) => (
                  <p key={idx} className="text-[11px] leading-relaxed text-muted-foreground">
                    {entry}
                  </p>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
