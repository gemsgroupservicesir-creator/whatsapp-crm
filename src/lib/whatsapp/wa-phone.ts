import type { SupabaseClient } from '@supabase/supabase-js';
import { decrypt } from '@/lib/whatsapp/encryption';
import { verifyPhoneNumber } from '@/lib/whatsapp/meta-api';

export interface WorkspaceWhatsAppPhoneInfo {
  displayPhone: string;
  cleanPhone: string;
  waLink: string;
  verifiedName?: string;
}

// Fallback to official GEMS Education Cloud WhatsApp number if not configured
export const DEFAULT_WORKSPACE_WA_PHONE = '+91 89718 71113';

const CACHE_FIELD_NAME = '__whatsapp_phone_info__';

/**
 * Resolves the connected WhatsApp Cloud AI phone number for an account/workspace.
 * Looks up whatsapp_config, verifies with Meta or cache, and produces clean digits + wa.me link.
 */
export async function getWorkspaceWhatsAppPhone(
  db: SupabaseClient,
  accountId: string
): Promise<WorkspaceWhatsAppPhoneInfo> {
  try {
    // 1. Check if cached recently in custom_fields
    const { data: cachedField } = await db
      .from('custom_fields')
      .select('field_options')
      .eq('account_id', accountId)
      .eq('field_name', CACHE_FIELD_NAME)
      .maybeSingle();

    if (
      cachedField?.field_options &&
      typeof cachedField.field_options === 'object' &&
      (cachedField.field_options as Record<string, unknown>).displayPhone
    ) {
      const info = cachedField.field_options as Record<string, string>;
      const displayPhone = info.displayPhone;
      const cleanPhone = displayPhone.replace(/[^0-9]/g, '');
      if (cleanPhone && !cleanPhone.includes('000000')) {
        return {
          displayPhone,
          cleanPhone,
          waLink: `https://wa.me/${cleanPhone}`,
          verifiedName: info.verifiedName,
        };
      }
    }

    // 2. Fetch whatsapp_config for the account
    const { data: waCfg } = await db
      .from('whatsapp_config')
      .select('phone_number_id, access_token')
      .eq('account_id', accountId)
      .maybeSingle();

    if (waCfg?.phone_number_id && waCfg?.access_token) {
      let accessToken: string | null = null;
      try {
        accessToken = decrypt(waCfg.access_token);
      } catch (err) {
        console.warn('[getWorkspaceWhatsAppPhone] Decryption failed:', err);
      }

      if (accessToken) {
        try {
          const metaPhone = await verifyPhoneNumber({
            phoneNumberId: waCfg.phone_number_id,
            accessToken,
          });

          if (metaPhone?.display_phone_number) {
            const displayPhone = metaPhone.display_phone_number;
            const cleanPhone = displayPhone.replace(/[^0-9]/g, '');
            const verifiedName = metaPhone.verified_name;

            // Cache in custom_fields asynchronously
            saveCachedWhatsAppPhone(db, accountId, displayPhone, verifiedName).catch(() => {});

            return {
              displayPhone,
              cleanPhone,
              waLink: `https://wa.me/${cleanPhone}`,
              verifiedName,
            };
          }
        } catch (metaErr) {
          console.warn('[getWorkspaceWhatsAppPhone] Meta API fetch error:', metaErr);
        }
      }
    }
  } catch (err) {
    console.warn('[getWorkspaceWhatsAppPhone] Error resolving phone:', err);
  }

  // 3. Fallback to default active GEMS Education Cloud number
  const defaultClean = DEFAULT_WORKSPACE_WA_PHONE.replace(/[^0-9]/g, '');
  return {
    displayPhone: DEFAULT_WORKSPACE_WA_PHONE,
    cleanPhone: defaultClean,
    waLink: `https://wa.me/${defaultClean}`,
    verifiedName: 'Gems Education',
  };
}

async function saveCachedWhatsAppPhone(
  db: SupabaseClient,
  accountId: string,
  displayPhone: string,
  verifiedName?: string
) {
  try {
    const payload = {
      displayPhone,
      verifiedName,
      cached_at: new Date().toISOString(),
    };

    const { data: existing } = await db
      .from('custom_fields')
      .select('id')
      .eq('account_id', accountId)
      .eq('field_name', CACHE_FIELD_NAME)
      .maybeSingle();

    if (existing?.id) {
      await db
        .from('custom_fields')
        .update({ field_options: payload })
        .eq('id', existing.id);
    } else {
      await db.from('custom_fields').insert({
        account_id: accountId,
        field_name: CACHE_FIELD_NAME,
        field_type: 'json',
        field_options: payload,
      });
    }
  } catch {
    // Non-fatal
  }
}
