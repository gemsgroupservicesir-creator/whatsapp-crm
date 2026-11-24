import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { findMatchingLeadAssignmentRule, matchLeadAssignmentRule } from './meta-leads';

describe('Campaign Lead Assignment & AI matching', () => {
  it('matches a campaign rule by campaignName and extracts AI settings', async () => {
    const mockRules = [
      {
        id: 'rule-mamata',
        account_id: 'acct-1',
        name: 'Mamata MBA Campaign Rule',
        criteria_type: 'campaign_name',
        operator: 'contains',
        match_value: 'Mamata MBA',
        assign_to_user_id: 'user-mamata',
        is_active: true,
        priority: 1,
        followup_template_name: 'education_admissions_welcome',
        ai_auto_chat_enabled: true,
        ai_campaign_prompt: 'Guidance: Mention merit scholarship up to 30% and MBA specializations.',
      },
    ];

    const fakeAdmin = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({ data: mockRules, error: null }),
              }),
            }),
          }),
        }),
      }),
    } as unknown as SupabaseClient;

    const match = await findMatchingLeadAssignmentRule(fakeAdmin, 'acct-1', {
      campaignName: 'Mamata MBA',
      course: 'MBA',
    });

    expect(match).not.toBeNull();
    expect(match?.name).toBe('Mamata MBA Campaign Rule');
    expect(match?.assign_to_user_id).toBe('user-mamata');
    expect(match?.followup_template_name).toBe('education_admissions_welcome');
    expect(match?.ai_auto_chat_enabled).toBe(true);
    expect(match?.ai_campaign_prompt).toContain('merit scholarship up to 30%');

    const matchedUserId = await matchLeadAssignmentRule(fakeAdmin, 'acct-1', {
      campaignName: 'Mamata MBA',
    });
    expect(matchedUserId).toBe('user-mamata');
  });

  it('returns null when no rule matches the campaign or criteria', async () => {
    const mockRules = [
      {
        id: 'rule-btech',
        name: 'B.Tech Rule',
        criteria_type: 'course',
        operator: 'contains',
        match_value: 'B.Tech',
        assign_to_user_id: 'user-btech',
        is_active: true,
      },
    ];

    const fakeAdmin = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({ data: mockRules, error: null }),
              }),
            }),
          }),
        }),
      }),
    } as unknown as SupabaseClient;

    const match = await findMatchingLeadAssignmentRule(fakeAdmin, 'acct-1', {
      campaignName: 'Unrelated Ad Campaign',
      course: 'MBA',
    });

    expect(match).toBeNull();
  });

  it('matches when form_name is entered in campaign_name rule (Aarti Nursing case)', async () => {
    const mockRules = [
      {
        id: 'rule-aarti',
        name: 'Aarti Nursing Counselling',
        criteria_type: 'campaign_name',
        operator: 'equals',
        match_value: 'GEMS_Nursing_India_2027_Lead_Form',
        assign_to_user_id: 'user-aarti',
        is_active: true,
        priority: 1,
      },
    ];

    const fakeAdmin = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({ data: mockRules, error: null }),
              }),
            }),
          }),
        }),
      }),
    } as unknown as SupabaseClient;

    // Incoming lead has campaignName: "Nursing Aarti Madam" and formName: "GEMS_Nursing_India_2027_Lead_Form"
    const match = await findMatchingLeadAssignmentRule(fakeAdmin, 'acct-1', {
      campaignName: 'Nursing Aarti Madam',
      formName: 'GEMS_Nursing_India_2027_Lead_Form',
      course: 'B.Sc Nursing',
      college: 'Bangalore',
    });

    expect(match).not.toBeNull();
    expect(match?.name).toBe('Aarti Nursing Counselling');
    expect(match?.assign_to_user_id).toBe('user-aarti');
  });

  it('matches multi-term comma-separated keywords and tolerant underscores', async () => {
    const mockRules = [
      {
        id: 'rule-management',
        name: 'Management Admissions',
        criteria_type: 'course',
        operator: 'contains',
        match_value: 'MBA, BBA, PGDM, Management',
        assign_to_user_id: 'user-management',
        is_active: true,
        priority: 1,
      },
      {
        id: 'rule-nit',
        name: 'NIT Admissions',
        criteria_type: 'campaign_name',
        operator: 'equals',
        match_value: 'GEMS_NIT_Admissions_2027_28',
        assign_to_user_id: 'user-nit',
        is_active: true,
        priority: 2,
      },
    ];

    const fakeAdmin = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({ data: mockRules, error: null }),
              }),
            }),
          }),
        }),
      }),
    } as unknown as SupabaseClient;

    // Test 1: BBA matches multi-term course rule
    const matchBBA = await findMatchingLeadAssignmentRule(fakeAdmin, 'acct-1', {
      course: 'BBA',
    });
    expect(matchBBA?.assign_to_user_id).toBe('user-management');

    // Test 2: Tolerant match on NIT campaign with spaces / suffixes
    const matchNIT = await findMatchingLeadAssignmentRule(fakeAdmin, 'acct-1', {
      campaignName: 'GEMS_NIT_Admissions_2027_28_Nepal',
      formName: 'GEMS_NIT_Engineering_2027_28_Nepal',
    });
    expect(matchNIT?.assign_to_user_id).toBe('user-nit');
  });
});
