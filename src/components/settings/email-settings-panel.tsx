'use client';

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import {
  Mail,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  Send,
  Loader2,
  Sparkles,
  ExternalLink,
  Info,
  Flame,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';

interface EmailConfigData {
  provider: 'resend';
  apiKey: string;
  fromEmail: string;
  replyToEmail?: string;
  autoEmailEnabled: boolean;
  subjectTemplate: string;
  hasApiKey: boolean;
  isEnvConfigured: boolean;
}

export function EmailSettingsPanel() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);

  const [apiKey, setApiKey] = useState('');
  const [hasExistingKey, setHasExistingKey] = useState(false);
  const [fromEmail, setFromEmail] = useState('GEMS Admissions <onboarding@resend.dev>');
  const [replyToEmail, setReplyToEmail] = useState('');
  const [autoEmailEnabled, setAutoEmailEnabled] = useState(true);
  const [subjectTemplate, setSubjectTemplate] = useState(
    'Welcome to {{college}} — {{course}} Admissions {{year}}'
  );
  const [isEnvConfigured, setIsEnvConfigured] = useState(false);

  const [testRecipient, setTestRecipient] = useState('');
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  useEffect(() => {
    async function loadConfig() {
      try {
        setLoading(true);
        const res = await fetch('/api/email/config');
        if (res.ok) {
          const data: EmailConfigData = await res.json();
          setHasExistingKey(data.hasApiKey);
          setFromEmail(data.fromEmail || 'GEMS Admissions <onboarding@resend.dev>');
          setReplyToEmail(data.replyToEmail || '');
          setAutoEmailEnabled(data.autoEmailEnabled);
          setSubjectTemplate(data.subjectTemplate || 'Welcome to {{college}} — {{course}} Admissions {{year}}');
          setIsEnvConfigured(data.isEnvConfigured);
        }
      } catch (err) {
        console.error('Failed to load email config:', err);
        toast.error('Failed to load email configuration');
      } finally {
        setLoading(false);
      }
    }

    loadConfig();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSaving(true);
      const payload: Record<string, unknown> = {
        fromEmail,
        replyToEmail: replyToEmail.trim() || undefined,
        autoEmailEnabled,
        subjectTemplate,
      };

      if (apiKey.trim()) {
        payload.apiKey = apiKey.trim();
      }

      const res = await fetch('/api/email/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to save settings');
      }

      toast.success('Email settings saved successfully');
      setHasExistingKey(true);
      setApiKey(''); // Clear raw key input after saving
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleSendTest = async () => {
    if (!testRecipient.trim() || !testRecipient.includes('@')) {
      toast.error('Please enter a valid email address for the test');
      return;
    }

    try {
      setTesting(true);
      setTestResult(null);

      const res = await fetch('/api/email/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: testRecipient.trim(),
          testRecipient: testRecipient.trim(),
          apiKey: apiKey.trim() || undefined,
          fromEmail: fromEmail.trim() || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to send test email');
      }

      setTestResult({
        success: true,
        message: `Test email sent successfully to ${testRecipient}! Message ID: ${data.id}`,
      });
      toast.success(`Test email sent to ${testRecipient}!`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setTestResult({
        success: false,
        message: msg,
      });
      toast.error(`Email test failed: ${msg}`);
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[300px] items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const isConfigured = hasExistingKey || isEnvConfigured;

  return (
    <div className="space-y-6">
      {/* Header & Status Card */}
      <Card className="border-border">
        <CardHeader className="pb-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <div className="flex size-9 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400">
                  <Mail className="size-5" />
                </div>
                <CardTitle className="text-xl">Email Delivery (Resend API)</CardTitle>
              </div>
              <CardDescription>
                Deliver automated admissions welcome emails and counselor introductions to incoming student leads.
              </CardDescription>
            </div>
            <div>
              {isConfigured ? (
                <Badge variant="outline" className="gap-1.5 border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-emerald-700 dark:text-emerald-400">
                  <CheckCircle2 className="size-3.5" />
                  Resend Connected
                </Badge>
              ) : (
                <Badge variant="outline" className="gap-1.5 border-amber-500/30 bg-amber-500/10 px-3 py-1 text-amber-700 dark:text-amber-400">
                  <AlertCircle className="size-3.5" />
                  Not Configured
                </Badge>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent>
          <div className="flex items-start gap-3 rounded-lg border border-blue-500/20 bg-blue-500/5 p-3.5 text-xs text-blue-900 dark:text-blue-200">
            <Info className="mt-0.5 size-4 shrink-0 text-blue-600 dark:text-blue-400" />
            <div className="space-y-1">
              <p className="font-medium">Free & Reliable Resend Integration</p>
              <p className="text-muted-foreground">
                Resend gives 100 free emails per day with high deliverability. Get your free API key at{' '}
                <a
                  href="https://resend.com/api-keys"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 font-medium text-blue-600 underline hover:text-blue-500 dark:text-blue-400"
                >
                  resend.com/api-keys <ExternalLink className="size-3" />
                </a>
                . No credit card required.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Main Settings Form */}
      <form onSubmit={handleSave} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Credentials & Sender Setup</CardTitle>
            <CardDescription>Configure your Resend API token and sender identity.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* API Key */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="resend-api-key">Resend API Key</Label>
                {hasExistingKey && (
                  <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                    ✓ API Key configured
                  </span>
                )}
              </div>
              <div className="relative">
                <Input
                  id="resend-api-key"
                  type={showApiKey ? 'text' : 'password'}
                  placeholder={hasExistingKey ? '•••••••••••••••••••••••• (Key saved)' : 're_123456789...'}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  className="pr-10 font-mono text-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showApiKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                Leave empty if already saved and you don&apos;t wish to replace it.
              </p>
            </div>

            {/* From Email */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="from-email">Sender Email Address (&quot;From&quot;)</Label>
                <Input
                  id="from-email"
                  placeholder="GEMS Admissions <onboarding@resend.dev>"
                  value={fromEmail}
                  onChange={(e) => setFromEmail(e.target.value)}
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Format: <code className="rounded bg-muted px-1 py-0.5">Name &lt;email@domain.com&gt;</code>. Use <code className="rounded bg-muted px-1 py-0.5">onboarding@resend.dev</code> for testing without DNS verification.
                </p>
              </div>

              {/* Reply-To Email */}
              <div className="space-y-2">
                <Label htmlFor="reply-to-email">Reply-To Email Address (Optional)</Label>
                <Input
                  id="reply-to-email"
                  type="email"
                  placeholder="admissions@gems.edu.np"
                  value={replyToEmail}
                  onChange={(e) => setReplyToEmail(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Where student replies should be delivered. Defaults to the assigned counselor&apos;s email.
                </p>
              </div>
            </div>

            {/* Auto Dispatch Toggle */}
            <div className="flex items-center justify-between rounded-lg border border-border p-4">
              <div className="space-y-0.5">
                <Label className="text-sm font-semibold flex items-center gap-1.5">
                  <Flame className="size-4 text-orange-500" />
                  Auto-Dispatch Welcome Email on Lead Arrival
                </Label>
                <p className="text-xs text-muted-foreground">
                  When enabled, any incoming Meta lead with an email address will automatically receive a personalized program welcome email with counselor details.
                </p>
              </div>
              <Switch
                checked={autoEmailEnabled}
                onCheckedChange={setAutoEmailEnabled}
              />
            </div>

            {/* Subject Line Template */}
            <div className="space-y-2">
              <Label htmlFor="subject-template">Default Email Subject Line</Label>
              <Input
                id="subject-template"
                placeholder="Welcome to {{college}} — {{course}} Admissions {{year}}"
                value={subjectTemplate}
                onChange={(e) => setSubjectTemplate(e.target.value)}
                required
              />
              <div className="flex flex-wrap gap-1.5 pt-1">
                <span className="text-xs text-muted-foreground">Available tags:</span>
                {['{{name}}', '{{course}}', '{{college}}', '{{year}}'].map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => setSubjectTemplate((prev) => `${prev} ${tag}`.trim())}
                    className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono text-muted-foreground hover:bg-muted/80 hover:text-foreground"
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="mr-2 size-4 animate-spin" />}
                Save Email Settings
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>

      {/* Test Email Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Send className="size-4 text-blue-600" />
            <CardTitle className="text-lg">Send Test Email</CardTitle>
          </div>
          <CardDescription>
            Verify that your Resend API key and sender email address are working by dispatching a live test.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="flex-1">
              <Input
                type="email"
                placeholder="Enter recipient email (e.g. your email)"
                value={testRecipient}
                onChange={(e) => setTestRecipient(e.target.value)}
              />
            </div>
            <Button
              type="button"
              variant="outline"
              disabled={testing || !isConfigured}
              onClick={handleSendTest}
              className="gap-2"
            >
              {testing ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Sending Test...
                </>
              ) : (
                <>
                  <Send className="size-4" />
                  Dispatch Test
                </>
              )}
            </Button>
          </div>

          {testResult && (
            <div
              className={`rounded-lg border p-3.5 text-xs ${
                testResult.success
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300'
                  : 'border-red-500/30 bg-red-500/10 text-red-800 dark:text-red-300'
              }`}
            >
              <div className="flex items-center gap-2 font-medium">
                {testResult.success ? (
                  <CheckCircle2 className="size-4 text-emerald-600" />
                ) : (
                  <AlertCircle className="size-4 text-red-600" />
                )}
                <span>{testResult.success ? 'Email Delivered Successfully' : 'Delivery Error'}</span>
              </div>
              <p className="mt-1 pl-6">{testResult.message}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Welcome Email Template Preview */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-amber-500" />
            <CardTitle className="text-lg">Admissions Welcome Email Preview</CardTitle>
          </div>
          <CardDescription>
            This high-converting responsive email is automatically sent to student leads with their course, college, and counselor details.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-xl border border-border bg-slate-50 p-4 dark:bg-slate-900/60">
            <div className="mx-auto max-w-[560px] overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-950">
              <div className="bg-linear-to-r from-blue-700 to-indigo-600 p-5 text-white">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-blue-200">
                  Admissions & Career Counseling
                </span>
                <h3 className="mt-1 text-lg font-bold">Welcome to GEMS Education</h3>
                <p className="text-xs text-blue-100">
                  Direct Admissions Partner for Top Universities in India & Nepal
                </p>
              </div>

              <div className="space-y-4 p-5 text-xs text-slate-700 dark:text-slate-300">
                <p>
                  Dear <strong>Aarav Sharma</strong>,
                </p>
                <p>
                  Thank you for your interest in <strong>B.Tech Computer Science & Engineering</strong> at{' '}
                  <strong>NIT / Partner Institutions</strong>. We have received your admission enquiry and our counseling team has reviewed your profile!
                </p>

                <div className="rounded-lg border-l-4 border-emerald-500 bg-emerald-50/70 p-3 text-xs dark:bg-emerald-950/30">
                  <span className="font-semibold text-emerald-800 dark:text-emerald-300">
                    🎓 Enquiry Details Received:
                  </span>
                  <div className="mt-1 space-y-0.5 text-slate-700 dark:text-slate-300">
                    <div>• <strong>Program:</strong> B.Tech Computer Science & Engineering</div>
                    <div>• <strong>Institution:</strong> NIT / Partner Universities</div>
                    <div>• <strong>Campaign:</strong> GEMS_NIT_Admissions_2027_28</div>
                  </div>
                </div>

                <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-3.5 dark:border-slate-800 dark:bg-slate-900">
                  <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                    Your Designated Admissions Advisor
                  </div>
                  <div className="mt-1 font-bold text-slate-900 dark:text-slate-100">
                    Senior Admissions Counselor
                  </div>
                  <p className="mt-1 text-[11px] text-slate-500">
                    Assigned to provide personalized guidance on fees, eligibility, and scholarships.
                  </p>
                  <div className="mt-2.5">
                    <span className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-xs">
                      💬 Chat on WhatsApp (+977 980-0000000)
                    </span>
                  </div>
                </div>

                <div className="border-t border-slate-200 pt-3 text-[11px] text-slate-500 dark:border-slate-800">
                  GEMS Education Admissions Office • Kathmandu, Nepal
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
