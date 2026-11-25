'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Bot, BrainCircuit, Sparkles, Settings2, BarChart3, Megaphone } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { CampaignAiAgents } from '@/components/agents/campaign-ai-agents';
import { CrmAiIntelligence } from '@/components/agents/crm-ai-intelligence';
import { AiPlayground } from '@/components/agents/ai-playground';
import { AiUsageCard } from '@/components/agents/ai-usage';
import { AiConfig } from '@/components/settings/ai-config';
import { useAuth } from '@/hooks/use-auth';
import { canEditSettings } from '@/lib/auth/roles';

type Tab = 'intelligence' | 'campaigns' | 'playground' | 'setup' | 'usage';

export default function AgentsPage() {
  return (
    <Suspense fallback={null}>
      <AgentsPageInner />
    </Suspense>
  );
}

function AgentsPageInner() {
  const t = useTranslations('Agents');
  const searchParams = useSearchParams();
  const { accountRole } = useAuth();
  const canViewUsage = accountRole ? canEditSettings(accountRole) : false;
  const requestedTab = searchParams.get('tab') as Tab | null;
  const [tab, setTab] = useState<Tab>('intelligence');
  const [decided, setDecided] = useState(false);

  // Respect ?tab=... query param or land configured workspaces on AI Intelligence
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (
          requestedTab &&
          ['intelligence', 'campaigns', 'playground', 'setup', 'usage'].includes(requestedTab)
        ) {
          if (!cancelled) setTab(requestedTab);
          return;
        }
        const res = await fetch('/api/ai/config');
        const data = await res.json().catch(() => ({}));
        if (!cancelled) setTab(data?.configured ? 'intelligence' : 'setup');
      } catch {
        if (!cancelled) setTab('intelligence');
      } finally {
        if (!cancelled) setDecided(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [requestedTab]);

  return (
    <div>
      <div className="flex items-center gap-2">
        <Bot className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          {t('title')}
        </h1>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        {t('description')}
      </p>

      {decided && (
        <Tabs
          value={tab}
          onValueChange={(v) => setTab(v as Tab)}
          className="mt-6"
        >
          <TabsList className="flex-wrap">
            <TabsTrigger value="intelligence">
              <BrainCircuit className="mr-1.5 h-4 w-4" /> AI Intelligence
            </TabsTrigger>
            <TabsTrigger value="campaigns">
              <Megaphone className="mr-1.5 h-4 w-4" /> Campaign AI Agents
            </TabsTrigger>
            <TabsTrigger value="playground">
              <Sparkles className="mr-1.5 h-4 w-4" /> {t('tabPlayground')}
            </TabsTrigger>
            <TabsTrigger value="setup">
              <Settings2 className="mr-1.5 h-4 w-4" /> {t('tabSetup')}
            </TabsTrigger>
            {canViewUsage && (
              <TabsTrigger value="usage">
                <BarChart3 className="mr-1.5 h-4 w-4" /> {t('tabUsage')}
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="intelligence" className="mt-4">
            <CrmAiIntelligence />
          </TabsContent>

          <TabsContent value="campaigns" className="mt-4">
            <CampaignAiAgents />
          </TabsContent>

          <TabsContent value="playground" className="mt-4">
            <AiPlayground onGoToSetup={() => setTab('setup')} />
          </TabsContent>

          <TabsContent value="setup" className="mt-4">
            <AiConfig />
          </TabsContent>

          {canViewUsage && (
            <TabsContent value="usage" className="mt-4">
              <AiUsageCard />
            </TabsContent>
          )}
        </Tabs>
      )}
    </div>
  );
}
