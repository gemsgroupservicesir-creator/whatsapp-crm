"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Building2,
  Check,
  ChevronsUpDown,
  Plus,
  Loader2,
  Trash2,
  AlertTriangle,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  WORKSPACE_FEATURES,
  DEFAULT_ENABLED_FEATURES,
} from "@/lib/workspace/features";

interface Workspace {
  id: string;
  name: string;
  role: string;
  is_active: boolean;
  phone_number_id: string | null;
  whatsapp_status: string | null;
}

export function WorkspaceSwitcher() {
  const router = useRouter();
  const { account, refreshProfile, isOwner, isAdmin, profileLoading } = useAuth();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loading, setLoading] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [managerOpen, setManagerOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [newWorkspaceName, setNewWorkspaceName] = useState("");
  const [selectedFeatures, setSelectedFeatures] = useState<string[]>(DEFAULT_ENABLED_FEATURES);
  const [creating, setCreating] = useState(false);

  const fetchWorkspaces = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/account/workspaces", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data.workspaces)) {
        setWorkspaces(data.workspaces);
      }
    } catch (err) {
      console.error("Failed to fetch workspaces:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWorkspaces();
  }, [account?.id]);

  const handleSwitch = async (targetId: string) => {
    if (targetId === account?.id) {
      setManagerOpen(false);
      return;
    }
    if (switching) return;

    try {
      setSwitching(true);
      toast.loading("Switching workspace...", { id: "ws-switch" });

      const res = await fetch("/api/account/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: targetId }),
      });

      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to switch workspace", { id: "ws-switch" });
        setSwitching(false);
        return;
      }

      toast.success(
        `Switched to ${data.workspace?.name || data.workspace?.account_name || "workspace"}`,
        { id: "ws-switch" }
      );
      setManagerOpen(false);

      // Clean redirect to dashboard to reload fresh data for the active workspace
      setTimeout(() => {
        window.location.href = "/dashboard";
      }, 250);
    } catch (err) {
      console.error("Switch error:", err);
      toast.error("Failed to switch workspace", { id: "ws-switch" });
      setSwitching(false);
    }
  };

  const handleCreate = async () => {
    const name = newWorkspaceName.trim();
    if (!name || creating) return;

    try {
      setCreating(true);
      const res = await fetch("/api/account/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          features: selectedFeatures,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to create workspace");
        return;
      }

      toast.success(`Workspace "${name}" created!`);
      setCreateOpen(false);
      setManagerOpen(false);
      setNewWorkspaceName("");
      setSelectedFeatures(DEFAULT_ENABLED_FEATURES);
      await refreshProfile();
      window.location.href = "/dashboard";
    } catch (err) {
      console.error("Create workspace error:", err);
      toast.error("Failed to create workspace");
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (wsId: string) => {
    if (deletingId) return;

    try {
      setDeletingId(wsId);
      toast.loading("Deleting workspace...", { id: "ws-delete" });

      const res = await fetch("/api/account/workspaces", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId: wsId }),
      });

      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to delete workspace", { id: "ws-delete" });
        setDeletingId(null);
        return;
      }

      toast.success("Workspace deleted", { id: "ws-delete" });
      setDeleteConfirmId(null);

      // If active workspace was deleted, redirect to fallback
      if (data.fallbackAccountId) {
        await refreshProfile();
        window.location.href = "/dashboard";
      } else {
        setWorkspaces((prev) => prev.filter((w) => w.id !== wsId));
      }
    } catch (err) {
      console.error("Delete workspace error:", err);
      toast.error("Failed to delete workspace", { id: "ws-delete" });
    } finally {
      setDeletingId(null);
    }
  };

  const currentWorkspace = workspaces.find((w) => w.id === account?.id) || {
    id: account?.id || "",
    name: account?.name || "My Workspace",
    role: "owner",
    is_active: true,
    phone_number_id: null,
    whatsapp_status: null,
  };

  const isPrivileged = isOwner || isAdmin;

  // While loading initial profile and workspaces, show a subtle pulse skeleton
  if (profileLoading || (loading && workspaces.length === 0)) {
    return (
      <div className="flex w-full items-center gap-2 rounded-lg border border-border/70 bg-muted/40 p-2 text-left text-xs animate-pulse">
        <div className="size-7 shrink-0 rounded-md bg-muted" />
        <div className="min-w-0 flex-1 space-y-1">
          <div className="h-3 w-24 bg-muted rounded" />
          <div className="h-2 w-16 bg-muted rounded" />
        </div>
      </div>
    );
  }

  // Non-admins with 1 or 0 workspaces just see their assigned workspace label (no switcher, no + button)
  if (!isPrivileged && workspaces.length <= 1) {
    return (
      <div className="flex w-full items-center gap-2 rounded-lg border border-border/70 bg-muted/40 p-2 text-left text-xs">
        <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Building2 className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-foreground">
            {currentWorkspace.name}
          </p>
          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            {currentWorkspace.phone_number_id ? (
              <span className="flex items-center gap-1 text-emerald-400">
                <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Connected
              </span>
            ) : (
              <span>No WhatsApp number</span>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="flex w-full items-center gap-1.5">
        <button
          type="button"
          onClick={() => setManagerOpen(true)}
          disabled={switching}
          aria-label="Manage & switch workspaces"
          className="flex min-w-0 flex-1 items-center justify-between gap-2 rounded-lg border border-border/70 bg-muted/40 p-2 text-left text-xs transition-colors hover:bg-muted/80 focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer group"
        >
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary group-hover:bg-primary/20 transition-colors">
              <Building2 className="size-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold text-foreground">
                {currentWorkspace.name}
              </p>
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                {currentWorkspace.phone_number_id ? (
                  <span className="flex items-center gap-1 text-emerald-400">
                    <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    Connected
                  </span>
                ) : (
                  <span>No WhatsApp number</span>
                )}
              </div>
            </div>
          </div>
          {switching ? (
            <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
          ) : (
            <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground group-hover:text-foreground transition-colors" />
          )}
        </button>

        {isPrivileged && (
          <Button
            type="button"
            size="icon"
            variant="outline"
            onClick={() => setCreateOpen(true)}
            title="Create New Workspace / Number"
            aria-label="Create New Workspace"
            className="size-11 shrink-0 rounded-lg border-border/70 bg-muted/40 text-muted-foreground hover:bg-muted/80 hover:text-foreground cursor-pointer"
          >
            <Plus className="size-4" />
          </Button>
        )}
      </div>

      {/* Modal: Workspace Manager (Switch, List, Add & Delete) */}
      <Dialog open={managerOpen} onOpenChange={setManagerOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Workspaces</DialogTitle>
            <DialogDescription>
              Switch between workspaces, link WhatsApp numbers, or manage your accounts.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-2 flex flex-col gap-2.5 max-h-[60vh] overflow-y-auto pr-1">
            {workspaces.map((ws) => {
              const isActive = ws.id === account?.id;
              const isConfirmingDelete = deleteConfirmId === ws.id;

              return (
                <div
                  key={ws.id}
                  className={cn(
                    "flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl border transition-all text-left",
                    isActive
                      ? "border-primary/80 bg-primary/10 shadow-xs ring-1 ring-primary/20"
                      : "border-border/80 bg-card hover:border-primary/40 hover:bg-muted/30"
                  )}
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div
                      className={cn(
                        "flex size-10 shrink-0 items-center justify-center rounded-lg",
                        isActive
                          ? "bg-primary text-primary-foreground font-semibold"
                          : "bg-muted text-muted-foreground"
                      )}
                    >
                      <Building2 className="size-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate font-semibold text-foreground text-sm">
                          {ws.name}
                        </p>
                        {isActive && (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-primary/20 text-primary border border-primary/30">
                            Current
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
                        {ws.phone_number_id ? (
                          <span className="flex items-center gap-1 text-emerald-400 font-medium">
                            <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            WhatsApp Connected ({ws.phone_number_id})
                          </span>
                        ) : (
                          <span className="text-muted-foreground">No WhatsApp number linked</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-border/50">
                    {isActive ? (
                      <span className="text-xs font-medium text-emerald-400 flex items-center gap-1 px-2 py-1">
                        <Check className="size-3.5" /> Active
                      </span>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={switching || deletingId === ws.id}
                        onClick={() => handleSwitch(ws.id)}
                        className="h-8 text-xs cursor-pointer"
                      >
                        {switching ? (
                          <Loader2 className="size-3 animate-spin mr-1" />
                        ) : null}
                        Switch
                      </Button>
                    )}

                    {isPrivileged && workspaces.length > 1 && (
                      <>
                        {isConfirmingDelete ? (
                          <div className="flex items-center gap-1.5 bg-destructive/10 p-1 rounded-lg border border-destructive/20 animate-in fade-in-50">
                            <span className="text-[11px] text-destructive font-medium px-1">
                              Delete?
                            </span>
                            <Button
                              size="sm"
                              variant="destructive"
                              disabled={deletingId === ws.id}
                              onClick={() => handleDelete(ws.id)}
                              className="h-6 px-2 text-[11px] cursor-pointer"
                            >
                              {deletingId === ws.id ? (
                                <Loader2 className="size-2.5 animate-spin" />
                              ) : (
                                "Yes"
                              )}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setDeleteConfirmId(null)}
                              className="h-6 px-2 text-[11px] cursor-pointer"
                            >
                              No
                            </Button>
                          </div>
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={deletingId === ws.id}
                            onClick={() => setDeleteConfirmId(ws.id)}
                            title="Delete this workspace"
                            className="h-8 px-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 cursor-pointer"
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <DialogFooter className="mt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            {isPrivileged ? (
              <Button
                type="button"
                variant="default"
                size="sm"
                onClick={() => {
                  setManagerOpen(false);
                  setCreateOpen(true);
                }}
                className="cursor-pointer"
              >
                <Plus className="mr-1.5 size-4" />
                Add New Workspace
              </Button>
            ) : <div />}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setDeleteConfirmId(null);
                setManagerOpen(false);
              }}
              className="cursor-pointer"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal: Create New Workspace */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create New Workspace</DialogTitle>
            <DialogDescription>
              Create a dedicated workspace for a new WhatsApp number, department (e.g. Sales, Support), or agent.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="ws-name">Workspace Name</Label>
              <Input
                id="ws-name"
                placeholder="e.g. Sales Department, Support, Counselor"
                value={newWorkspaceName}
                onChange={(e) => setNewWorkspaceName(e.target.value)}
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold text-foreground">
                  Enabled Features
                </Label>
                <button
                  type="button"
                  onClick={() => {
                    if (selectedFeatures.length === WORKSPACE_FEATURES.length) {
                      setSelectedFeatures([]);
                    } else {
                      setSelectedFeatures(WORKSPACE_FEATURES.map((f) => f.id));
                    }
                  }}
                  className="text-[11px] text-primary hover:underline cursor-pointer"
                >
                  {selectedFeatures.length === WORKSPACE_FEATURES.length
                    ? "Untick all"
                    : "Tick all"}
                </button>
              </div>

              <div className="divide-y divide-border/60 rounded-lg border border-border/70 max-h-56 overflow-y-auto">
                {WORKSPACE_FEATURES.map((feat) => {
                  const isChecked = selectedFeatures.includes(feat.id);
                  return (
                    <div
                      key={feat.id}
                      onClick={() => {
                        setSelectedFeatures((prev) =>
                          isChecked
                            ? prev.filter((id) => id !== feat.id)
                            : [...prev, feat.id]
                        );
                      }}
                      className="flex items-center justify-between px-3 py-2 text-xs hover:bg-muted/50 cursor-pointer select-none transition-colors"
                    >
                      <div className="flex items-center gap-2.5">
                        <Checkbox
                          checked={isChecked}
                          onCheckedChange={() => {
                            setSelectedFeatures((prev) =>
                              isChecked
                                ? prev.filter((id) => id !== feat.id)
                                : [...prev, feat.id]
                            );
                          }}
                          className="data-[state=checked]:bg-primary"
                        />
                        <span className="font-medium">{feat.name}</span>
                      </div>
                      <span className="text-[10px] text-muted-foreground">
                        {isChecked ? "Ticked" : "Unticked"}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setCreateOpen(false)}
              disabled={creating}
              className="cursor-pointer"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => handleCreate()}
              disabled={creating || !newWorkspaceName.trim()}
              className="cursor-pointer"
            >
              {creating ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Creating...
                </>
              ) : (
                "Create Workspace"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
