import type { SupabaseClient } from '@supabase/supabase-js';

export interface EmailConfig {
  provider: 'resend';
  apiKey: string;
  fromEmail: string;
  replyToEmail?: string;
  autoEmailEnabled: boolean;
  autoFollowUpOnNote?: boolean;
  subjectTemplate?: string;
}

const EMAIL_CONFIG_FIELD_NAME = '__email_config__';

/**
 * Loads the workspace email configuration.
 * Priority:
 * 1. Database custom_fields (__email_config__)
 * 2. Environment variables (RESEND_API_KEY, EMAIL_FROM, EMAIL_REPLY_TO)
 */
export async function loadEmailConfig(
  db: SupabaseClient,
  accountId: string
): Promise<EmailConfig | null> {
  let storedConfig: Partial<EmailConfig> | null = null;

  try {
    const { data } = await db
      .from('custom_fields')
      .select('field_options')
      .eq('account_id', accountId)
      .eq('field_name', EMAIL_CONFIG_FIELD_NAME)
      .maybeSingle();

    if (data?.field_options && typeof data.field_options === 'object') {
      storedConfig = data.field_options as Partial<EmailConfig>;
    }
  } catch (err) {
    console.warn('[EmailConfig] Failed to load custom_fields email config:', err);
  }

  const apiKey =
    storedConfig?.apiKey ||
    process.env.RESEND_API_KEY ||
    '';

  const fromEmail =
    storedConfig?.fromEmail ||
    process.env.EMAIL_FROM ||
    'GEMS Admissions <admissions@gemsgroup.edu.np>';

  const replyToEmail =
    storedConfig?.replyToEmail ||
    process.env.EMAIL_REPLY_TO ||
    undefined;

  const autoEmailEnabled =
    typeof storedConfig?.autoEmailEnabled === 'boolean'
      ? storedConfig.autoEmailEnabled
      : Boolean(process.env.RESEND_API_KEY);

  const autoFollowUpOnNote =
    typeof storedConfig?.autoFollowUpOnNote === 'boolean'
      ? storedConfig.autoFollowUpOnNote
      : false;

  const subjectTemplate =
    storedConfig?.subjectTemplate ||
    'Welcome to {{college}} — {{course}} Admissions {{year}}';

  if (!apiKey) {
    return null;
  }

  return {
    provider: 'resend',
    apiKey,
    fromEmail,
    replyToEmail,
    autoEmailEnabled,
    autoFollowUpOnNote,
    subjectTemplate,
  };
}

/**
 * Saves workspace email configuration in custom_fields.
 */
export async function saveEmailConfig(
  db: SupabaseClient,
  accountId: string,
  userId: string,
  config: Partial<EmailConfig>
): Promise<void> {
  const { data: existing } = await db
    .from('custom_fields')
    .select('id, field_options')
    .eq('account_id', accountId)
    .eq('field_name', EMAIL_CONFIG_FIELD_NAME)
    .maybeSingle();

  const currentOptions =
    existing?.field_options && typeof existing.field_options === 'object'
      ? (existing.field_options as Record<string, unknown>)
      : {};

  const updatedOptions = {
    ...currentOptions,
    provider: 'resend',
    apiKey: config.apiKey !== undefined ? config.apiKey : currentOptions.apiKey,
    fromEmail: config.fromEmail || currentOptions.fromEmail || 'GEMS Admissions <admissions@gemsgroup.edu.np>',
    replyToEmail: config.replyToEmail !== undefined ? config.replyToEmail : currentOptions.replyToEmail,
    autoEmailEnabled:
      typeof config.autoEmailEnabled === 'boolean'
        ? config.autoEmailEnabled
        : currentOptions.autoEmailEnabled !== false,
    autoFollowUpOnNote:
      typeof config.autoFollowUpOnNote === 'boolean'
        ? config.autoFollowUpOnNote
        : Boolean(currentOptions.autoFollowUpOnNote),
    subjectTemplate: config.subjectTemplate || currentOptions.subjectTemplate,
  };

  if (existing?.id) {
    const { error: updateErr } = await db
      .from('custom_fields')
      .update({
        field_options: updatedOptions,
      })
      .eq('id', existing.id);

    if (updateErr) throw updateErr;
  } else {
    const { error: insertErr } = await db.from('custom_fields').insert({
      account_id: accountId,
      user_id: userId,
      field_name: EMAIL_CONFIG_FIELD_NAME,
      field_type: 'text',
      field_options: updatedOptions,
    });

    if (insertErr) throw insertErr;
  }
}

/**
 * Helper to mask sensitive API key for display.
 */
export function maskApiKey(key: string): string {
  if (!key) return '';
  if (key.length <= 8) return '••••••••';
  const prefix = key.slice(0, 4);
  const suffix = key.slice(-4);
  return `${prefix}${'•'.repeat(Math.max(6, key.length - 8))}${suffix}`;
}
