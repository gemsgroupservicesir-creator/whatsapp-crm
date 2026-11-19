import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { getCurrentAccount, toErrorResponse } from "@/lib/auth/account";
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from "@/lib/rate-limit";

function supabaseAdmin() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export interface WorkspaceItem {
  id: string;
  name: string;
  role: string;
  is_active: boolean;
  phone_number_id: string | null;
  whatsapp_status: string | null;
}

/**
 * GET /api/account/workspaces
 * Lists all workspaces accessible to the authenticated user.
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Try RPC first
    const { data: rpcData, error: rpcError } = await supabase.rpc("list_my_workspaces");

    if (!rpcError && Array.isArray(rpcData)) {
      return NextResponse.json({ workspaces: rpcData });
    }

    // Fallback via Admin Client
    const admin = supabaseAdmin();
    const { data: profile } = await admin
      .from("profiles")
      .select("account_id, account_role")
      .eq("user_id", user.id)
      .maybeSingle();

    const activeAccountId = profile?.account_id;

    // Get accounts owned by the user or where user is member
    const { data: ownedAccounts } = await admin
      .from("accounts")
      .select("id, name, created_at")
      .eq("owner_user_id", user.id)
      .order("created_at", { ascending: true });

    // Also get active account if not in ownedAccounts
    let allAccounts = ownedAccounts || [];
    if (activeAccountId && !allAccounts.some((a) => a.id === activeAccountId)) {
      const { data: activeAcc } = await admin
        .from("accounts")
        .select("id, name, created_at")
        .eq("id", activeAccountId)
        .maybeSingle();
      if (activeAcc) allAccounts.push(activeAcc);
    }

    // Fetch whatsapp_configs for these accounts
    const accountIds = allAccounts.map((a) => a.id);
    const { data: configs } = await admin
      .from("whatsapp_config")
      .select("account_id, phone_number_id, status")
      .in("account_id", accountIds.length > 0 ? accountIds : ["00000000-0000-0000-0000-000000000000"]);

    const configMap = new Map((configs || []).map((c) => [c.account_id, c]));

    const workspaces: WorkspaceItem[] = allAccounts.map((a) => {
      const cfg = configMap.get(a.id);
      return {
        id: a.id,
        name: a.name,
        role: a.id === activeAccountId ? (profile?.account_role || "owner") : "owner",
        is_active: a.id === activeAccountId,
        phone_number_id: cfg?.phone_number_id || null,
        whatsapp_status: cfg?.status || null,
      };
    });

    return NextResponse.json({ workspaces });
  } catch (err) {
    return toErrorResponse(err);
  }
}

/**
 * POST /api/account/workspaces
 * Creates a new workspace and switches active workspace to it.
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const limit = checkRateLimit(`workspace:create:${user.id}`, RATE_LIMITS.adminAction);
    if (!limit.success) return rateLimitResponse(limit);

    const body = (await request.json().catch(() => null)) as {
      name?: string;
      features?: string[];
    } | null;
    const name = body?.name?.trim();

    if (!name) {
      return NextResponse.json({ error: "Workspace name is required" }, { status: 400 });
    }

    const requestedFeatures = Array.isArray(body?.features) ? body.features : null;

    // Fallback via Admin Client
    const admin = supabaseAdmin();

    let newAccount: { id: string; name: string } | null = null;

    // Try inserting with enabled_features first if requested
    if (requestedFeatures) {
      const { data: accWithFeat, error: featErr } = await admin
        .from("accounts")
        .insert({
          name,
          owner_user_id: user.id,
          enabled_features: requestedFeatures,
        })
        .select("id, name")
        .maybeSingle();

      if (!featErr && accWithFeat) {
        newAccount = accWithFeat;
      }
    }

    // Otherwise standard insert
    if (!newAccount) {
      const { data: stdAcc, error: accError } = await admin
        .from("accounts")
        .insert({
          name,
          owner_user_id: user.id,
        })
        .select("id, name")
        .single();

      if (accError) {
        console.error("[POST /api/account/workspaces] create error:", accError);
        return NextResponse.json(
          { error: accError.message || "Failed to create workspace" },
          { status: 500 }
        );
      }
      newAccount = stdAcc;
    }

    // Add to account_members
    try {
      await admin.from("account_members").upsert(
        {
          account_id: newAccount.id,
          user_id: user.id,
          role: "owner",
        },
        { onConflict: "account_id, user_id" }
      );
    } catch (e) {
      console.warn("[POST /api/account/workspaces] account_members upsert:", e);
    }

    // Switch caller's active profile account_id
    const { error: profError } = await admin
      .from("profiles")
      .update({
        account_id: newAccount.id,
        account_role: "owner",
      })
      .eq("user_id", user.id);

    if (profError) {
      console.error("[POST /api/account/workspaces] profile update error:", profError);
    }

    return NextResponse.json({
      workspace: {
        id: newAccount.id,
        name: newAccount.name,
        role: "owner",
        is_active: true,
      },
    });
  } catch (err) {
    console.error("[POST /api/account/workspaces] unhandled exception:", err);
    return toErrorResponse(err);
  }
}
