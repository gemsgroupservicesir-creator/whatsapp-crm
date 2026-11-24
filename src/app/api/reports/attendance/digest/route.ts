import { NextRequest, NextResponse } from 'next/server';
import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account';
import {
  sendDailyAttendanceDigestToAdmin,
  getTodayDateString,
} from '@/lib/reports/agent-reports';

export async function POST(req: NextRequest) {
  try {
    const ctx = await getCurrentAccount();

    const isAdmin = ctx.role === 'owner' || ctx.role === 'admin';
    if (!isAdmin) {
      return NextResponse.json(
        { error: 'Only administrators can dispatch daily attendance digests.' },
        { status: 403 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const date = body.date || getTodayDateString();
    const recipientEmail = body.recipientEmail;

    const result = await sendDailyAttendanceDigestToAdmin(
      ctx.supabase,
      ctx.accountId,
      date,
      recipientEmail
    );

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Failed to dispatch attendance digest email' },
        { status: 500 }
      );
    }

    // Also post an in-app confirmation notification for the admin
    try {
      await ctx.supabase.from('notifications').insert({
        account_id: ctx.accountId,
        user_id: ctx.userId,
        type: 'attendance_digest_sent',
        title: `📧 Daily Attendance Digest Sent`,
        body: `Attendance summary for ${date} was successfully emailed to ${result.recipient}.`,
        created_at: new Date().toISOString(),
      });
    } catch {
      // ignore
    }

    return NextResponse.json({
      success: true,
      message: `Daily attendance digest successfully sent to ${result.recipient}`,
      recipient: result.recipient,
      date,
    });
  } catch (err) {
    console.error('[POST /api/reports/attendance/digest] error:', err);
    return toErrorResponse(err);
  }
}
