import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button, Field, Notice, Screen, ScreenTitle } from '../components/ui';
import { friendlyAuthError } from '../features/auth/AuthProvider';
import { supabase } from '../lib/supabase';
import { colors, space } from '../theme';

export default function CadastroScreen() {
  const router = useRouter();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmationSent, setConfirmationSent] = useState(false);

  async function submit() {
    setError(null);
    if (fullName.trim().length < 2) {
      setError('Informe o seu nome.');
      return;
    }
    if (email.trim() === '') {
      setError('Informe o e-mail.');
      return;
    }
    if (password.length < 6) {
      setError('A senha precisa ter pelo menos 6 caracteres.');
      return;
    }

    setSubmitting(true);
    const { data, error: authError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { full_name: fullName.trim() } },
    });
    setSubmitting(false);

    if (authError) {
      setError(friendlyAuthError(authError.message));
      return;
    }
    // With e-mail confirmation enabled there is no session yet. Otherwise the
    // auth gate moves the user on to creating the organization.
    if (!data.session) {
      setConfirmationSent(true);
    }
  }

  return (
    <Screen>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Button
            label="Voltar"
            variant="ghost"
            icon="chevron-back"
            onPress={() => router.back()}
            style={styles.back}
          />
          <ScreenTitle title="Criar conta" subtitle="Depois você cadastra a sua pizzaria." />

          {confirmationSent ? (
            <View style={styles.form}>
              <Notice
                tone="info"
                message="Enviamos um e-mail de confirmação. Confirme o endereço e depois entre com a sua senha."
              />
              <Button label="Ir para o login" onPress={() => router.replace('/login')} />
            </View>
          ) : (
            <View style={styles.form}>
              {error ? <Notice tone="error" message={error} /> : null}
              <Field label="Seu nome" value={fullName} onChangeText={setFullName} autoComplete="name" />
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
                autoComplete="new-password"
                textContentType="newPassword"
                hint="Mínimo de 6 caracteres."
              />
              <Button label="Criar conta" onPress={() => void submit()} loading={submitting} />
              <View style={styles.footnote}>
                <Ionicons name="shield-checkmark-outline" size={16} color={colors.textMuted} />
                <Text style={styles.footnoteText}>Seus dados ficam protegidos por login e pelo isolamento da organização.</Text>
              </View>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: space.lg, gap: space.lg, flexGrow: 1 },
  back: { alignSelf: 'flex-start', paddingHorizontal: 0, minHeight: 36 },
  form: { gap: space.md },
  footnote: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.sm },
  footnoteText: { flex: 1, fontSize: 12, color: colors.textMuted },
});
