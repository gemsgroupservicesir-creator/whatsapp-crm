import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { toErrorResponse } from "@/lib/auth/account";
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from "@/lib/rate-limit";

function supabaseAdmin() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * POST /api/account/switch
 * Switches the authenticated user's active workspace.
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

    const limit = checkRateLimit(`workspace:switch:${user.id}`, RATE_LIMITS.adminAction);
    if (!limit.success) return rateLimitResponse(limit);

    const body = (await request.json().catch(() => null)) as { accountId?: string } | null;
    const accountId = body?.accountId;

    if (!accountId) {
      return NextResponse.json({ error: "accountId is required" }, { status: 400 });
    }

    // Try RPC first
    const { data: rpcData, error: rpcError } = await supabase.rpc("switch_active_account", {
      p_account_id: accountId,
    });

    if (!rpcError && rpcData?.ok) {
      return NextResponse.json({ success: true, workspace: rpcData });
    }

    // Fallback via Admin Client
    const admin = supabaseAdmin();

    // Verify caller is owner or member
    const { data: account, error: accErr } = await admin
      .from("accounts")
      .select("id, name, owner_user_id")
      .eq("id", accountId)
      .maybeSingle();

    if (accErr || !account) {
      return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
    }

    let role: string | null = null;
    if (account.owner_user_id === user.id) {
      role = "owner";
    } else {
      // Check account_members if table exists
      try {
        const { data: member } = await admin
          .from("account_members")
          .select("role")
          .eq("account_id", accountId)
          .eq("user_id", user.id)
          .maybeSingle();
        if (member?.role) role = member.role;
      } catch {
        // Table may not exist yet
      }
    }

    if (!role) {
      return NextResponse.json(
        { error: "Access denied: you are not a member of this workspace" },
        { status: 403 }
      );
    }

    // Switch active account in profile
    const { error: updateErr } = await admin
      .from("profiles")
      .update({
        account_id: accountId,
        account_role: role,
      })
      .eq("user_id", user.id);

    if (updateErr) {
      console.error("[POST /api/account/switch] update error:", updateErr);
      return NextResponse.json({ error: "Failed to switch workspace" }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      workspace: {
        id: account.id,
        name: account.name,
        role,
      },
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
