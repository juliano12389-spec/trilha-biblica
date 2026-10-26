import { useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';

import { createProduct } from '../../data/production';
import { BackLink, Button, Card, Chip, Field, Notice, Screen, ScreenTitle } from '../../components/ui';
import { PIZZA_SIZES, validateProductDraft, type PizzaSize } from '../../domain/production';
import { colors, space } from '../../theme';
import { errorMessage } from '../../lib/errors';

export default function NovoProdutoScreen() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [size, setSize] = useState<PizzaSize | ''>('');
  const [salePrice, setSalePrice] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (submitting) return;
    setError(null);
    const result = validateProductDraft({ code, name, category, size, salePrice });
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setSubmitting(true);
    try {
      await createProduct(result.value);
      router.back();
    } catch (caught) {
      setError(errorMessage(caught, 'Não foi possível cadastrar o sabor.'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Screen>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <BackLink onPress={() => router.back()} />
          <ScreenTitle title="Novo sabor" subtitle="Depois de cadastrar, publique a ficha técnica do sabor." />
          {error ? <Notice tone="error" message={error} /> : null}
          <Card>
            <Field label="Código *" value={code} onChangeText={setCode} autoCapitalize="characters" hint="Ex.: CAL-G" />
            <Field label="Nome do sabor *" value={name} onChangeText={setName} />
            <Field label="Categoria *" value={category} onChangeText={setCategory} hint="Ex.: Tradicionais, Especiais" />
            <Text style={styles.label}>Tamanho *</Text>
            <View style={styles.chipRow}>
              {PIZZA_SIZES.map((option) => (
                <Chip key={option.code} label={option.label} selected={size === option.code} onPress={() => setSize(option.code)} />
              ))}
            </View>
            <Field label="Preço de venda (R$) *" value={salePrice} onChangeText={setSalePrice} keyboardType="decimal-pad" />
          </Card>
          <Button label="Cadastrar sabor" icon="checkmark" onPress={() => void submit()} loading={submitting} />
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: space.lg, gap: space.lg, paddingBottom: space.xl },
  label: { fontSize: 13, fontWeight: '600', color: colors.text },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
});
