"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import {
  Building2,
  Check,
  ChevronsUpDown,
  PlusCircle,
  Loader2,
  Phone,
  Shield,
  Crown,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  const { account, refreshProfile, isOwner, isAdmin } = useAuth();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loading, setLoading] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newWorkspaceName, setNewWorkspaceName] = useState("");
  const [creating, setCreating] = useState(false);

  const fetchWorkspaces = async () => {
    try {
      const res = await fetch("/api/account/workspaces");
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data.workspaces)) {
        setWorkspaces(data.workspaces);
      }
    } catch (err) {
      console.error("Failed to fetch workspaces:", err);
    }
  };

  useEffect(() => {
    fetchWorkspaces();
  }, [account?.id]);

  const handleSwitch = async (targetId: string) => {
    if (targetId === account?.id || switching) return;
    try {
      setSwitching(true);
      const res = await fetch("/api/account/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: targetId }),
      });

      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to switch workspace");
        return;
      }

      toast.success(`Switched to ${data.workspace?.name || "workspace"}`);
      await refreshProfile();
      // Reload page to refresh all queries and caches for the new workspace
      window.location.reload();
    } catch (err) {
      console.error("Switch error:", err);
      toast.error("Failed to switch workspace");
    } finally {
      setSwitching(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newWorkspaceName.trim();
    if (!name || creating) return;

    try {
      setCreating(true);
      const res = await fetch("/api/account/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });

      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to create workspace");
        return;
      }

      toast.success(`Workspace "${name}" created!`);
      setDialogOpen(false);
      setNewWorkspaceName("");
      await refreshProfile();
      window.location.reload();
    } catch (err) {
      console.error("Create workspace error:", err);
      toast.error("Failed to create workspace");
    } finally {
      setCreating(false);
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

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          disabled={switching}
          aria-label="Switch workspace"
          className="flex w-full items-center justify-between gap-2 rounded-lg border border-border/70 bg-muted/40 p-2 text-left text-xs transition-colors hover:bg-muted/80 focus:outline-none focus:ring-1 focus:ring-ring"
        >
          <div className="flex min-w-0 items-center gap-2">
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
          {switching ? (
            <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
          ) : (
            <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
          )}
        </DropdownMenuTrigger>

        <DropdownMenuContent align="start" className="w-60">
          <DropdownMenuLabel className="text-[11px] font-normal text-muted-foreground uppercase tracking-wider">
            Workspaces & Numbers
          </DropdownMenuLabel>
          <DropdownMenuSeparator />

          {workspaces.map((ws) => {
            const isActive = ws.id === account?.id;
            return (
              <DropdownMenuItem
                key={ws.id}
                onClick={() => handleSwitch(ws.id)}
                className="flex cursor-pointer items-center justify-between gap-2 py-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-foreground">
                    {ws.name}
                  </p>
                  <p className="truncate text-[10px] text-muted-foreground">
                    {ws.phone_number_id ? (
                      <span className="text-emerald-400">● WhatsApp Connected</span>
                    ) : (
                      "No number linked"
                    )}
                  </p>
                </div>
                {isActive && <Check className="size-4 shrink-0 text-primary" />}
              </DropdownMenuItem>
            );
          })}

          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => setDialogOpen(true)}
            className="flex cursor-pointer items-center gap-2 text-primary focus:text-primary py-2 font-medium"
          >
            <PlusCircle className="size-4" />
            Create Workspace / Number
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Modal to create a new workspace */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={handleCreate}>
            <DialogHeader>
              <DialogTitle>Create New Workspace</DialogTitle>
              <DialogDescription>
                Create a dedicated workspace for a new WhatsApp number, department (e.g. Sales, Support), or agent.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="workspace-name">Workspace Name</Label>
                <Input
                  id="workspace-name"
                  placeholder="e.g. Sales Desk, Support Team, Admissions"
                  value={newWorkspaceName}
                  onChange={(e) => setNewWorkspaceName(e.target.value)}
                  autoFocus
                  disabled={creating}
                  className="bg-muted border-border"
                />
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
                disabled={creating}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={creating || !newWorkspaceName.trim()}>
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
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
