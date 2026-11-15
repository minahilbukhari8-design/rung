import { router } from 'expo-router';
import { useState } from 'react';
import { useApp } from '@/lib/app';
import { Button, ErrorText, Field, Screen, Txt } from '@/ui/kit';

export default function Login() {
  const { api, t, setLoggedIn } = useApp();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  async function run(fn: () => Promise<void>) {
    setBusy(true); setErr('');
    try { await fn(); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  return (
    <Screen>
      <Txt kind="h1">{t('login')}</Txt>
      <Txt kind="muted">{t('loginToContinue')}</Txt>
      {!sent ? (
        <>
          <Field label={t('phone')} placeholder="0300 1234567" keyboardType="phone-pad" autoComplete="tel" value={phone} onChangeText={setPhone} />
          <Button title={t('sendCode')} disabled={busy || phone.length < 10} onPress={() => run(async () => { await api.requestCode(phone); setSent(true); })} />
        </>
      ) : (
        <>
          <Field label={t('code')} keyboardType="number-pad" autoComplete="one-time-code" textContentType="oneTimeCode" maxLength={6} value={code} onChangeText={setCode} />
          <Button title={t('verify')} disabled={busy || code.length !== 6} onPress={() => run(async () => {
            await api.verify(phone, code);
            setLoggedIn(true);
            if (router.canGoBack()) router.back(); else router.replace('/');
          })} />
        </>
      )}
      <ErrorText msg={err} />
    </Screen>
  );
}
