import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { useApp, useLoad } from '@/lib/app';
import { formatPKR } from '@rung/domain';
import { Button, Card, ErrorText, Field, Pill, Screen, Txt } from '@/ui/kit';
import { C } from '@/ui/theme';

interface AssistantCard { kind: 'product' | 'service'; vendorSlug: string; slug: string; title: string; titleUr: string | null; vendorName: string; fromPaisa: number | null; isDemo: boolean }
interface Line { role: 'user' | 'assistant'; content: string; cards?: AssistantCard[] }

/** Chat with the RUNG assistant. Every card is a real listing the server looked up; tapping it opens that listing. */
export default function Assistant() {
  const { api, t, locale } = useApp();
  const status = useLoad<{ engine: 'claude' | 'basic' }>('/assistant/status');
  const [lines, setLines] = useState<Line[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function send() {
    const msg = text.trim();
    if (!msg || busy) return;
    const next: Line[] = [...lines, { role: 'user', content: msg }];
    setLines(next); setText(''); setErr(''); setBusy(true);
    try {
      const r = await api.post<{ text: string; cards: AssistantCard[] }>('/assistant/chat', { locale, messages: next.slice(-12).map(({ role, content }) => ({ role, content })) });
      setLines([...next, { role: 'assistant', content: r.text, cards: r.cards }]);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <Screen>
      <Txt>{t('assistantIntro')}</Txt>
      {status.data && <Txt kind="muted" testID="assistant-mode">{status.data.engine === 'claude' ? t('assistantAi') : t('assistantBasic')}</Txt>}
      {lines.map((l, i) => (
        <View key={i} testID={`chat-${l.role}`} style={{ alignSelf: l.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '92%', gap: 8, backgroundColor: l.role === 'user' ? C.shab : '#fff', borderRadius: 16, padding: 12, borderWidth: l.role === 'user' ? 0 : 1, borderColor: '#eadfce' }}>
          <Txt style={l.role === 'user' ? { color: C.dupatta } : undefined}>{l.content}</Txt>
          {l.cards?.map((c) => (
            <Card key={`${c.kind}-${c.vendorSlug}-${c.slug}`} testID={`chat-card-${c.slug}`} label={c.title} onPress={() => router.push(`/${c.kind}/${c.vendorSlug}/${c.slug}`)}>
              {c.isDemo && <Pill text={t('demo')} tone="demo" />}
              <Txt style={{ fontWeight: '700' }}>{locale === 'ur' && c.titleUr ? c.titleUr : c.title}</Txt>
              <Txt kind="muted">{c.vendorName}{c.fromPaisa !== null ? ` · ${formatPKR(c.fromPaisa, locale)}` : ''}</Txt>
            </Card>
          ))}
        </View>
      ))}
      {busy && <Txt kind="muted">…</Txt>}
      <Field label={t('typeMessage')} value={text} onChangeText={setText} maxLength={1000} onSubmitEditing={() => void send()} returnKeyType="send" />
      <Button title={t('send')} onPress={() => void send()} disabled={busy || !text.trim()} />
      <ErrorText msg={err} />
      <Txt kind="muted">{t('voiceTip')}</Txt>
    </Screen>
  );
}
