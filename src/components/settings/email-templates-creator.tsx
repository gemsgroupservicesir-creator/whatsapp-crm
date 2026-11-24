'use client';

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import {
  Mail,
  Plus,
  Sparkles,
  Copy,
  Edit,
  Trash2,
  Eye,
  Smartphone,
  Monitor,
  CheckCircle2,
  AlertCircle,
  Send,
  Star,
  RefreshCw,
  Code,
  Layers,
  FileText,
  Check,
  X,
  ExternalLink,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  type EmailTemplate,
  type EmailTemplateCategory,
  SUPPORTED_TEMPLATE_VARIABLES,
  DEFAULT_EMAIL_TEMPLATES,
  interpolateEmailTemplate,
} from '@/lib/email/templates';
import { cn } from '@/lib/utils';

const CATEGORY_COLORS: Record<EmailTemplateCategory, { badge: string; bg: string; text: string }> = {
  welcome: {
    badge: 'border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300',
    bg: 'bg-blue-50 dark:bg-blue-950/30',
    text: 'text-blue-700 dark:text-blue-300',
  },
  follow_up: {
    badge: 'border-purple-500/30 bg-purple-500/10 text-purple-700 dark:text-purple-300',
    bg: 'bg-purple-50 dark:bg-purple-950/30',
    text: 'text-purple-700 dark:text-purple-300',
  },
  scholarship: {
    badge: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
    bg: 'bg-emerald-50 dark:bg-emerald-950/30',
    text: 'text-emerald-700 dark:text-emerald-300',
  },
  campus: {
    badge: 'border-indigo-500/30 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300',
    bg: 'bg-indigo-50 dark:bg-indigo-950/30',
    text: 'text-indigo-700 dark:text-indigo-300',
  },
  fees: {
    badge: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300',
    bg: 'bg-amber-50 dark:bg-amber-950/30',
    text: 'text-amber-700 dark:text-amber-300',
  },
  general: {
    badge: 'border-slate-500/30 bg-slate-500/10 text-slate-700 dark:text-slate-300',
    bg: 'bg-slate-50 dark:bg-slate-900/40',
    text: 'text-slate-700 dark:text-slate-300',
  },
};

const SAMPLE_CONTEXT = {
  fullName: 'Aarav Sharma',
  firstName: 'Aarav',
  course: 'B.Tech Computer Science & Engineering',
  college: 'NIT Campus Partner',
  city: 'Kathmandu',
  counselorName: 'Senior Advisor Prakash',
  counselorPhone: '+91 89718 71113',
  counselorEmail: 'admissions@gemsgroup.edu.np',
  year: '2027/28',
  notes: 'Student scored 84% in Class 12 PCM. Inquired about merit scholarship quota and hostel accommodation.',
};

