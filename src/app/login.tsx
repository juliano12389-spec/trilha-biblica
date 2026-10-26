import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button, Field, Notice, Screen } from '../components/ui';
import { friendlyAuthError } from '../features/auth/AuthProvider';
import { supabase } from '../lib/supabase';
import { colors, space } from '../theme';

export default function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    if (email.trim() === '' || password === '') {
      setError('Informe o e-mail e a senha.');
      return;
    }
    setSubmitting(true);
    const { error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setSubmitting(false);
    if (authError) {
      setError(friendlyAuthError(authError.message));
    }
    // On success the auth gate in the root layout redirects.
  }

  return (
    <Screen>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.brand}>
            <View style={styles.mark}>
              <Ionicons name="cube" size={30} color={colors.surface} />
            </View>
            <Text style={styles.name}>StockPro</Text>
            <Text style={styles.tagline}>Controle de estoque para pizzarias</Text>
          </View>

          <View style={styles.form}>
            <Text style={styles.heading}>Entrar</Text>
            {error ? <Notice tone="error" message={error} /> : null}
            <Field
              label="E-mail"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              textContentType="emailAddress"
            />
            <Field
              label="Senha"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="password"
              textContentType="password"
              onSubmitEditing={() => void submit()}
              returnKeyType="go"
            />
            <Button label="Entrar" onPress={() => void submit()} loading={submitting} />
            <Button label="Criar conta" variant="ghost" onPress={() => router.push('/cadastro')} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { flexGrow: 1, padding: space.lg, justifyContent: 'center', gap: space.xl },
  brand: { alignItems: 'center', gap: space.sm },
  mark: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: { fontSize: 26, fontWeight: '800', color: colors.text },
  tagline: { fontSize: 14, color: colors.textMuted },
  form: { gap: space.md },
  heading: { fontSize: 20, fontWeight: '800', color: colors.text },
});
