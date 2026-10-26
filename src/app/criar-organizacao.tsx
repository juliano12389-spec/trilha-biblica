import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';

import { Button, Field, Notice, Screen, ScreenTitle } from '../components/ui';
import { useAuth } from '../features/auth/AuthProvider';
import { supabase } from '../lib/supabase';
import { space } from '../theme';

export default function CriarOrganizacaoScreen() {
  const { state, refreshProfile, signOut } = useAuth();
  const suggestedOwner =
    state.status === 'needs-organization' ? String(state.session.user.user_metadata?.full_name ?? '') : '';

  const [pizzariaName, setPizzariaName] = useState('');
  const [ownerName, setOwnerName] = useState(suggestedOwner);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    if (pizzariaName.trim().length < 2) {
      setError('Informe o nome da pizzaria.');
      return;
    }
    if (ownerName.trim().length < 2) {
      setError('Informe o nome do responsável.');
      return;
    }

    setSubmitting(true);
    const { error: rpcError } = await supabase.rpc('create_organization', {
      p_name: pizzariaName.trim(),
      p_owner_name: ownerName.trim(),
    });
    if (rpcError) {
      setSubmitting(false);
      setError(rpcError.message);
      return;
    }
    // The gate moves to the app once the profile is loaded.
    await refreshProfile();
    setSubmitting(false);
  }

  return (
    <Screen>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <ScreenTitle
            title="Cadastre a sua pizzaria"
            subtitle="Você será o administrador e poderá convidar a equipe depois."
          />
          <View style={styles.form}>
            {error ? <Notice tone="error" message={error} /> : null}
            <Field label="Nome da pizzaria" value={pizzariaName} onChangeText={setPizzariaName} autoComplete="off" />
            <Field label="Nome do responsável" value={ownerName} onChangeText={setOwnerName} autoComplete="name" />
            <Button label="Criar pizzaria" onPress={() => void submit()} loading={submitting} />
            <Button label="Sair" variant="ghost" onPress={() => void signOut()} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: space.lg, gap: space.lg, flexGrow: 1 },
  form: { gap: space.md },
});