export function EmailTemplatesCreator() {
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  // Editor Modal State
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Partial<EmailTemplate> | null>(null);
  const [editorActiveTab, setEditorActiveTab] = useState<'html' | 'preview' | 'text'>('preview');
  const [previewViewport, setPreviewViewport] = useState<'desktop' | 'mobile'>('desktop');
  const [savingTemplate, setSavingTemplate] = useState(false);

  // AI Generator Modal State
  const [isAiModalOpen, setIsAiModalOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiCategory, setAiCategory] = useState<EmailTemplateCategory>('general');
  const [generatingAi, setGeneratingAi] = useState(false);

  // Quick Test Email State
  const [testRecipient, setTestRecipient] = useState('');
  const [sendingTest, setSendingTest] = useState(false);

  // Quick Preview Modal State (from cards)
  const [previewTemplate, setPreviewTemplate] = useState<EmailTemplate | null>(null);

  const fetchTemplates = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/email/templates');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.templates)) {
          setTemplates(data.templates);
        }
      }
    } catch (err) {
      console.error('Failed to load email templates:', err);
      toast.error('Failed to load email templates');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTemplates();
  }, []);

  const handleOpenNewTemplate = () => {
    setEditingTemplate({
      id: '',
      name: '',
      category: 'general',
      subject: 'Welcome to {{college}} — {{course}} Admissions {{year}}',
      description: '',
      isDefault: false,
      variables: ['name', 'course', 'college', 'counselor', 'counselor_phone', 'wa_link'],
      bodyHtml: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>{{subject}}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #1e293b; }
    .container { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0; }
    .header { background: linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%); color: #ffffff; padding: 28px; text-align: left; }
    .content { padding: 28px; }
    .card { background-color: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 18px; margin: 20px 0; }
    .btn-wa { display: inline-block; background-color: #25D366; color: #ffffff !important; text-decoration: none; padding: 12px 22px; font-weight: 600; border-radius: 6px; text-align: center; margin-top: 10px; font-size: 14px; }
    .footer { background-color: #f1f5f9; padding: 18px 24px; font-size: 12px; color: #64748b; text-align: center; border-top: 1px solid #e2e8f0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div style="font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; opacity: 0.85; margin-bottom: 4px;">Admissions & Career Counseling</div>
      <h1 style="margin: 0; font-size: 20px; font-weight: 700;">{{college}}</h1>
      <p style="margin: 4px 0 0 0; font-size: 13.5px; opacity: 0.9;">Direct Admissions Partner for Top Universities in India & Nepal</p>
    </div>
    <div class="content">
      <p style="font-size: 15.5px; margin-top: 0;">Dear <strong>{{name}}</strong>,</p>
      <p style="font-size: 14.5px; line-height: 1.6; color: #334155;">
        Thank you for your interest in <strong>{{course}}</strong> at <strong>{{college}}</strong>. We are thrilled to guide you through your admissions journey!
      </p>
      <div class="card">
        <div style="font-size: 11px; text-transform: uppercase; font-weight: 700; color: #64748b; margin-bottom: 4px;">Your Designated Admissions Counselor</div>
        <div style="font-size: 16px; font-weight: 700; color: #0f172a;">{{counselor}}</div>
        <p style="font-size: 13px; color: #475569; margin: 6px 0 12px 0;">
          Connect directly to verify eligibility, fee structure, and scholarship quotas.
        </p>
        <div>
          <a href="{{wa_link}}" class="btn-wa" target="_blank">💬 Chat on WhatsApp ({{counselor_phone}})</a>
        </div>
      </div>
      <p style="font-size: 13.5px; color: #64748b; margin-top: 20px;">
        Warm regards,<br>
        <strong>{{counselor}}</strong><br>
        Admissions Office • GEMS Education
      </p>
    </div>
    <div class="footer">
      <p style="margin: 0 0 4px 0;"><strong>GEMS Education Admissions Office</strong></p>
      <p style="margin: 0;">Kathmandu, Nepal • Admissions Support: {{counselor_phone}}</p>
    </div>
  </div>
</body>
</html>`,
      bodyText: `Dear {{name}},\n\nThank you for inquiring about {{course}} at {{college}}.\n\nYour Admissions Counselor:\n- Name: {{counselor}}\n- WhatsApp: {{counselor_phone}}\n- Chat: {{wa_link}}\n\nWarm regards,\nGEMS Education`,
    });
    setEditorActiveTab('preview');
    setIsEditorOpen(true);
  };

  const handleEditTemplate = (tmpl: EmailTemplate) => {
    setEditingTemplate({ ...tmpl });
    setEditorActiveTab('preview');
    setIsEditorOpen(true);
  };

  const handleDuplicateTemplate = (tmpl: EmailTemplate) => {
    const cloned: Partial<EmailTemplate> = {
      ...tmpl,
      id: '',
      name: `${tmpl.name} (Copy)`,
      isDefault: false,
    };
    setEditingTemplate(cloned);
    setEditorActiveTab('preview');
    setIsEditorOpen(true);
  };

  const handleDeleteTemplate = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete template "${name}"?`)) return;
    try {
      const res = await fetch(`/api/email/templates?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete template');
      toast.success('Template deleted successfully');
      setTemplates((prev) => prev.filter((t) => t.id !== id));
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  };

  const handleSaveTemplate = async () => {
    if (!editingTemplate?.name?.trim()) {
      toast.error('Please provide a template name');
      return;
    }
    if (!editingTemplate?.subject?.trim()) {
      toast.error('Please provide a subject line');
      return;
    }
    if (!editingTemplate?.bodyHtml?.trim()) {
      toast.error('HTML body cannot be empty');
      return;
    }

    try {
      setSavingTemplate(true);
      const res = await fetch('/api/email/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template: editingTemplate }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save template');

      toast.success('Template saved successfully!');
      if (Array.isArray(data.templates)) {
        setTemplates(data.templates);
      } else {
        await fetchTemplates();
      }
      setIsEditorOpen(false);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingTemplate(false);
    }
  };

  const handleGenerateWithAi = async () => {
    if (!aiPrompt.trim()) {
      toast.error('Please enter a description for the template');
      return;
    }

    try {
      setGeneratingAi(true);
      const res = await fetch('/api/email/templates/ai-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: aiPrompt.trim(),
          category: aiCategory,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to generate template with AI');

      toast.success('Template drafted successfully with Gemini AI!');
      setEditingTemplate({
        ...data.template,
        id: '',
      });
      setIsAiModalOpen(false);
      setAiPrompt('');
      setEditorActiveTab('preview');
      setIsEditorOpen(true);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setGeneratingAi(false);
    }
  };

  const handleSendTestEmail = async () => {
    if (!testRecipient.trim() || !testRecipient.includes('@')) {
      toast.error('Please enter a valid recipient email for the test');
      return;
    }
    if (!editingTemplate?.bodyHtml || !editingTemplate?.subject) {
      toast.error('Template is incomplete');
      return;
    }

    try {
      setSendingTest(true);
      const rendered = interpolateEmailTemplate(
        {
          subject: editingTemplate.subject,
          bodyHtml: editingTemplate.bodyHtml,
          bodyText: editingTemplate.bodyText,
        },
        SAMPLE_CONTEXT
      );

      const res = await fetch('/api/email/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: testRecipient.trim(),
          customSubject: rendered.subject,
          customHtml: rendered.html,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to send test email');
      toast.success(`Live test email delivered to ${testRecipient}!`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setSendingTest(false);
    }
  };

  const insertVariableTag = (tag: string) => {
    if (!editingTemplate) return;
    setEditingTemplate((prev) => ({
      ...prev,
      bodyHtml: (prev?.bodyHtml || '') + ` ${tag} `,
    }));
  };

  const filteredTemplates = templates.filter((t) => {
    if (selectedCategory === 'all') return true;
    return t.category === selectedCategory;
  });

  return (
    <div className="space-y-6">
      {/* Top Banner & Action Header */}
      <Card className="border-border">
        <CardHeader className="pb-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <div className="flex size-9 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400">
                  <Mail className="size-5" />
                </div>
                <CardTitle className="text-xl">Email Templates Creator & Library</CardTitle>
              </div>
              <CardDescription>
                Design, preview, and manage high-converting admissions welcome emails, counselor follow-ups, and scholarship notifications.
              </CardDescription>
            </div>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsAiModalOpen(true)}
                className="gap-1.5 border-purple-500/30 text-purple-600 dark:text-purple-400 hover:bg-purple-500/10"
              >
                <Sparkles className="size-4 text-purple-600" />
                AI Template Drafter
              </Button>
              <Button
                type="button"
                onClick={handleOpenNewTemplate}
                className="gap-1.5 bg-blue-600 hover:bg-blue-700 text-white"
              >
                <Plus className="size-4" />
                New Template
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {/* Category Tabs */}
          <div className="flex flex-wrap items-center gap-1.5 border-t border-border pt-4 text-xs">
            <span className="text-muted-foreground mr-1">Filter:</span>
            {[
              { id: 'all', label: `All (${templates.length})` },
              { id: 'welcome', label: 'Welcome' },
              { id: 'follow_up', label: 'Follow-Up' },
              { id: 'scholarship', label: 'Scholarships' },
              { id: 'campus', label: 'Campus & Hostel' },
              { id: 'fees', label: 'Fees & Deadlines' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSelectedCategory(tab.id)}
                className={cn(
                  'px-3 py-1.5 rounded-full text-xs font-medium transition-colors cursor-pointer',
                  selectedCategory === tab.id
                    ? 'bg-blue-600 text-white shadow-xs font-semibold'
                    : 'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Templates Grid */}
      {loading ? (
        <div className="flex min-h-[220px] items-center justify-center">
          <RefreshCw className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : filteredTemplates.length === 0 ? (
        <Card className="border-dashed p-10 text-center text-muted-foreground">
          <Mail className="mx-auto size-10 opacity-30 mb-3" />
          <h3 className="font-semibold text-foreground text-sm">No templates found in this category</h3>
          <p className="text-xs mt-1">Create a new template or draft one instantly with Gemini AI.</p>
          <div className="mt-4 flex justify-center gap-2">
            <Button size="sm" variant="outline" onClick={() => setIsAiModalOpen(true)}>
              <Sparkles className="size-3.5 mr-1 text-purple-600" />
              Draft with AI
            </Button>
            <Button size="sm" onClick={handleOpenNewTemplate}>
              <Plus className="size-3.5 mr-1" />
              Create Template
            </Button>
          </div>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {filteredTemplates.map((tmpl) => {
            const catStyle = CATEGORY_COLORS[tmpl.category] || CATEGORY_COLORS.general;
            const previewData = interpolateEmailTemplate(tmpl, SAMPLE_CONTEXT);

            return (
              <Card key={tmpl.id} className="flex flex-col justify-between border-border hover:border-border/80 transition-shadow hover:shadow-xs">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <Badge variant="outline" className={cn('text-[10px] uppercase font-bold tracking-wider px-2 py-0.5', catStyle.badge)}>
                          {tmpl.category.replace('_', ' ')}
                        </Badge>
                        {tmpl.isDefault && (
                          <Badge className="bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-500/30 text-[10px] gap-1 px-1.5 py-0">
                            <Star className="size-3 fill-amber-500" />
                            Default
                          </Badge>
                        )}
                      </div>
                      <h4 className="font-bold text-base text-foreground pt-1">{tmpl.name}</h4>
                    </div>
                  </div>
                  {tmpl.description && (
                    <CardDescription className="text-xs line-clamp-2 mt-1">
                      {tmpl.description}
                    </CardDescription>
                  )}
                </CardHeader>

                <CardContent className="space-y-3 pb-4">
                  {/* Subject Preview */}
                  <div className="rounded-md border border-border bg-muted/30 p-2.5 text-xs">
                    <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block mb-1">
                      Subject Line:
                    </span>
                    <span className="font-medium text-foreground line-clamp-1">{tmpl.subject}</span>
                  </div>

                  {/* Variables pills */}
                  <div className="flex flex-wrap items-center gap-1">
                    <span className="text-[10px] text-muted-foreground mr-1">Variables:</span>
                    {tmpl.variables.slice(0, 5).map((v) => (
                      <span key={v} className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
                        {`{{${v}}}`}
                      </span>
                    ))}
                    {tmpl.variables.length > 5 && (
                      <span className="text-[10px] text-muted-foreground">+{tmpl.variables.length - 5} more</span>
                    )}
                  </div>
                </CardContent>

                {/* Footer Actions */}
                <div className="flex items-center justify-between border-t border-border px-6 py-3 bg-muted/10 text-xs">
                  <span className="text-[11px] text-muted-foreground">
                    Updated {new Date(tmpl.updated_at).toLocaleDateString()}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setPreviewTemplate(tmpl)}
                      className="h-8 text-xs gap-1 text-muted-foreground hover:text-foreground"
                    >
                      <Eye className="size-3.5" />
                      Preview
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDuplicateTemplate(tmpl)}
                      className="h-8 text-xs gap-1 text-muted-foreground hover:text-foreground"
                      title="Duplicate Template"
                    >
                      <Copy className="size-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleEditTemplate(tmpl)}
                      className="h-8 text-xs gap-1 border-border"
                    >
                      <Edit className="size-3.5" />
                      Edit
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteTemplate(tmpl.id, tmpl.name)}
                      className="h-8 text-xs text-red-500 hover:text-red-600 hover:bg-red-500/10 px-2"
                      title="Delete Template"
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Template Editor / Creator Modal */}
      <Dialog open={isEditorOpen} onOpenChange={setIsEditorOpen}>
        <DialogContent className="max-w-4xl max-h-[92vh] flex flex-col p-6 overflow-hidden">
          <DialogHeader className="pb-3 border-b border-border">
            <div className="flex items-center justify-between">
              <div>
                <DialogTitle className="flex items-center gap-2 text-lg">
                  <Edit className="size-5 text-blue-600" />
                  {editingTemplate?.id ? 'Edit Email Template' : 'Create New Email Template'}
                </DialogTitle>
                <DialogDescription>
                  Configure subject line, responsive HTML layout, and dynamic student personalization tags.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="grid gap-4 py-3 flex-1 overflow-y-auto pr-1">
            {/* Top row: Name & Category */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="tmpl-name">Template Name *</Label>
                <Input
                  id="tmpl-name"
                  placeholder="e.g. B.Tech Merit Scholarship Guide"
                  value={editingTemplate?.name || ''}
                  onChange={(e) => setEditingTemplate((prev) => ({ ...prev, name: e.target.value }))}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="tmpl-category">Category</Label>
                <select
                  id="tmpl-category"
                  value={editingTemplate?.category || 'general'}
                  onChange={(e) => setEditingTemplate((prev) => ({ ...prev, category: e.target.value as EmailTemplateCategory }))}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs focus:ring-1 focus:ring-primary"
                >
                  <option value="welcome">Welcome Email</option>
                  <option value="follow_up">Counseling Follow-Up</option>
                  <option value="scholarship">Scholarship & Concessions</option>
                  <option value="campus">Campus & Hostel</option>
                  <option value="fees">Fees & Deadlines</option>
                  <option value="general">General Admissions</option>
                </select>
              </div>
            </div>

            {/* Subject Line */}
            <div className="space-y-1.5">
              <Label htmlFor="tmpl-subject">Email Subject Line *</Label>
              <Input
                id="tmpl-subject"
                placeholder="Welcome to {{college}} — {{course}} Admissions {{year}}"
                value={editingTemplate?.subject || ''}
                onChange={(e) => setEditingTemplate((prev) => ({ ...prev, subject: e.target.value }))}
              />
            </div>

            {/* Variable Pills Inserter Toolbar */}
            <div className="rounded-lg border border-border bg-muted/30 p-2.5 text-xs">
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-semibold text-foreground text-[11px] flex items-center gap-1">
                  <Layers className="size-3.5 text-blue-600" />
                  Click to Insert Dynamic Personalization Variables:
                </span>
                <span className="text-[10px] text-muted-foreground">Inserts into HTML</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {SUPPORTED_TEMPLATE_VARIABLES.map((v) => (
                  <button
                    key={v.tag}
                    type="button"
                    onClick={() => insertVariableTag(v.tag)}
                    title={v.description}
                    className="rounded border border-input bg-background px-2 py-0.5 font-mono text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer transition-colors shadow-2xs"
                  >
                    {v.tag}
                  </button>
                ))}
              </div>
            </div>

            {/* View Mode Tabs (HTML / Visual Preview / Plain Text) */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center rounded-lg border border-input p-0.5 bg-muted/40 text-xs">
                  <button
                    type="button"
                    onClick={() => setEditorActiveTab('preview')}
                    className={cn(
                      'px-3 py-1 rounded-md font-medium text-xs transition-colors cursor-pointer flex items-center gap-1.5',
                      editorActiveTab === 'preview' ? 'bg-background text-foreground shadow-2xs font-semibold' : 'text-muted-foreground'
                    )}
                  >
                    <Eye className="size-3.5" />
                    Live Visual Preview
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditorActiveTab('html')}
                    className={cn(
                      'px-3 py-1 rounded-md font-medium text-xs transition-colors cursor-pointer flex items-center gap-1.5',
                      editorActiveTab === 'html' ? 'bg-background text-foreground shadow-2xs font-semibold' : 'text-muted-foreground'
                    )}
                  >
                    <Code className="size-3.5" />
                    HTML Source Code
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditorActiveTab('text')}
                    className={cn(
                      'px-3 py-1 rounded-md font-medium text-xs transition-colors cursor-pointer flex items-center gap-1.5',
                      editorActiveTab === 'text' ? 'bg-background text-foreground shadow-2xs font-semibold' : 'text-muted-foreground'
                    )}
                  >
                    <FileText className="size-3.5" />
                    Plain Text Fallback
                  </button>
                </div>

                {editorActiveTab === 'preview' && (
                  <div className="flex items-center gap-1 text-xs">
                    <button
                      type="button"
                      onClick={() => setPreviewViewport('desktop')}
                      className={cn(
                        'p-1.5 rounded text-muted-foreground hover:text-foreground',
                        previewViewport === 'desktop' && 'bg-muted text-foreground'
                      )}
                      title="Desktop View (600px)"
                    >
                      <Monitor className="size-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setPreviewViewport('mobile')}
                      className={cn(
                        'p-1.5 rounded text-muted-foreground hover:text-foreground',
                        previewViewport === 'mobile' && 'bg-muted text-foreground'
                      )}
                      title="Mobile View (360px)"
                    >
                      <Smartphone className="size-4" />
                    </button>
                  </div>
                )}
              </div>

              {/* Tab: HTML Code */}
              {editorActiveTab === 'html' && (
                <Textarea
                  value={editingTemplate?.bodyHtml || ''}
                  onChange={(e) => setEditingTemplate((prev) => ({ ...prev, bodyHtml: e.target.value }))}
                  rows={14}
                  className="font-mono text-xs leading-relaxed"
                  placeholder="<!DOCTYPE html><html><body>...</body></html>"
                />
              )}

              {/* Tab: Plain Text */}
              {editorActiveTab === 'text' && (
                <Textarea
                  value={editingTemplate?.bodyText || ''}
                  onChange={(e) => setEditingTemplate((prev) => ({ ...prev, bodyText: e.target.value }))}
                  rows={12}
                  className="font-mono text-xs"
                  placeholder="Dear {{name}}, thank you for your inquiry..."
                />
              )}

              {/* Tab: Live Visual Preview */}
              {editorActiveTab === 'preview' && (
                <div className="rounded-xl border border-border bg-slate-100 dark:bg-slate-900/60 p-4 flex justify-center min-h-[380px] max-h-[460px] overflow-y-auto">
                  <div
                    className={cn(
                      'bg-white dark:bg-slate-950 rounded-lg shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden transition-all duration-200',
                      previewViewport === 'desktop' ? 'w-full max-w-[600px]' : 'w-[360px]'
                    )}
                  >
                    <div
                      dangerouslySetInnerHTML={{
                        __html: interpolateEmailTemplate(
                          {
                            subject: editingTemplate?.subject || 'Subject Preview',
                            bodyHtml: editingTemplate?.bodyHtml || '<p>Empty body</p>',
                          },
                          SAMPLE_CONTEXT
                        ).html,
                      }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Test Email Bar */}
            <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/20 p-3 sm:flex-row sm:items-center">
              <span className="text-xs font-semibold text-foreground shrink-0 flex items-center gap-1.5">
                <Send className="size-3.5 text-blue-600" />
                Dispatch Test Email:
              </span>
              <Input
                type="email"
                placeholder="Enter test recipient email"
                value={testRecipient}
                onChange={(e) => setTestRecipient(e.target.value)}
                className="h-8 text-xs flex-1"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleSendTestEmail}
                disabled={sendingTest}
                className="h-8 text-xs gap-1.5 shrink-0"
              >
                {sendingTest ? <RefreshCw className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
                Send Live Test
              </Button>
            </div>
          </div>

          <DialogFooter className="border-t border-border pt-3 gap-2">
            <Button variant="outline" size="sm" onClick={() => setIsEditorOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSaveTemplate}
              disabled={savingTemplate}
              className="bg-blue-600 hover:bg-blue-700 text-white gap-1.5"
            >
              {savingTemplate ? <RefreshCw className="size-4 animate-spin" /> : <Check className="size-4" />}
              Save Template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AI Template Drafter Modal */}
      <Dialog open={isAiModalOpen} onOpenChange={setIsAiModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="size-5 text-purple-600" />
              AI Template Drafter (Gemini)
            </DialogTitle>
            <DialogDescription>
              Describe what kind of email you need, and Gemini will generate a complete, responsive HTML admissions template.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="ai-category">Target Category</Label>
              <select
                id="ai-category"
                value={aiCategory}
                onChange={(e) => setAiCategory(e.target.value as EmailTemplateCategory)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs"
              >
                <option value="welcome">Welcome Email</option>
                <option value="follow_up">Counseling Follow-Up</option>
                <option value="scholarship">Scholarship & Concession</option>
                <option value="campus">Campus & Hostel</option>
                <option value="fees">Fees & Deadlines</option>
                <option value="general">General Admissions</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ai-prompt">Instructions for AI *</Label>
              <Textarea
                id="ai-prompt"
                placeholder="e.g. Draft an urgent last-chance scholarship reminder for students who scored over 75% in +2, highlighting 40% tuition concession and seat deadline."
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                rows={4}
                className="text-xs"
              />
              <p className="text-[11px] text-muted-foreground">
                Gemini automatically incorporates your GEMS branding, responsive styles, and dynamic student tags.
              </p>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setIsAiModalOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleGenerateWithAi}
              disabled={generatingAi || !aiPrompt.trim()}
              className="bg-purple-600 hover:bg-purple-700 text-white gap-1.5"
            >
              {generatingAi ? (
                <>
                  <RefreshCw className="size-4 animate-spin" />
                  Drafting with AI...
                </>
              ) : (
                <>
                  <Sparkles className="size-4" />
                  Generate Template
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Quick Visual Preview Modal (from Card button) */}
      <Dialog open={Boolean(previewTemplate)} onOpenChange={(open) => !open && setPreviewTemplate(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-6 overflow-hidden">
          <DialogHeader className="pb-3 border-b border-border">
            <div className="flex items-center justify-between">
              <div>
                <DialogTitle className="text-lg flex items-center gap-2">
                  <Eye className="size-5 text-blue-600" />
                  {previewTemplate?.name}
                </DialogTitle>
                <DialogDescription>
                  Preview with sample student data ({SAMPLE_CONTEXT.fullName} • {SAMPLE_CONTEXT.course}).
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {previewTemplate && (
            <div className="py-2 flex-1 overflow-y-auto">
              <div className="rounded-md border border-border bg-muted/30 p-2.5 text-xs mb-3">
                <span className="font-semibold text-muted-foreground uppercase text-[10px] block">
                  Subject Line:
                </span>
                <span className="font-semibold text-foreground text-sm">
                  {interpolateEmailTemplate(previewTemplate, SAMPLE_CONTEXT).subject}
                </span>
              </div>

              <div className="rounded-lg border border-border bg-slate-50 dark:bg-slate-900/60 p-4 flex justify-center">
                <div
                  className="w-full max-w-[600px] bg-white dark:bg-slate-950 rounded-lg shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden"
                  dangerouslySetInnerHTML={{
                    __html: interpolateEmailTemplate(previewTemplate, SAMPLE_CONTEXT).html,
                  }}
                />
              </div>
            </div>
          )}

          <DialogFooter className="pt-2 border-t border-border">
            <Button variant="outline" size="sm" onClick={() => setPreviewTemplate(null)}>
              Close
            </Button>
            <Button
              size="sm"
              onClick={() => {
                if (previewTemplate) {
                  const tmpl = previewTemplate;
                  setPreviewTemplate(null);
                  handleEditTemplate(tmpl);
                }
              }}
              className="bg-blue-600 hover:bg-blue-700 text-white gap-1.5"
            >
              <Edit className="size-4" />
              Edit This Template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
