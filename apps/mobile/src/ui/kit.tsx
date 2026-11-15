import { formatPKR } from '@rung/domain';
import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type StyleProp, type TextInputProps, type TextStyle, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useApp } from '@/lib/app';
import { C } from './theme';

/** Text that follows the reading direction of the current language. */
export function Txt({ children, style, kind = 'body', testID }: { children: ReactNode; style?: StyleProp<TextStyle>; kind?: 'h1' | 'h2' | 'body' | 'muted' | 'price' | 'error'; testID?: string }) {
  const { rtl } = useApp();
  return <Text testID={testID} role={kind === 'h1' ? 'heading' : kind === 'error' ? 'alert' : undefined} aria-level={kind === 'h1' ? 1 : undefined} style={[s[kind], { textAlign: rtl ? 'right' : 'left', writingDirection: rtl ? 'rtl' : 'ltr' }, style]}>{children}</Text>;
}

export function Row({ children, style, wrap }: { children: ReactNode; style?: StyleProp<ViewStyle>; wrap?: boolean }) {
  const { rtl } = useApp();
  return <View style={[{ flexDirection: rtl ? 'row-reverse' : 'row', alignItems: 'center', gap: 8, flexWrap: wrap ? 'wrap' : 'nowrap' }, style]}>{children}</View>;
}

export function Screen({ children, scroll = true }: { children: ReactNode; scroll?: boolean }) {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.dupatta }} edges={['bottom']}>
      {scroll ? <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }} keyboardShouldPersistTaps="handled">{children}</ScrollView> : <View style={{ flex: 1, padding: 16, gap: 14 }}>{children}</View>}
    </SafeAreaView>
  );
}

export function Button({ title, onPress, kind = 'primary', disabled, testID }: { title: string; onPress: () => void; kind?: 'primary' | 'secondary'; disabled?: boolean; testID?: string }) {
  return (
    <Pressable testID={testID} role="button" aria-label={title} accessibilityRole="button" disabled={disabled} onPress={onPress} style={({ pressed }) => [s.btn, kind === 'secondary' && s.btn2, (pressed || disabled) && { opacity: 0.6 }]}>
      <Text style={[s.btnText, kind === 'secondary' && { color: C.shab }]}>{title}</Text>
    </Pressable>
  );
}

export function Field({ label, ...props }: TextInputProps & { label: string }) {
  const { rtl } = useApp();
  return (
    <View style={{ gap: 4 }}>
      <Txt style={{ fontWeight: '600' }}>{label}</Txt>
      <TextInput aria-label={label} accessibilityLabel={label} placeholderTextColor={C.muted} style={[s.input, { textAlign: rtl ? 'right' : 'left' }]} {...props} />
    </View>
  );
}

/** A selectable chip (radio-like). */
export function Choice({ label, selected, onPress, testID }: { label: string; selected: boolean; onPress: () => void; testID?: string }) {
  return (
    <Pressable testID={testID} role="radio" aria-checked={selected} aria-label={label} onPress={onPress} style={[s.chip, selected && { backgroundColor: C.shab, borderColor: C.shab }]}>
      <Text style={{ color: selected ? C.dupatta : C.ink, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );
}

export function Card({ children, onPress, testID, label }: { children: ReactNode; onPress?: () => void; testID?: string; label?: string }) {
  if (!onPress) return <View testID={testID} style={s.card}>{children}</View>;
  return <Pressable testID={testID} role="link" aria-label={label} onPress={onPress} style={({ pressed }) => [s.card, pressed && { opacity: 0.85 }]}>{children}</Pressable>;
}

export function Pill({ text, tone = 'status' }: { text: string; tone?: 'status' | 'demo' | 'ok' }) {
  const bg = tone === 'demo' ? C.genda : tone === 'ok' ? '#e6f0df' : '#f1e6f5';
  return <Text style={[s.pill, { backgroundColor: bg, color: tone === 'ok' ? C.mehndiDeep : C.shab }]}>{text}</Text>;
}

export function Money({ paisa, style }: { paisa: number; style?: StyleProp<TextStyle> }) {
  const { locale } = useApp();
  return <Txt kind="price" style={style}>{formatPKR(paisa, locale)}</Txt>;
}

export function Loading() {
  return <ActivityIndicator color={C.rani} style={{ marginTop: 24 }} />;
}

export function ErrorText({ msg }: { msg: string }) {
  return msg ? <Txt kind="error">{msg}</Txt> : null;
}

const s = StyleSheet.create({
  h1: { fontSize: 24, fontWeight: '800', color: C.shab },
  h2: { fontSize: 18, fontWeight: '700', color: C.shab, marginTop: 4 },
  body: { fontSize: 15, color: C.ink },
  muted: { fontSize: 13, color: C.muted },
  price: { fontSize: 15, fontWeight: '700', color: C.ink },
  error: { fontSize: 14, color: C.raniDeep, fontWeight: '600' },
  btn: { backgroundColor: C.rani, borderRadius: 999, paddingVertical: 12, paddingHorizontal: 20, alignItems: 'center', minHeight: 44, justifyContent: 'center' },
  btn2: { backgroundColor: 'transparent', borderWidth: 2, borderColor: C.shab },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  input: { borderWidth: 1, borderColor: C.line, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, backgroundColor: '#fff', minHeight: 44, color: C.ink },
  chip: { borderWidth: 1, borderColor: C.line, borderRadius: 999, paddingVertical: 8, paddingHorizontal: 14, backgroundColor: '#fff', minHeight: 40, justifyContent: 'center' },
  card: { backgroundColor: C.card, borderWidth: 1, borderColor: C.line, borderRadius: 16, padding: 14, gap: 6 },
  pill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 2, fontSize: 12, fontWeight: '700', overflow: 'hidden', alignSelf: 'flex-start' },
});
