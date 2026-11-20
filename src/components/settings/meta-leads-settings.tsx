"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  Share2,
  Copy,
  Check,
  Zap,
  Play,
  Loader2,
  ExternalLink,
  MessageSquare,
  ShieldCheck,
  HelpCircle,
  Clock,
  User,
  Phone,
  Mail,
  Tag,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

interface MetaLeadConfig {
  id: string;
  is_enabled: boolean;
  page_id: string;
  page_name: string;
  has_page_token: boolean;
  verify_token: string;
  auto_whatsapp_enabled: boolean;
  auto_template_id: string;
  auto_template_name: string;
  auto_tag: string;
}

interface TemplateOption {
  id: string;
  name: string;
  status: string;
  category: string;
  language: string;
}

interface LeadLog {
  id: string;
  leadgen_id: string | null;
  form_name: string | null;
  full_name: string | null;
  phone: string;
  email: string | null;
  status: string;
  whatsapp_sent: boolean;
  error_message: string | null;
  created_at: string;
  contact_id: string | null;
}

export function MetaLeadsSettings() {
  const [config, setConfig] = useState<MetaLeadConfig | null>(null);
  const [webhookUrl, setWebhookUrl] = useState("");
  const [templates, setTemplates] = useState<TemplateOption[]>([]);
  const [recentLeads, setRecentLeads] = useState<LeadLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Form states
  const [autoWhatsapp, setAutoWhatsapp] = useState(false);
  const [selectedTemplateName, setSelectedTemplateName] = useState("");
  const [autoTag, setAutoTag] = useState("Meta Lead");
  const [pageId, setPageId] = useState("");
  const [pageAccessToken, setPageAccessToken] = useState("");

  // Test Lead Simulator state
  const [testName, setTestName] = useState("Amit Kumar");
  const [testPhone, setTestPhone] = useState("+919876543210");
  const [testEmail, setTestEmail] = useState("amit.kumar@example.com");
  const [testFormName, setTestFormName] = useState("Instagram Counseling Ad Form");
  const [simulating, setSimulating] = useState(false);

  const fetchConfig = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/account/leads", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      if (data.config) {
        setConfig(data.config);
        setAutoWhatsapp(data.config.auto_whatsapp_enabled);
        setSelectedTemplateName(data.config.auto_template_name || "");
        setAutoTag(data.config.auto_tag || "Meta Lead");
        setPageId(data.config.page_id || "");
      }
      if (data.webhookUrl) setWebhookUrl(data.webhookUrl);
      if (Array.isArray(data.templates)) setTemplates(data.templates);
      if (Array.isArray(data.recentLeads)) setRecentLeads(data.recentLeads);
    } catch (err) {
      console.error("Failed to fetch lead config:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConfig();
  }, []);

  const handleCopy = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    toast.success("Copied to clipboard!");
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const res = await fetch("/api/account/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          auto_whatsapp_enabled: autoWhatsapp,
          auto_template_name: selectedTemplateName,
          auto_tag: autoTag,
          page_id: pageId,
          page_access_token: pageAccessToken || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to save settings");
        return;
      }

      toast.success("Meta Lead Ads configuration saved!");
      setPageAccessToken("");
      fetchConfig();
    } catch (err) {
      console.error("Error saving lead config:", err);
      toast.error("Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  const handleSimulateTest = async () => {
    if (!testPhone.trim()) {
      toast.error("Please provide a phone number with country code");
      return;
    }

    try {
      setSimulating(true);
      toast.loading("Simulating Meta Instant Form lead...", { id: "test-lead" });

      const res = await fetch("/api/account/leads/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: testName,
          phone: testPhone,
          email: testEmail,
          formName: testFormName,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to simulate lead", { id: "test-lead" });
        return;
      }

      toast.success("Lead created successfully!", { id: "test-lead" });
      fetchConfig();
    } catch (err) {
      console.error("Test lead failed:", err);
      toast.error("Failed to simulate test lead", { id: "test-lead" });
    } finally {
      setSimulating(false);
    }
  };

  if (loading && !config) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Overview Banner */}
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-5">
          <div className="flex items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
              <Share2 className="size-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
                Meta Instant Forms (Lead Ads)
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-500">
                  <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Live Webhook Ready
                </span>
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Automatically capture leads from Facebook & Instagram Instant Forms and trigger instant WhatsApp replies.
              </p>
            </div>
          </div>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={saving}
            className="cursor-pointer shrink-0"
          >
            {saving ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : null}
            Save Settings
          </Button>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Webhook Configuration Card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <ShieldCheck className="size-4 text-primary" />
              Meta Webhook Credentials
            </CardTitle>
            <CardDescription className="text-xs">
              Paste these details in Meta Business Suite or Meta Developer Webhooks for the <code>leadgen</code> event.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Callback / Webhook URL</Label>
              <div className="flex gap-2">
                <Input
                  readOnly
                  value={webhookUrl}
                  className="font-mono text-xs bg-muted/40 selection:bg-primary/20"
                />
                <Button
                  size="icon"
                  variant="outline"
                  type="button"
                  onClick={() => handleCopy(webhookUrl, "url")}
                  title="Copy URL"
                  className="shrink-0 cursor-pointer"
                >
                  {copiedField === "url" ? (
                    <Check className="size-4 text-emerald-500" />
                  ) : (
                    <Copy className="size-4" />
                  )}
                </Button>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Verify Token</Label>
              <div className="flex gap-2">
                <Input
                  readOnly
                  value={config?.verify_token || "wacrm_meta_leads"}
                  className="font-mono text-xs bg-muted/40 selection:bg-primary/20"
                />
                <Button
                  size="icon"
                  variant="outline"
                  type="button"
                  onClick={() => handleCopy(config?.verify_token || "wacrm_meta_leads", "token")}
                  title="Copy Token"
                  className="shrink-0 cursor-pointer"
                >
                  {copiedField === "token" ? (
                    <Check className="size-4 text-emerald-500" />
                  ) : (
                    <Copy className="size-4" />
                  )}
                </Button>
              </div>
            </div>

            {/* Quick Setup Instructions */}
            <div className="rounded-lg border border-border/80 bg-muted/30 p-3 text-xs space-y-1.5">
              <div className="font-semibold text-foreground flex items-center gap-1.5">
                <HelpCircle className="size-3.5 text-primary" />
                How to link in Meta Business / Developers:
              </div>
              <ol className="list-decimal pl-4 space-y-1 text-muted-foreground">
                <li>Go to <strong>developers.facebook.com</strong> → Your App → <strong>Webhooks</strong>.</li>
                <li>Select <strong>Page</strong> in the dropdown and click <strong>Subscribe to this object</strong>.</li>
                <li>Paste the <strong>Callback URL</strong> and <strong>Verify Token</strong> from above.</li>
                <li>Subscribe to the <strong>leadgen</strong> field.</li>
              </ol>
            </div>
          </CardContent>
        </Card>

        {/* WhatsApp Auto-Reply & Tagging Card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Zap className="size-4 text-amber-500" />
              Instant WhatsApp Automation
            </CardTitle>
            <CardDescription className="text-xs">
              Reach leads within 10 seconds of form submission while their interest is at its peak.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between rounded-lg border border-border/80 p-3 bg-card">
              <div className="space-y-0.5">
                <Label htmlFor="auto-wa" className="text-xs font-semibold text-foreground">
                  Send Instant WhatsApp Message
                </Label>
                <p className="text-[11px] text-muted-foreground">
                  Trigger an approved WhatsApp template when a new lead submits the form.
                </p>
              </div>
              <Switch
                id="auto-wa"
                checked={autoWhatsapp}
                onCheckedChange={setAutoWhatsapp}
              />
            </div>

            {autoWhatsapp && (
              <div className="space-y-1.5 animate-in fade-in-50">
                <Label className="text-xs">Select WhatsApp Template</Label>
                {templates.length > 0 ? (
                  <select
                    value={selectedTemplateName}
                    onChange={(e) => setSelectedTemplateName(e.target.value)}
                    className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-xs shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    <option value="">-- Choose an approved template --</option>
                    {templates.map((tpl) => (
                      <option key={tpl.id} value={tpl.name}>
                        {tpl.name} ({tpl.language}) - {tpl.category}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="rounded-md border border-dashed p-2 text-center text-xs text-muted-foreground">
                    No approved WhatsApp templates found.{" "}
                    <Link href="/settings?tab=templates" className="text-primary hover:underline">
                      Create one in Templates
                    </Link>
                  </div>
                )}
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs">Auto-Applied Tag</Label>
              <div className="relative">
                <Tag className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
                <Input
                  value={autoTag}
                  onChange={(e) => setAutoTag(e.target.value)}
                  placeholder="e.g. Meta Lead, FB Ads, Study Abroad"
                  className="pl-8 text-xs"
                />
              </div>
            </div>

            <div className="space-y-1.5 pt-2 border-t border-border/50">
              <Label className="text-xs text-muted-foreground">
                Page ID & Page Access Token (Optional)
              </Label>
              <Input
                value={pageId}
                onChange={(e) => setPageId(e.target.value)}
                placeholder="Facebook Page ID (e.g. 1029384756)"
                className="text-xs font-mono"
              />
              <Input
                type="password"
                value={pageAccessToken}
                onChange={(e) => setPageAccessToken(e.target.value)}
                placeholder={config?.has_page_token ? "●●●●●●●● (Token configured - enter new to change)" : "Page Access Token for Graph API lead decryption"}
                className="text-xs font-mono"
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 1-Click Test Simulator Card */}
      <Card className="border-emerald-500/30 bg-emerald-500/5">
        <CardHeader>
          <CardTitle className="text-sm font-semibold flex items-center gap-2 text-foreground">
            <Play className="size-4 text-emerald-500" />
            1-Click Lead Simulator (Test Without Real Ads)
          </CardTitle>
          <CardDescription className="text-xs">
            Verify your contact creation, tagging, and WhatsApp auto-reply right now with one click.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">Full Name</Label>
              <Input
                value={testName}
                onChange={(e) => setTestName(e.target.value)}
                className="text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">WhatsApp Number</Label>
              <Input
                value={testPhone}
                onChange={(e) => setTestPhone(e.target.value)}
                placeholder="+91..."
                className="text-xs font-mono"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">Email</Label>
              <Input
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
                className="text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">Form Name</Label>
              <Input
                value={testFormName}
                onChange={(e) => setTestFormName(e.target.value)}
                className="text-xs"
              />
            </div>
          </div>
        </CardContent>
        <CardFooter className="flex justify-end pt-0">
          <Button
            size="sm"
            onClick={handleSimulateTest}
            disabled={simulating}
            className="cursor-pointer bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {simulating ? (
              <Loader2 className="mr-1.5 size-4 animate-spin" />
            ) : (
              <Play className="mr-1.5 size-4" />
            )}
            Simulate Instant Lead
          </Button>
        </CardFooter>
      </Card>

      {/* Live Recent Leads Activity */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <div>
            <CardTitle className="text-sm font-semibold">Recent Meta Leads</CardTitle>
            <CardDescription className="text-xs">
              Live log of incoming Meta form submissions and auto-messaging status.
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchConfig}
            className="h-8 text-xs cursor-pointer"
          >
            Refresh Feed
          </Button>
        </CardHeader>
        <CardContent>
          {recentLeads.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-8 text-center text-muted-foreground border border-dashed rounded-xl">
              <Share2 className="size-8 opacity-40 mb-2" />
              <p className="text-xs font-medium">No leads received yet</p>
              <p className="text-[11px] mt-0.5">
                Use the simulator above or link your Meta form to see live leads appear here.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border/60 rounded-xl border border-border/80 overflow-hidden">
              {recentLeads.map((lead) => (
                <div
                  key={lead.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 text-xs hover:bg-muted/30 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <User className="size-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-foreground truncate">
                          {lead.full_name || "Meta Lead"}
                        </span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-muted text-muted-foreground border">
                          {lead.form_name || "Instant Form"}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-muted-foreground mt-0.5 font-mono text-[11px]">
                        <span className="flex items-center gap-1">
                          <Phone className="size-3" />
                          {lead.phone}
                        </span>
                        {lead.email && (
                          <span className="hidden sm:flex items-center gap-1 font-sans">
                            <Mail className="size-3" />
                            {lead.email}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                    <div className="text-right">
                      {lead.whatsapp_sent ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-500">
                          <Check className="size-3" />
                          WhatsApp Sent
                        </span>
                      ) : (
                        <span className="text-[11px] text-muted-foreground">
                          {lead.status === "processed" ? "Captured" : lead.status}
                        </span>
                      )}
                      <div className="text-[10px] text-muted-foreground flex items-center gap-1 justify-end">
                        <Clock className="size-2.5" />
                        {new Date(lead.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </div>
                    </div>

                    <Link
                      href={`/inbox?search=${encodeURIComponent(lead.phone)}`}
                      className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg border border-border bg-card hover:bg-muted text-xs font-medium text-foreground transition-colors"
                    >
                      <MessageSquare className="size-3.5 text-primary" />
                      Chat
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
