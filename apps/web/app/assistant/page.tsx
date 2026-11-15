import type { Metadata } from 'next';
import { AssistantChat } from '@/components/client';
import { t } from '@/lib/i18n';
import { apiGet, getLocale } from '@/lib/server';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Ask RUNG' };

export default async function AssistantPage() {
  const locale = await getLocale();
  const status = await apiGet<{ engine: 'claude' | 'basic' }>('/assistant/status', { fresh: true });
  return (
    <section className="wrap" style={{ maxWidth: 720 }}>
      <h1>{t(locale, 'assistant')}</h1>
      <p>{t(locale, 'assistantIntro')}</p>
      <p className="notice" data-testid="assistant-mode">{status?.engine === 'claude' ? t(locale, 'assistantAi') : t(locale, 'assistantBasic')}</p>
      <AssistantChat locale={locale} />
      <p className="muted">{t(locale, 'voiceTip')}</p>
    </section>
  );
}
