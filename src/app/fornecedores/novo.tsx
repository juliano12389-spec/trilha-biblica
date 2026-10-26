import { useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native';

import { createSupplier } from '../../data/catalog';
import { BackLink, Button, Card, Field, Notice, Screen, ScreenTitle } from '../../components/ui';
import { space } from '../../theme';
import { errorMessage } from '../../lib/errors';

export default function NovoFornecedorScreen() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [document, setDocument] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<{ name?: string; document?: string; email?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (submitting) return;
    setFormError(null);
    const digits = document.replace(/\D/g, '');
    const nextErrors: typeof errors = {};
    if (name.trim().length < 2) nextErrors.name = 'Informe o nome (mínimo de 2 caracteres).';
    if (digits !== '' && digits.length !== 11 && digits.length !== 14) {
      nextErrors.document = 'CPF tem 11 dígitos e CNPJ, 14. Deixe em branco se não souber.';
    }
    if (email.trim() !== '' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      nextErrors.email = 'Informe um e-mail válido.';
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSubmitting(true);
    try {
      await createSupplier({
        name: name.trim(),
        document: digits,
        phone: phone.trim(),
        email: email.trim(),
        notes: notes.trim(),
      });
      router.back();
    } catch (caught) {
      setFormError(errorMessage(caught, 'Não foi possível cadastrar o fornecedor.'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Screen>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <BackLink onPress={() => router.back()} />
          <ScreenTitle title="Novo fornecedor" subtitle="Só o nome é obrigatório." />
          {formError ? <Notice tone="error" message={formError} /> : null}
          <Card>
            <Field label="Nome ou razão social *" value={name} onChangeText={setName} error={errors.name} />
            <Field
              label="CPF ou CNPJ"
              value={document}
              onChangeText={setDocument}
              keyboardType="number-pad"
              error={errors.document}
              hint="Somente números. Opcional."
            />
            <Field label="Telefone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
            <Field
              label="E-mail"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              error={errors.email}
            />
            <Field label="Observações" value={notes} onChangeText={setNotes} multiline />
          </Card>
          <Button label="Cadastrar fornecedor" icon="checkmark" onPress={() => void submit()} loading={submitting} />
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: space.lg, gap: space.lg, paddingBottom: space.xl },
});
