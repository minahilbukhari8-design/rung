import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppProvider, useApp } from '@/lib/app';
import { C } from '@/ui/theme';

function Nav() {
  const { t } = useApp();
  return (
    <Stack screenOptions={{ headerStyle: { backgroundColor: C.shab }, headerTintColor: C.dupatta, headerTitleStyle: { fontWeight: '700' }, contentStyle: { backgroundColor: C.dupatta } }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="login" options={{ title: t('login'), presentation: 'modal' }} />
      <Stack.Screen name="product/[vendor]/[slug]" options={{ title: '' }} />
      <Stack.Screen name="service/[vendor]/[slug]" options={{ title: '' }} />
      <Stack.Screen name="order/[number]" options={{ title: t('myOrders') }} />
      <Stack.Screen name="booking/[number]" options={{ title: t('myBookings') }} />
      <Stack.Screen name="occasion/[slug]" options={{ title: t('occasions') }} />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AppProvider>
        <StatusBar style="light" />
        <Nav />
      </AppProvider>
    </SafeAreaProvider>
  );
}
