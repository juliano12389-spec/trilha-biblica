import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider, useAuth } from '../features/auth/AuthProvider';
import { isSupabaseConfigured } from '../lib/supabase';
import { Button, EmptyState, Notice, Screen } from '../components/ui';
import { colors, space } from '../theme';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      {isSupabaseConfigured ? (
        <AuthProvider>
          <AuthGate />
        </AuthProvider>
      ) : (
        <SetupRequired />
      )}
    </SafeAreaProvider>
  );
}

const PUBLIC_ROUTES = new Set(['login', 'cadastro']);
const ONBOARDING_ROUTES = new Set(['criar-organizacao']);

function AuthGate() {
  const { state, refreshProfile, signOut } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const firstSegment = segments[0] as string | undefined;

  useEffect(() => {
    if (state.status === 'loading' || state.status === 'error') return;

    if (state.status === 'signed-out') {
      if (!PUBLIC_ROUTES.has(firstSegment ?? '')) router.replace('/login');
      return;
    }
    if (state.status === 'needs-organization') {
      if (!ONBOARDING_ROUTES.has(firstSegment ?? '')) router.replace('/criar-organizacao');
      return;
    }
    if (PUBLIC_ROUTES.has(firstSegment ?? '') || ONBOARDING_ROUTES.has(firstSegment ?? '')) {
      router.replace('/');
    }
  }, [state.status, firstSegment, router]);

  if (state.status === 'loading') {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (state.status === 'error') {
    return (
      <Screen>
        <View style={styles.errorBox}>
          <EmptyState
            icon="cloud-offline-outline"
            title="Não foi possível abrir o aplicativo"
            description="Verifique a conexão e tente novamente."
            action={
              <View style={styles.errorActions}>
                <Notice tone="error" message={state.message} />
                <Button label="Tentar novamente" icon="refresh" onPress={() => void refreshProfile()} />
                <Button label="Sair" variant="ghost" onPress={() => void signOut()} />
              </View>
            }
          />
        </View>
      </Screen>
    );
  }

  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }} />;
}

function SetupRequired() {
  return (
    <Screen>
      <View style={styles.errorBox}>
        <EmptyState
          icon="settings-outline"
          title="Configure o Supabase"
          description="Defina EXPO_PUBLIC_SUPABASE_URL e EXPO_PUBLIC_SUPABASE_ANON_KEY em um arquivo .env.local. Veja o README."
        />
        <Text style={styles.setupHint}>Somente a URL pública e a chave anon entram no aplicativo.</Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  errorBox: { flex: 1, justifyContent: 'center', padding: space.lg },
  errorActions: { width: '100%', gap: space.md, marginTop: space.md },
  setupHint: { textAlign: 'center', color: colors.textMuted, fontSize: 13, paddingHorizontal: space.lg },
});
