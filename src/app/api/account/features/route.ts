import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { toErrorResponse } from "@/lib/auth/account";
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from "@/lib/rate-limit";
import {
  DEFAULT_ENABLED_FEATURES,
  normalizeEnabledFeatures,
} from "@/lib/workspace/features";

function supabaseAdmin() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * GET /api/account/features
 * Returns the enabled features for the caller's active workspace.
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

    const admin = supabaseAdmin();
    const { data: profile } = await admin
      .from("profiles")
      .select("account_id, account_role")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!profile?.account_id) {
      return NextResponse.json({
        features: DEFAULT_ENABLED_FEATURES,
        accountName: "Workspace",
      });
    }

    const { data: account, error: accErr } = await admin
      .from("accounts")
      .select("id, name, enabled_features")
      .eq("id", profile.account_id)
      .maybeSingle();

    if (accErr || !account) {
      return NextResponse.json({
        features: DEFAULT_ENABLED_FEATURES,
        accountName: "Workspace",
      });
    }

    return NextResponse.json({
      features: normalizeEnabledFeatures(account.enabled_features),
      accountName: account.name,
      role: profile.account_role,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}

/**
 * POST /api/account/features
 * Updates the enabled features for the caller's active workspace.
 * Restricted to owners and admins.
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

    const limit = checkRateLimit(`workspace:features:${user.id}`, RATE_LIMITS.adminAction);
    if (!limit.success) return rateLimitResponse(limit);

    const admin = supabaseAdmin();
    const { data: profile } = await admin
      .from("profiles")
      .select("account_id, account_role")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!profile?.account_id) {
      return NextResponse.json({ error: "No active workspace" }, { status: 400 });
    }

    if (profile.account_role !== "owner" && profile.account_role !== "admin") {
      return NextResponse.json(
        { error: "Only admins and owners can modify workspace features" },
        { status: 403 }
      );
    }

    const body = (await request.json().catch(() => null)) as {
      features?: string[];
    } | null;

    const features = normalizeEnabledFeatures(body?.features);

    // Save to accounts table
    const { error: updateErr } = await admin
      .from("accounts")
      .update({ enabled_features: features })
      .eq("id", profile.account_id);

    if (updateErr) {
      console.error("[POST /api/account/features] update error:", updateErr);
      return NextResponse.json(
        { error: updateErr.message || "Failed to update features" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      features,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
