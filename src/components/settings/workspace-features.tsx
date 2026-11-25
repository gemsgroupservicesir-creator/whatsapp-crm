"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  MessageSquare,
  Users,
  UserCheck,
  GitBranch,
  GraduationCap,
  Radio,
  Zap,
  Workflow,
  Bot,
  Sliders,
  Check,
  ShieldCheck,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  WORKSPACE_FEATURES,
  DEFAULT_ENABLED_FEATURES,
} from "@/lib/workspace/features";

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  MessageSquare,
  Users,
  UserCheck,
  GitBranch,
  GraduationCap,
  Radio,
  Zap,
  Workflow,
  Bot,
};

export function WorkspaceFeaturesPanel() {
  const { account, isOwner, isAdmin, refreshProfile } = useAuth();
  const [enabledFeatures, setEnabledFeatures] = useState<string[]>(DEFAULT_ENABLED_FEATURES);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const canEdit = isOwner || isAdmin;

  const loadFeatures = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/account/features");
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data.features)) {
        setEnabledFeatures(data.features);
      }
    } catch (err) {
      console.error("Failed to load workspace features:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFeatures();
  }, [account?.id]);

  const toggleFeature = (id: string) => {
    if (!canEdit || saving) return;
    setEnabledFeatures((prev) =>
      prev.includes(id) ? prev.filter((f) => f !== id) : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    if (!canEdit || saving) return;
    setEnabledFeatures(WORKSPACE_FEATURES.map((f) => f.id));
  };

  const handleSave = async () => {
    if (!canEdit || saving) return;
    try {
      setSaving(true);
      const res = await fetch("/api/account/features", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ features: enabledFeatures }),
      });

      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to update features");
        return;
      }

      toast.success("Workspace features updated successfully!");
      await refreshProfile();
      window.location.reload();
    } catch (err) {
      console.error("Save features error:", err);
      toast.error("Failed to update features");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="border-border">
      <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Sliders className="size-5 text-primary" />
            <CardTitle className="text-lg">Workspace Feature Access</CardTitle>
          </div>
          <CardDescription className="mt-1">
            Control which CRM modules are enabled for{" "}
            <span className="font-semibold text-foreground">
              {account?.name || "this workspace"}
            </span>
            . Unticked features will be hidden from the navigation.
          </CardDescription>
        </div>

        {canEdit && (
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleSelectAll}
              disabled={loading || saving}
              className="text-xs"
            >
              Select All
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleSave}
              disabled={loading || saving}
              className="text-xs"
            >
              {saving ? (
                <>
                  <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Changes"
              )}
            </Button>
          </div>
        )}
      </CardHeader>

      <CardContent className="space-y-3">
        {!canEdit && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-300">
            Only workspace owners and administrators can configure feature access.
          </div>
        )}

        <div className="grid gap-2.5 sm:grid-cols-1">
          {WORKSPACE_FEATURES.map((feature) => {
            const isChecked = enabledFeatures.includes(feature.id);
            const Icon = ICON_MAP[feature.iconName] || Sliders;

            return (
              <div
                key={feature.id}
                onClick={() => canEdit && toggleFeature(feature.id)}
                className={`flex items-start gap-3 rounded-lg border p-3.5 transition-colors ${
                  canEdit ? "cursor-pointer" : "cursor-default"
                } ${
                  isChecked
                    ? "border-primary/40 bg-primary/5 hover:bg-primary/10"
                    : "border-border bg-card/50 opacity-60 hover:opacity-80"
                }`}
              >
                <div className="pt-0.5">
                  <Checkbox
                    id={`feat-${feature.id}`}
                    checked={isChecked}
                    onCheckedChange={() => canEdit && toggleFeature(feature.id)}
                    disabled={!canEdit || saving}
                    className="data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                  />
                </div>

                <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-foreground">
                  <Icon className="size-4" />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <label
                      htmlFor={`feat-${feature.id}`}
                      className={`text-sm font-medium ${
                        canEdit ? "cursor-pointer" : ""
                      } text-foreground`}
                    >
                      {feature.name}
                    </label>
                    {feature.badge && (
                      <Badge
                        variant="secondary"
                        className="text-[10px] uppercase font-semibold tracking-wider px-1.5 py-0"
                      >
                        {feature.badge}
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {feature.description}
                  </p>
                </div>

                <div className="shrink-0 text-xs font-medium">
                  {isChecked ? (
                    <span className="flex items-center gap-1 text-emerald-400">
                      <Check className="size-3.5" />
                      Enabled
                    </span>
                  ) : (
                    <span className="text-muted-foreground">Disabled</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
