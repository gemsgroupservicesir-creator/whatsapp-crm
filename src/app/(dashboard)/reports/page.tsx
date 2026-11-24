"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { toast } from "sonner";
import {
  ClipboardList,
  Clock,
  Calendar,
  UserCheck,
  CheckCircle2,
  AlertCircle,
  FileText,
  Send,
  RefreshCw,
  Search,
  MessageSquare,
  Sparkles,
  School,
  GraduationCap,
  Phone,
  Mail,
  Shield,
  Crown,
  UserCog,
  Check,
  LogIn,
  LogOut,
  Briefcase,
  MapPin,
  TrendingUp,
  Award,
  AlertTriangle,
  ChevronRight,
  ExternalLink,
  Users,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
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
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import type {
  AgentDailyReport,
  AgentNoteItem,
  DailySystemMetrics,
  WorkOfTheDay,
  WorkDoneReport,
  AdminReview,
} from "@/lib/reports/agent-reports";

interface TeamMember {
  userId: string;
  fullName: string;
  email: string;
  avatarUrl: string | null;
  role: string;
}

interface CallerInfo {
  userId: string;
  name: string;
  email: string;
  role: string;
  isAdmin: boolean;
}

export default function ReportsPage() {
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  });

  const [selectedAgentId, setSelectedAgentId] = useState<string>("all");
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  // Data from API
  const [caller, setCaller] = useState<CallerInfo | null>(null);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [currentReport, setCurrentReport] = useState<AgentDailyReport | null>(null);
  const [callerReport, setCallerReport] = useState<AgentDailyReport | null>(null);
  const [allReports, setAllReports] = useState<Record<string, AgentDailyReport>>({});
  const [notes, setNotes] = useState<AgentNoteItem[]>([]);
  const [notesFilter, setNotesFilter] = useState<string>("");

  // Dialog states
  const [workDayOpen, setWorkDayOpen] = useState(false);
  const [workDoneOpen, setWorkDoneOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [submittingAction, setSubmittingAction] = useState(false);

  // Form states: Work of the Day
  const [planText, setPlanText] = useState("");
  const [targetLeads, setTargetLeads] = useState<number | "">("");
  const [targetCalls, setTargetCalls] = useState<number | "">("");
  const [priorities, setPriorities] = useState("");

  // Form states: Work Done Report
  const [summaryText, setSummaryText] = useState("");
  const [accomplishments, setAccomplishments] = useState("");
  const [challenges, setChallenges] = useState("");
  const [tomorrowPlan, setTomorrowPlan] = useState("");

  // Form states: Admin Review
  const [reviewStatus, setReviewStatus] = useState<"approved" | "needs_attention">("approved");
  const [reviewFeedback, setReviewFeedback] = useState("");

  // Location selector for clock in
  const [workLocation, setWorkLocation] = useState<"office" | "remote" | "field">("office");

  // Fetch report data
  const fetchReportData = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);

      const params = new URLSearchParams({
        date: selectedDate,
      });
      if (selectedAgentId) {
        params.set("agentId", selectedAgentId);
      }

      const res = await fetch(`/api/reports/agent?${params.toString()}`);
      if (!res.ok) {
        throw new Error("Failed to load report data");
      }

      const data = await res.json();
      setCaller(data.caller);
      setTeamMembers(data.teamMembers || []);
      setCallerReport(data.callerReport || null);
      setAllReports(data.allReports || {});
      setCurrentReport(data.report || null);
      setNotes(data.notes || []);

      // If user is non-admin and selectedAgentId was 'all', default to caller's userId
      if (!data.caller?.isAdmin && selectedAgentId === "all") {
        setSelectedAgentId(data.caller.userId);
      }
    } catch (err: any) {
      console.error("fetchReportData error:", err);
      toast.error(err.message || "Failed to load reports");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedDate, selectedAgentId]);

  useEffect(() => {
    fetchReportData();
  }, [fetchReportData]);

  // Handle Clock In / Clock Out
  const handleClock = async (action: "clock_in" | "clock_out") => {
    try {
      setSubmittingAction(true);
      const res = await fetch("/api/reports/agent/clock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          location: workLocation,
          date: selectedDate,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || `Failed to ${action.replace("_", " ")}`);
      }

      toast.success(
        action === "clock_in"
          ? "Clocked In successfully! Have a productive day."
          : "Clocked Out successfully! Daily work recorded."
      );
      fetchReportData(true);
    } catch (err: any) {
      toast.error(err.message || "Action failed");
    } finally {
      setSubmittingAction(false);
    }
  };

  // Handle Work of the Day submit
  const handleSaveWorkOfTheDay = async () => {
    if (!planText.trim()) {
      toast.error("Please enter your plan for today");
      return;
    }

    try {
      setSubmittingAction(true);
      const res = await fetch("/api/reports/agent/work", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "work_of_the_day",
          date: selectedDate,
          plan_text: planText,
          target_leads_count: targetLeads === "" ? undefined : Number(targetLeads),
          target_calls_count: targetCalls === "" ? undefined : Number(targetCalls),
          priorities,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to submit plan");
      }

      toast.success("Work of the Day plan submitted! Admin has been notified.");
      setWorkDayOpen(false);
      fetchReportData(true);
    } catch (err: any) {
      toast.error(err.message || "Failed to submit plan");
    } finally {
      setSubmittingAction(false);
    }
  };

  // Handle Work Done Report submit
  const handleSaveWorkDone = async () => {
    if (!summaryText.trim()) {
      toast.error("Please enter your daily work summary");
      return;
    }

    try {
      setSubmittingAction(true);
      const res = await fetch("/api/reports/agent/work", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "work_done_report",
          date: selectedDate,
          summary_text: summaryText,
          accomplishments,
          challenges,
          tomorrow_plan: tomorrowPlan,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to submit work done report");
      }

      toast.success("Work Done Report submitted! Admin has received your update.");
      setWorkDoneOpen(false);
      fetchReportData(true);
    } catch (err: any) {
      toast.error(err.message || "Failed to submit work done report");
    } finally {
      setSubmittingAction(false);
    }
  };

  // Handle Admin Review submit
  const handleSaveAdminReview = async () => {
    if (!selectedAgentId || selectedAgentId === "all") {
      toast.error("Please select an individual agent to review");
      return;
    }

    try {
      setSubmittingAction(true);
      const res = await fetch("/api/reports/agent/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId: selectedAgentId,
          date: selectedDate,
          status: reviewStatus,
          feedback: reviewFeedback,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to submit review");
      }

      toast.success("Review and feedback submitted to agent!");
      setReviewOpen(false);
      fetchReportData(true);
    } catch (err: any) {
      toast.error(err.message || "Failed to submit review");
    } finally {
      setSubmittingAction(false);
    }
  };

  // Open modals prefilled
  const openWorkDayModal = () => {
    const activeRep = selectedAgentId === caller?.userId ? currentReport : callerReport;
    if (activeRep?.work_of_the_day) {
      setPlanText(activeRep.work_of_the_day.plan_text || "");
      setTargetLeads(activeRep.work_of_the_day.target_leads_count ?? "");
      setTargetCalls(activeRep.work_of_the_day.target_calls_count ?? "");
      setPriorities(activeRep.work_of_the_day.priorities || "");
    } else {
      setPlanText("");
      setTargetLeads("");
      setTargetCalls("");
      setPriorities("");
    }
    setWorkDayOpen(true);
  };

  const openWorkDoneModal = () => {
    const activeRep = selectedAgentId === caller?.userId ? currentReport : callerReport;
    if (activeRep?.work_done_report) {
      setSummaryText(activeRep.work_done_report.summary_text || "");
      setAccomplishments(activeRep.work_done_report.accomplishments || "");
      setChallenges(activeRep.work_done_report.challenges || "");
      setTomorrowPlan(activeRep.work_done_report.tomorrow_plan || "");
    } else {
      setSummaryText("");
      setAccomplishments("");
      setChallenges("");
      setTomorrowPlan("");
    }
    setWorkDoneOpen(true);
  };

  const openReviewModal = () => {
    if (currentReport?.admin_review) {
      setReviewStatus(
        currentReport.admin_review.status === "needs_attention"
          ? "needs_attention"
          : "approved"
      );
      setReviewFeedback(currentReport.admin_review.feedback || "");
    } else {
      setReviewStatus("approved");
      setReviewFeedback("");
    }
    setReviewOpen(true);
  };

  // Filter notes
  const filteredNotes = useMemo(() => {
    if (!notesFilter.trim()) return notes;
    const q = notesFilter.toLowerCase();
    return notes.filter(
      (n) =>
        n.lead_name.toLowerCase().includes(q) ||
        n.lead_phone.includes(q) ||
        n.course.toLowerCase().includes(q) ||
        n.college.toLowerCase().includes(q) ||
        n.text.toLowerCase().includes(q) ||
        n.author_name.toLowerCase().includes(q)
    );
  }, [notes, notesFilter]);

  // Compute team overview aggregates
  const teamStats = useMemo(() => {
    let clockedIn = 0;
    let clockedOut = 0;
    let notStarted = 0;
    let workDaySubmitted = 0;
    let workDoneSubmitted = 0;
    let totalNotes = notes.length;

    const reportValues = Object.values(allReports);
    for (const r of reportValues) {
      if (r.session_status === "clocked_in") clockedIn++;
      else if (r.session_status === "clocked_out") clockedOut++;
      else notStarted++;

      if (r.work_of_the_day) workDaySubmitted++;
      if (r.work_done_report) workDoneSubmitted++;
    }

    return {
      clockedIn,
      clockedOut,
      notStarted,
      workDaySubmitted,
      workDoneSubmitted,
      totalNotes,
      totalAgents: teamMembers.length,
    };
  }, [allReports, notes, teamMembers]);

  // Helper date shortcuts
  const setQuickDate = (type: "today" | "yesterday") => {
    const d = new Date();
    if (type === "yesterday") {
      d.setDate(d.getDate() - 1);
    }
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    setSelectedDate(`${y}-${m}-${day}`);
  };

  const isToday = useMemo(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return selectedDate === `${y}-${m}-${d}`;
  }, [selectedDate]);

  const selectedMember = teamMembers.find((m) => m.userId === selectedAgentId);

  return (
    <div className="space-y-6 p-4 md:p-8 max-w-7xl mx-auto">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border/40 pb-5">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-primary/10 text-primary border border-primary/20 shadow-sm">
              <ClipboardList className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
                Agent Work & Activity Reports
                <Badge variant="outline" className="text-xs bg-emerald-500/10 text-emerald-600 border-emerald-500/20 font-medium">
                  Live Attendance
                </Badge>
              </h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                Track login/logout time, counselor notes, morning day plans, and end-of-day work summaries.
              </p>
            </div>
          </div>
        </div>

        {/* Date Selector & Refresh */}
        <div className="flex items-center flex-wrap gap-2.5">
          <div className="inline-flex items-center rounded-lg border border-border bg-card p-1 text-sm shadow-sm">
            <Button
              variant={isToday ? "secondary" : "ghost"}
              size="sm"
              className={cn("h-8 text-xs font-medium", isToday && "bg-primary text-primary-foreground hover:bg-primary/90")}
              onClick={() => setQuickDate("today")}
            >
              Today
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs font-medium"
              onClick={() => setQuickDate("yesterday")}
            >
              Yesterday
            </Button>
          </div>

          <div className="flex items-center gap-2 bg-card border border-border px-3 py-1.5 rounded-lg shadow-sm">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-transparent text-sm focus:outline-none text-foreground font-medium cursor-pointer"
            />
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchReportData(true)}
            disabled={refreshing}
            className="h-9 gap-1.5 shadow-sm"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin text-primary")} />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
        </div>
      </div>

      {/* Clock In / Out Quick Action Bar for Current User */}
      <Card className="border-border/60 bg-gradient-to-r from-card via-card to-muted/30 shadow-sm overflow-hidden">
        <CardContent className="p-4 md:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className={cn(
              "h-12 w-12 rounded-2xl flex items-center justify-center font-bold text-lg shadow-sm transition-all",
              callerReport?.session_status === "clocked_in"
                ? "bg-emerald-500/15 text-emerald-600 border border-emerald-500/30"
                : callerReport?.session_status === "clocked_out"
                ? "bg-slate-500/15 text-slate-600 border border-slate-500/30"
                : "bg-amber-500/15 text-amber-600 border border-amber-500/30"
            )}>
              <Clock className="h-6 w-6" />
            </div>

            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-foreground text-base">
                  {caller?.name || "Your Session"}
                </span>
                {callerReport?.session_status === "clocked_in" ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-600 border border-emerald-500/30">
                    <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                    Currently Active (Clocked In)
                  </span>
                ) : callerReport?.session_status === "clocked_out" ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-muted text-muted-foreground border border-border">
                    <span className="h-2 w-2 rounded-full bg-muted-foreground/60" />
                    Shift Ended (Clocked Out)
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-500/10 text-amber-600 border border-amber-500/20">
                    <span className="h-2 w-2 rounded-full bg-amber-500" />
                    Not Started Today
                  </span>
                )}
              </div>

              <div className="flex items-center flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground mt-1">
                <span>
                  Login:{" "}
                  <strong className="text-foreground">
                    {callerReport?.clock_in_at
                      ? new Date(callerReport.clock_in_at).toLocaleTimeString("en-IN", {
                          hour: "2-digit",
                          minute: "2-digit",
                          hour12: true,
                        })
                      : "—"}
                  </strong>
                </span>
                <span>•</span>
                <span>
                  Logout:{" "}
                  <strong className="text-foreground">
                    {callerReport?.clock_out_at
                      ? new Date(callerReport.clock_out_at).toLocaleTimeString("en-IN", {
                          hour: "2-digit",
                          minute: "2-digit",
                          hour12: true,
                        })
                      : "—"}
                  </strong>
                </span>
                <span>•</span>
                <span>
                  Duration:{" "}
                  <strong className="text-foreground">
                    {callerReport?.total_working_minutes
                      ? `${Math.floor(callerReport.total_working_minutes / 60)}h ${
                          callerReport.total_working_minutes % 60
                        }m`
                      : "0m"}
                  </strong>
                </span>
                <span>•</span>
                <span className="capitalize">
                  Location: <strong className="text-foreground">{callerReport?.work_location || "Office"}</strong>
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center flex-wrap gap-2.5">
            {callerReport?.session_status !== "clocked_in" ? (
              <div className="flex items-center gap-2">
                <select
                  value={workLocation}
                  onChange={(e) => setWorkLocation(e.target.value as any)}
                  className="h-9 text-xs rounded-md border border-input bg-background px-2.5 text-foreground focus:outline-none"
                >
                  <option value="office">🏢 Office</option>
                  <option value="remote">🏠 Remote / WFH</option>
                  <option value="field">🚗 On Field</option>
                </select>
                <Button
                  onClick={() => handleClock("clock_in")}
                  disabled={submittingAction}
                  size="sm"
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium gap-1.5 shadow-sm"
                >
                  <LogIn className="h-4 w-4" />
                  Clock In
                </Button>
              </div>
            ) : (
              <Button
                onClick={() => handleClock("clock_out")}
                disabled={submittingAction}
                variant="destructive"
                size="sm"
                className="font-medium gap-1.5 shadow-sm"
              >
                <LogOut className="h-4 w-4" />
                Clock Out
              </Button>
            )}

            <Button
              onClick={openWorkDayModal}
              variant="outline"
              size="sm"
              className="gap-1.5 border-primary/30 text-primary hover:bg-primary/10"
            >
              <FileText className="h-3.5 w-3.5" />
              {callerReport?.work_of_the_day ? "Edit Day Plan" : "Submit Day Plan"}
            </Button>

            <Button
              onClick={openWorkDoneModal}
              variant="outline"
              size="sm"
              className="gap-1.5 border-indigo-500/30 text-indigo-600 hover:bg-indigo-500/10"
            >
              <TrendingUp className="h-3.5 w-3.5" />
              {callerReport?.work_done_report ? "Edit EOD Report" : "Submit Work Done"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Admin Team Overview Strip (if admin/owner) */}
      {caller?.isAdmin && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
          <Card className="border-border/60 bg-card/60 shadow-xs">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground">Clocked In Now</p>
                <div className="flex items-baseline gap-1 mt-1">
                  <span className="text-2xl font-bold text-emerald-600">{teamStats.clockedIn}</span>
                  <span className="text-xs text-muted-foreground">/ {teamStats.totalAgents}</span>
                </div>
              </div>
              <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-600">
                <UserCheck className="h-5 w-5" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/60 bg-card/60 shadow-xs">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground">Morning Plans</p>
                <div className="flex items-baseline gap-1 mt-1">
                  <span className="text-2xl font-bold text-primary">{teamStats.workDaySubmitted}</span>
                  <span className="text-xs text-muted-foreground">submitted</span>
                </div>
              </div>
              <div className="p-2.5 rounded-xl bg-primary/10 text-primary">
                <FileText className="h-5 w-5" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/60 bg-card/60 shadow-xs">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground">EOD Reports Done</p>
                <div className="flex items-baseline gap-1 mt-1">
                  <span className="text-2xl font-bold text-indigo-600">{teamStats.workDoneSubmitted}</span>
                  <span className="text-xs text-muted-foreground">submitted</span>
                </div>
              </div>
              <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-600">
                <Award className="h-5 w-5" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/60 bg-card/60 shadow-xs">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground">Notes Added Today</p>
                <div className="flex items-baseline gap-1 mt-1">
                  <span className="text-2xl font-bold text-foreground">{teamStats.totalNotes}</span>
                  <span className="text-xs text-muted-foreground">notes</span>
                </div>
              </div>
              <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-600">
                <MessageSquare className="h-5 w-5" />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Agent Selector Rail / Tabs */}
      <div className="flex items-center justify-between gap-4 border-b border-border/50 pb-2 overflow-x-auto">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider shrink-0 mr-1">
            Agent View:
          </span>

          {caller?.isAdmin && (
            <Button
              variant={selectedAgentId === "all" ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedAgentId("all")}
              className={cn("h-8 text-xs font-medium gap-1.5 shadow-xs shrink-0", selectedAgentId === "all" && "bg-primary text-primary-foreground")}
            >
              <Users className="h-3.5 w-3.5" />
              All Team Overview
            </Button>
          )}

          {teamMembers.map((member) => {
            const isSelected = selectedAgentId === member.userId;
            const rep = allReports[member.userId];
            const isClockedIn = rep?.session_status === "clocked_in";

            return (
              <Button
                key={member.userId}
                variant={isSelected ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedAgentId(member.userId)}
                className={cn(
                  "h-8 text-xs font-medium gap-1.5 shrink-0 transition-all",
                  isSelected
                    ? "bg-primary text-primary-foreground shadow-xs"
                    : "hover:bg-muted"
                )}
              >
                <span
                  className={cn(
                    "h-2 w-2 rounded-full",
                    isClockedIn ? "bg-emerald-500 animate-pulse" : "bg-muted-foreground/40"
                  )}
                />
                <span>{member.fullName}</span>
                {member.userId === caller?.userId && (
                  <span className="text-[10px] opacity-75 font-normal">(You)</span>
                )}
              </Button>
            );
          })}
        </div>
      </div>

      {/* Main Content Area */}
      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center gap-3">
          <RefreshCw className="h-7 w-7 text-primary animate-spin" />
          <p className="text-sm text-muted-foreground font-medium">Loading report records...</p>
        </div>
      ) : selectedAgentId === "all" && caller?.isAdmin ? (
        /* ================= ALL AGENTS OVERVIEW TABLE ================= */
        <div className="space-y-6">
          <Card className="border-border/60 shadow-sm overflow-hidden">
            <CardHeader className="bg-muted/20 pb-4">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base font-semibold">Team Attendance & Daily Roster</CardTitle>
                  <CardDescription>
                    Live view of all counselors, shift status, morning plans, and work summary submissions for {selectedDate}.
                  </CardDescription>
                </div>
                <Badge variant="outline" className="font-medium text-xs">
                  {teamMembers.length} Members
                </Badge>
              </div>
            </CardHeader>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="font-semibold text-xs">Agent Name</TableHead>
                    <TableHead className="font-semibold text-xs">Status</TableHead>
                    <TableHead className="font-semibold text-xs">Clock In</TableHead>
                    <TableHead className="font-semibold text-xs">Clock Out</TableHead>
                    <TableHead className="font-semibold text-xs">Duration</TableHead>
                    <TableHead className="font-semibold text-xs">Work of the Day</TableHead>
                    <TableHead className="font-semibold text-xs">Work Done Report</TableHead>
                    <TableHead className="font-semibold text-xs text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {teamMembers.map((member) => {
                    const rep = allReports[member.userId];
                    const isClockedIn = rep?.session_status === "clocked_in";
                    const isClockedOut = rep?.session_status === "clocked_out";

                    return (
                      <TableRow key={member.userId} className="hover:bg-muted/40 transition-colors">
                        <TableCell>
                          <div className="flex items-center gap-2.5">
                            <Avatar className="h-8 w-8 border border-border">
                              <AvatarFallback className="text-xs font-semibold bg-primary/10 text-primary">
                                {member.fullName.slice(0, 2).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <div className="font-medium text-sm text-foreground flex items-center gap-1.5">
                                {member.fullName}
                                {member.userId === caller?.userId && (
                                  <Badge variant="outline" className="text-[10px] py-0 px-1">You</Badge>
                                )}
                              </div>
                              <div className="text-xs text-muted-foreground">{member.email}</div>
                            </div>
                          </div>
                        </TableCell>

                        <TableCell>
                          {isClockedIn ? (
                            <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30 font-medium text-xs gap-1">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                              Clocked In
                            </Badge>
                          ) : isClockedOut ? (
                            <Badge variant="secondary" className="text-xs font-medium text-muted-foreground">
                              Clocked Out
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-xs text-amber-600 border-amber-500/30 bg-amber-500/10">
                              Not Started
                            </Badge>
                          )}
                        </TableCell>

                        <TableCell className="text-xs text-foreground font-medium">
                          {rep?.clock_in_at
                            ? new Date(rep.clock_in_at).toLocaleTimeString("en-IN", {
                                hour: "2-digit",
                                minute: "2-digit",
                                hour12: true,
                              })
                            : "—"}
                        </TableCell>

                        <TableCell className="text-xs text-foreground font-medium">
                          {rep?.clock_out_at
                            ? new Date(rep.clock_out_at).toLocaleTimeString("en-IN", {
                                hour: "2-digit",
                                minute: "2-digit",
                                hour12: true,
                              })
                            : "—"}
                        </TableCell>

                        <TableCell className="text-xs text-foreground font-medium">
                          {rep?.total_working_minutes
                            ? `${Math.floor(rep.total_working_minutes / 60)}h ${
                                rep.total_working_minutes % 60
                              }m`
                            : "0m"}
                        </TableCell>

                        <TableCell className="text-xs max-w-xs truncate">
                          {rep?.work_of_the_day ? (
                            <div className="flex items-center gap-1.5 text-foreground">
                              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                              <span className="truncate">{rep.work_of_the_day.plan_text}</span>
                            </div>
                          ) : (
                            <span className="text-muted-foreground italic">Pending</span>
                          )}
                        </TableCell>

                        <TableCell className="text-xs max-w-xs truncate">
                          {rep?.work_done_report ? (
                            <div className="flex items-center gap-1.5 text-foreground">
                              <CheckCircle2 className="h-3.5 w-3.5 text-indigo-600 shrink-0" />
                              <span className="truncate">{rep.work_done_report.summary_text}</span>
                            </div>
                          ) : (
                            <span className="text-muted-foreground italic">Pending</span>
                          )}
                        </TableCell>

                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 text-xs gap-1 text-primary hover:text-primary hover:bg-primary/10"
                            onClick={() => setSelectedAgentId(member.userId)}
                          >
                            <span>Inspect</span>
                            <ChevronRight className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </Card>

          {/* All Team Notes Timeline */}
          <Card className="border-border/60 shadow-sm">
            <CardHeader className="bg-muted/20 pb-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <MessageSquare className="h-4 w-4 text-primary" />
                    All Counseling Notes Added Today ({filteredNotes.length})
                  </CardTitle>
                  <CardDescription>
                    Real-time feed of all student counseling notes, call records, and follow-ups across the team.
                  </CardDescription>
                </div>
                <div className="relative w-full sm:w-64">
                  <Search className="h-3.5 w-3.5 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
                  <Input
                    placeholder="Search notes, student, course..."
                    value={notesFilter}
                    onChange={(e) => setNotesFilter(e.target.value)}
                    className="h-8 text-xs pl-8 bg-background"
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {filteredNotes.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground text-sm">
                  No notes recorded for {selectedDate}.
                </div>
              ) : (
                <div className="divide-y divide-border/40 max-h-[500px] overflow-y-auto">
                  {filteredNotes.map((note) => (
                    <div key={note.id} className="p-4 hover:bg-muted/30 transition-colors flex flex-col gap-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm text-foreground">{note.lead_name}</span>
                          <span className="text-xs text-muted-foreground">({note.lead_phone})</span>
                          <Badge variant="outline" className="text-[10px] py-0 bg-primary/5 text-primary">
                            {note.course}
                          </Badge>
                          <span className="text-xs text-muted-foreground hidden md:inline">• {note.college}</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Badge variant="secondary" className="text-[10px] font-normal capitalize">
                            By {note.author_name}
                          </Badge>
                          <span className="text-xs text-muted-foreground font-mono">
                            {new Date(note.created_at).toLocaleTimeString("en-IN", {
                              hour: "2-digit",
                              minute: "2-digit",
                              hour12: true,
                            })}
                          </span>
                        </div>
                      </div>
                      <p className="text-xs text-foreground/90 whitespace-pre-wrap bg-muted/40 p-2.5 rounded-lg border border-border/50">
                        {note.text}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      ) : (
        /* ================= INDIVIDUAL AGENT DETAILED REPORT ================= */
        <div className="space-y-6">
          {/* Agent Header Card */}
          <Card className="border-border/60 shadow-sm overflow-hidden">
            <CardContent className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-5 bg-gradient-to-r from-card to-muted/20">
              <div className="flex items-center gap-4">
                <Avatar className="h-14 w-14 border-2 border-primary/20 shadow-xs">
                  <AvatarFallback className="text-lg font-bold bg-primary/10 text-primary">
                    {(selectedMember?.fullName || "Agent").slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <div className="flex items-center gap-2.5">
                    <h2 className="text-xl font-bold text-foreground">
                      {selectedMember?.fullName || "Counselor"}
                    </h2>
                    <Badge variant="outline" className="capitalize text-xs font-medium">
                      {selectedMember?.role || "Agent"}
                    </Badge>
                    {currentReport?.session_status === "clocked_in" ? (
                      <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30 text-xs font-semibold gap-1">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        Clocked In
                      </Badge>
                    ) : currentReport?.session_status === "clocked_out" ? (
                      <Badge variant="secondary" className="text-xs font-medium">
                        Clocked Out
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs text-amber-600 border-amber-500/30 bg-amber-500/10">
                        Not Clocked In
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 flex items-center gap-3">
                    <span>{selectedMember?.email}</span>
                    <span>•</span>
                    <span>Date: <strong>{selectedDate}</strong></span>
                    <span>•</span>
                    <span>Location: <strong className="capitalize">{currentReport?.work_location || "Office"}</strong></span>
                  </p>
                </div>
              </div>

              {/* Attendance Details Strip */}
              <div className="flex items-center flex-wrap gap-4 bg-card/80 border border-border p-3.5 rounded-xl shadow-xs">
                <div>
                  <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Clock In</p>
                  <p className="text-sm font-bold text-foreground mt-0.5">
                    {currentReport?.clock_in_at
                      ? new Date(currentReport.clock_in_at).toLocaleTimeString("en-IN", {
                          hour: "2-digit",
                          minute: "2-digit",
                          hour12: true,
                        })
                      : "—"}
                  </p>
                </div>
                <div className="h-8 w-px bg-border/80" />
                <div>
                  <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Clock Out</p>
                  <p className="text-sm font-bold text-foreground mt-0.5">
                    {currentReport?.clock_out_at
                      ? new Date(currentReport.clock_out_at).toLocaleTimeString("en-IN", {
                          hour: "2-digit",
                          minute: "2-digit",
                          hour12: true,
                        })
                      : "—"}
                  </p>
                </div>
                <div className="h-8 w-px bg-border/80" />
                <div>
                  <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Total Duration</p>
                  <p className="text-sm font-bold text-primary mt-0.5">
                    {currentReport?.total_working_minutes
                      ? `${Math.floor(currentReport.total_working_minutes / 60)}h ${
                          currentReport.total_working_minutes % 60
                        }m`
                      : "0m"}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* CRM System Automated Metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3.5">
            <Card className="border-border/60 bg-card/60 shadow-xs">
              <CardContent className="p-4">
                <p className="text-xs font-medium text-muted-foreground">Notes Added</p>
                <div className="flex items-baseline gap-1 mt-1">
                  <span className="text-2xl font-bold text-primary">
                    {currentReport?.system_metrics.notes_added_count || 0}
                  </span>
                  <span className="text-xs text-muted-foreground">today</span>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/60 bg-card/60 shadow-xs">
              <CardContent className="p-4">
                <p className="text-xs font-medium text-muted-foreground">Assigned Leads</p>
                <div className="flex items-baseline gap-1 mt-1">
                  <span className="text-2xl font-bold text-foreground">
                    {currentReport?.system_metrics.leads_assigned_count || 0}
                  </span>
                  <span className="text-xs text-muted-foreground">total</span>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/60 bg-card/60 shadow-xs">
              <CardContent className="p-4">
                <p className="text-xs font-medium text-muted-foreground">Leads Contacted</p>
                <div className="flex items-baseline gap-1 mt-1">
                  <span className="text-2xl font-bold text-emerald-600">
                    {currentReport?.system_metrics.leads_contacted_count || 0}
                  </span>
                  <span className="text-xs text-muted-foreground">leads</span>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/60 bg-card/60 shadow-xs">
              <CardContent className="p-4">
                <p className="text-xs font-medium text-muted-foreground">Emails Sent</p>
                <div className="flex items-baseline gap-1 mt-1">
                  <span className="text-2xl font-bold text-indigo-600">
                    {currentReport?.system_metrics.emails_sent_count || 0}
                  </span>
                  <span className="text-xs text-muted-foreground">sent</span>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/60 bg-card/60 shadow-xs col-span-2 sm:col-span-1">
              <CardContent className="p-4">
                <p className="text-xs font-medium text-muted-foreground">Conversions</p>
                <div className="flex items-baseline gap-1 mt-1">
                  <span className="text-2xl font-bold text-amber-600">
                    {currentReport?.system_metrics.conversions_count || 0}
                  </span>
                  <span className="text-xs text-muted-foreground">admissions</span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Work of the Day & Work Done Report Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Work of the Day */}
            <Card className="border-border/60 shadow-sm flex flex-col justify-between">
              <div>
                <CardHeader className="bg-muted/15 pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base font-semibold flex items-center gap-2">
                      <FileText className="h-4 w-4 text-primary" />
                      Work of the Day (Morning Plan)
                    </CardTitle>
                    {currentReport?.work_of_the_day ? (
                      <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30 text-xs">
                        Submitted
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-amber-600 border-amber-500/30 text-xs">
                        Pending
                      </Badge>
                    )}
                  </div>
                  <CardDescription>
                    Targets, calls expected, and strategic priorities set for the day.
                  </CardDescription>
                </CardHeader>

                <CardContent className="p-5 space-y-4">
                  {currentReport?.work_of_the_day ? (
                    <>
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-1">Target Plan & Goals:</p>
                        <p className="text-sm text-foreground bg-muted/30 p-3 rounded-lg border border-border/50 whitespace-pre-wrap">
                          {currentReport.work_of_the_day.plan_text}
                        </p>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="p-3 bg-card border border-border rounded-lg">
                          <p className="text-[11px] text-muted-foreground">Target Leads</p>
                          <p className="text-lg font-bold text-foreground">
                            {currentReport.work_of_the_day.target_leads_count ?? "Not specified"}
                          </p>
                        </div>
                        <div className="p-3 bg-card border border-border rounded-lg">
                          <p className="text-[11px] text-muted-foreground">Target Calls</p>
                          <p className="text-lg font-bold text-foreground">
                            {currentReport.work_of_the_day.target_calls_count ?? "Not specified"}
                          </p>
                        </div>
                      </div>

                      {currentReport.work_of_the_day.priorities && (
                        <div>
                          <p className="text-xs font-medium text-muted-foreground mb-1">Top Priorities:</p>
                          <p className="text-xs text-foreground bg-muted/20 p-2.5 rounded-lg border border-border/40">
                            {currentReport.work_of_the_day.priorities}
                          </p>
                        </div>
                      )}

                      <div className="text-[11px] text-muted-foreground">
                        Submitted at:{" "}
                        {new Date(currentReport.work_of_the_day.submitted_at).toLocaleTimeString("en-IN", {
                          hour: "2-digit",
                          minute: "2-digit",
                          hour12: true,
                        })}
                      </div>
                    </>
                  ) : (
                    <div className="py-8 text-center text-muted-foreground text-sm space-y-2">
                      <p>No morning plan submitted for {selectedDate}.</p>
                      {selectedAgentId === caller?.userId && (
                        <Button size="sm" onClick={openWorkDayModal} variant="outline" className="text-xs">
                          Submit Work of the Day
                        </Button>
                      )}
                    </div>
                  )}
                </CardContent>
              </div>

              {selectedAgentId === caller?.userId && currentReport?.work_of_the_day && (
                <CardFooter className="pt-0 pb-4 px-5">
                  <Button variant="ghost" size="sm" onClick={openWorkDayModal} className="text-xs text-primary">
                    Edit Plan
                  </Button>
                </CardFooter>
              )}
            </Card>

            {/* Work Done Report (EOD) */}
            <Card className="border-border/60 shadow-sm flex flex-col justify-between">
              <div>
                <CardHeader className="bg-muted/15 pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base font-semibold flex items-center gap-2">
                      <TrendingUp className="h-4 w-4 text-indigo-600" />
                      Work Done Report (EOD Summary)
                    </CardTitle>
                    {currentReport?.work_done_report ? (
                      <Badge className="bg-indigo-500/15 text-indigo-600 border-indigo-500/30 text-xs">
                        Submitted
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-amber-600 border-amber-500/30 text-xs">
                        Pending
                      </Badge>
                    )}
                  </div>
                  <CardDescription>
                    Summary of tasks completed, accomplishments, and roadmap for tomorrow.
                  </CardDescription>
                </CardHeader>

                <CardContent className="p-5 space-y-4">
                  {currentReport?.work_done_report ? (
                    <>
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-1">Daily Work Done Summary:</p>
                        <p className="text-sm text-foreground bg-muted/30 p-3 rounded-lg border border-border/50 whitespace-pre-wrap">
                          {currentReport.work_done_report.summary_text}
                        </p>
                      </div>

                      {currentReport.work_done_report.accomplishments && (
                        <div>
                          <p className="text-xs font-medium text-emerald-600 mb-1">Key Accomplishments:</p>
                          <p className="text-xs text-foreground bg-emerald-500/5 border border-emerald-500/20 p-2.5 rounded-lg">
                            {currentReport.work_done_report.accomplishments}
                          </p>
                        </div>
                      )}

                      {currentReport.work_done_report.challenges && (
                        <div>
                          <p className="text-xs font-medium text-amber-600 mb-1">Challenges & Roadblocks:</p>
                          <p className="text-xs text-foreground bg-amber-500/5 border border-amber-500/20 p-2.5 rounded-lg">
                            {currentReport.work_done_report.challenges}
                          </p>
                        </div>
                      )}

                      {currentReport.work_done_report.tomorrow_plan && (
                        <div>
                          <p className="text-xs font-medium text-primary mb-1">Plan for Tomorrow:</p>
                          <p className="text-xs text-foreground bg-muted/20 p-2.5 rounded-lg border border-border/40">
                            {currentReport.work_done_report.tomorrow_plan}
                          </p>
                        </div>
                      )}

                      <div className="text-[11px] text-muted-foreground">
                        Submitted at:{" "}
                        {new Date(currentReport.work_done_report.submitted_at).toLocaleTimeString("en-IN", {
                          hour: "2-digit",
                          minute: "2-digit",
                          hour12: true,
                        })}
                      </div>
                    </>
                  ) : (
                    <div className="py-8 text-center text-muted-foreground text-sm space-y-2">
                      <p>No EOD work done report submitted for {selectedDate}.</p>
                      {selectedAgentId === caller?.userId && (
                        <Button size="sm" onClick={openWorkDoneModal} variant="outline" className="text-xs">
                          Submit Work Done Report
                        </Button>
                      )}
                    </div>
                  )}
                </CardContent>
              </div>

              {selectedAgentId === caller?.userId && currentReport?.work_done_report && (
                <CardFooter className="pt-0 pb-4 px-5">
                  <Button variant="ghost" size="sm" onClick={openWorkDoneModal} className="text-xs text-primary">
                    Edit EOD Summary
                  </Button>
                </CardFooter>
              )}
            </Card>
          </div>

          {/* Admin Review & Sign-Off Section */}
          <Card className="border-border/60 shadow-sm bg-gradient-to-r from-card via-card to-primary/5">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <Shield className="h-4 w-4 text-primary" />
                  Admin Oversight & Manager Sign-off
                </CardTitle>
                {caller?.isAdmin && (
                  <Button
                    size="sm"
                    onClick={openReviewModal}
                    className="h-8 text-xs font-medium gap-1.5"
                  >
                    <Check className="h-3.5 w-3.5" />
                    {currentReport?.admin_review ? "Update Review" : "Provide Feedback"}
                  </Button>
                )}
              </div>
              <CardDescription>
                Administrative review, manager feedback, and daily sign-off for this counselor.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-5">
              {currentReport?.admin_review ? (
                <div className="space-y-3 bg-card p-4 rounded-xl border border-border">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm text-foreground">
                        {currentReport.admin_review.reviewed_by_name}
                      </span>
                      {currentReport.admin_review.status === "approved" ? (
                        <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30 text-xs">
                          ✅ Approved
                        </Badge>
                      ) : (
                        <Badge className="bg-amber-500/15 text-amber-600 border-amber-500/30 text-xs">
                          ⚠️ Needs Attention
                        </Badge>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {new Date(currentReport.admin_review.reviewed_at).toLocaleTimeString("en-IN", {
                        hour: "2-digit",
                        minute: "2-digit",
                        hour12: true,
                      })}
                    </span>
                  </div>

                  <p className="text-xs text-foreground/90 whitespace-pre-wrap bg-muted/30 p-3 rounded-lg border border-border/40">
                    {currentReport.admin_review.feedback || "No written feedback provided."}
                  </p>
                </div>
              ) : (
                <div className="py-6 text-center text-muted-foreground text-xs">
                  {caller?.isAdmin
                    ? "You haven't reviewed this agent's daily report yet. Click 'Provide Feedback' above to approve or comment."
                    : "Your daily report is pending administrator review."}
                </div>
              )}
            </CardContent>
          </Card>

          {/* All Notes Added by this Agent Today */}
          <Card className="border-border/60 shadow-sm">
            <CardHeader className="bg-muted/20 pb-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <MessageSquare className="h-4 w-4 text-primary" />
                    Counseling Notes Added by {selectedMember?.fullName || "Agent"} ({filteredNotes.length})
                  </CardTitle>
                  <CardDescription>
                    All notes logged during student counseling sessions, call inquiries, and follow-ups on {selectedDate}.
                  </CardDescription>
                </div>
                <div className="relative w-full sm:w-64">
                  <Search className="h-3.5 w-3.5 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
                  <Input
                    placeholder="Search notes..."
                    value={notesFilter}
                    onChange={(e) => setNotesFilter(e.target.value)}
                    className="h-8 text-xs pl-8 bg-background"
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {filteredNotes.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground text-sm">
                  No notes recorded by {selectedMember?.fullName || "this agent"} on {selectedDate}.
                </div>
              ) : (
                <div className="divide-y divide-border/40 max-h-[500px] overflow-y-auto">
                  {filteredNotes.map((note) => (
                    <div key={note.id} className="p-4 hover:bg-muted/30 transition-colors flex flex-col gap-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm text-foreground">{note.lead_name}</span>
                          <span className="text-xs text-muted-foreground font-mono">({note.lead_phone})</span>
                          <Badge variant="outline" className="text-[10px] py-0 bg-primary/5 text-primary">
                            {note.course}
                          </Badge>
                          <span className="text-xs text-muted-foreground hidden sm:inline">• {note.college}</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Badge variant="secondary" className="text-[10px] font-normal capitalize">
                            {note.author_name}
                          </Badge>
                          <span className="text-xs text-muted-foreground font-mono">
                            {new Date(note.created_at).toLocaleTimeString("en-IN", {
                              hour: "2-digit",
                              minute: "2-digit",
                              hour12: true,
                            })}
                          </span>
                        </div>
                      </div>
                      <p className="text-xs text-foreground/90 whitespace-pre-wrap bg-muted/40 p-2.5 rounded-lg border border-border/50">
                        {note.text}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ================= MODAL: WORK OF THE DAY ================= */}
      <Dialog open={workDayOpen} onOpenChange={setWorkDayOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              Work of the Day (Morning Target Plan)
            </DialogTitle>
            <DialogDescription>
              Submit your focus goals, expected leads to contact, and priorities for {selectedDate}.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <label className="text-xs font-semibold text-foreground mb-1 block">
                Today&apos;s Plan & Objectives *
              </label>
              <Textarea
                placeholder="e.g. Follow up on 20 MBA admissions leads, conduct 5 counseling callbacks..."
                value={planText}
                onChange={(e) => setPlanText(e.target.value)}
                rows={3}
                className="text-xs"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-foreground mb-1 block">
                  Target Leads
                </label>
                <Input
                  type="number"
                  placeholder="e.g. 25"
                  value={targetLeads}
                  onChange={(e) => setTargetLeads(e.target.value === "" ? "" : Number(e.target.value))}
                  className="h-8 text-xs"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-foreground mb-1 block">
                  Target Calls
                </label>
                <Input
                  type="number"
                  placeholder="e.g. 15"
                  value={targetCalls}
                  onChange={(e) => setTargetCalls(e.target.value === "" ? "" : Number(e.target.value))}
                  className="h-8 text-xs"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-foreground mb-1 block">
                Key Priorities
              </label>
              <Input
                placeholder="e.g. High priority MBBS leads from Bangalore campaign"
                value={priorities}
                onChange={(e) => setPriorities(e.target.value)}
                className="h-8 text-xs"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setWorkDayOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSaveWorkOfTheDay}
              disabled={submittingAction}
              className="gap-1.5"
            >
              <Send className="h-3.5 w-3.5" />
              Save & Notify Admin
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ================= MODAL: WORK DONE REPORT ================= */}
      <Dialog open={workDoneOpen} onOpenChange={setWorkDoneOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-indigo-600" />
              Work Done Report (End-of-Day Summary)
            </DialogTitle>
            <DialogDescription>
              Record your daily achievements, challenges, and plan for tomorrow for {selectedDate}.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <label className="text-xs font-semibold text-foreground mb-1 block">
                Work Done Summary *
              </label>
              <Textarea
                placeholder="Summary of all calls made, students counseled, documents collected..."
                value={summaryText}
                onChange={(e) => setSummaryText(e.target.value)}
                rows={3}
                className="text-xs"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-foreground mb-1 block">
                Key Accomplishments
              </label>
              <Input
                placeholder="e.g. 3 students confirmed admission token for B.Tech CSE"
                value={accomplishments}
                onChange={(e) => setAccomplishments(e.target.value)}
                className="h-8 text-xs"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-foreground mb-1 block">
                Challenges Faced
              </label>
              <Input
                placeholder="e.g. 4 leads requested fee concession beyond standard range"
                value={challenges}
                onChange={(e) => setChallenges(e.target.value)}
                className="h-8 text-xs"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-foreground mb-1 block">
                Plan for Tomorrow
              </label>
              <Input
                placeholder="e.g. Scheduled callbacks at 11 AM with parents from Hyderabad"
                value={tomorrowPlan}
                onChange={(e) => setTomorrowPlan(e.target.value)}
                className="h-8 text-xs"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setWorkDoneOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSaveWorkDone}
              disabled={submittingAction}
              className="bg-indigo-600 hover:bg-indigo-700 text-white gap-1.5"
            >
              <Send className="h-3.5 w-3.5" />
              Submit EOD Report
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ================= MODAL: ADMIN REVIEW & FEEDBACK ================= */}
      <Dialog open={reviewOpen} onOpenChange={setReviewOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              Manager Review & Sign-off
            </DialogTitle>
            <DialogDescription>
              Provide sign-off and feedback for {selectedMember?.fullName || "Agent"}&apos;s work on {selectedDate}.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <label className="text-xs font-semibold text-foreground mb-1.5 block">
                Review Decision *
              </label>
              <div className="grid grid-cols-2 gap-3">
                <Button
                  type="button"
                  variant={reviewStatus === "approved" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setReviewStatus("approved")}
                  className={cn(
                    "h-9 text-xs font-semibold gap-1.5",
                    reviewStatus === "approved" && "bg-emerald-600 hover:bg-emerald-700 text-white"
                  )}
                >
                  <CheckCircle2 className="h-4 w-4" />
                  Approve Report
                </Button>
                <Button
                  type="button"
                  variant={reviewStatus === "needs_attention" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setReviewStatus("needs_attention")}
                  className={cn(
                    "h-9 text-xs font-semibold gap-1.5",
                    reviewStatus === "needs_attention" && "bg-amber-600 hover:bg-amber-700 text-white"
                  )}
                >
                  <AlertCircle className="h-4 w-4" />
                  Needs Attention
                </Button>
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-foreground mb-1 block">
                Feedback & Instructions for Counselor
              </label>
              <Textarea
                placeholder="e.g. Great job on the 3 admissions. Make sure to follow up on the pending callbacks by 11 AM..."
                value={reviewFeedback}
                onChange={(e) => setReviewFeedback(e.target.value)}
                rows={3}
                className="text-xs"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setReviewOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSaveAdminReview}
              disabled={submittingAction}
              className="gap-1.5"
            >
              <Check className="h-3.5 w-3.5" />
              Submit Review
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
