import { Tabs } from 'expo-router';
import { Pressable, Text, type ColorValue } from 'react-native';
import { useApp } from '@/lib/app';
import { C } from '@/ui/theme';

const icon = (glyph: string) => ({ color }: { color: ColorValue }) => <Text style={{ color, fontSize: 18 }}>{glyph}</Text>;

export default function TabsLayout() {
  const { t, toggleLocale } = useApp();
  const lang = () => (
    <Pressable onPress={toggleLocale} role="button" aria-label={t('language')} style={{ paddingHorizontal: 16 }}>
      <Text style={{ color: C.genda, fontWeight: '700', fontSize: 15 }}>{t('language')}</Text>
    </Pressable>
  );
  return (
    <Tabs screenOptions={{ headerStyle: { backgroundColor: C.shab }, headerTintColor: C.dupatta, headerRight: lang, tabBarActiveTintColor: C.rani, tabBarInactiveTintColor: C.muted, sceneStyle: { backgroundColor: C.dupatta } }}>
      <Tabs.Screen name="index" options={{ title: t('home'), headerTitle: 'RUNG رنگ', tabBarIcon: icon('✿') }} />
      <Tabs.Screen name="search" options={{ title: t('search'), tabBarIcon: icon('⌕') }} />
      <Tabs.Screen name="cart" options={{ title: t('cart'), tabBarIcon: icon('🛍') }} />
      <Tabs.Screen name="account" options={{ title: t('account'), tabBarIcon: icon('☺') }} />
    </Tabs>
  );
}
