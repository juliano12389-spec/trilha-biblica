import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';

import { listPreparoRecipes, registerPreparation } from '../../data/production';
import { BackLink, Button, Card, Chip, Field, Notice, Screen, ScreenTitle } from '../../components/ui';
import { formatNumber } from '../../domain/format';
import { validatePreparoBatch } from '../../domain/production';
import { todayIso } from '../../domain/stock';
import { useLoader } from '../../hooks/useLoader';
import { useRequestId } from '../../hooks/useRequestId';
import { colors, space } from '../../theme';
import { errorMessage } from '../../lib/errors';

const loadPreparos = () => listPreparoRecipes();

export default function ProducaoPreparoScreen() {
  const router = useRouter();
  const preparos = useLoader(loadPreparos);
  const { reload } = preparos;
  useFocusEffect(useCallback(() => void reload(), [reload]));

  const [recipeId, setRecipeId] = useState<string | null>(null);
  const [batches, setBatches] = useState('1');
  const [actualYield, setActualYield] = useState('');
  const [lotCode, setLotCode] = useState('');
  const [expiresOn, setExpiresOn] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const available = useMemo(() => (preparos.data ?? []).filter((item) => item.hasRecipe), [preparos.data]);
  const recipe = available.find((item) => item.id === recipeId) ?? null;

  const requestId = useRequestId(JSON.stringify({ recipeId, batches, actualYield, lotCode, expiresOn, notes }));

  async function submit() {
    if (submitting || !recipe) {
      if (!recipe) setError('Escolha o preparo.');
      return;
    }
    setError(null);
    const result = validatePreparoBatch({
      batches,
      actualYield,
      lotCode,
      expiresOn,
      expectedYield: recipe.yieldQuantity,
      today: todayIso(),
    });
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setSubmitting(true);
    try {
      await registerPreparation(
        requestId,
        recipe.id,
        result.value.batches,
        result.value.actualYield,
        result.value.lotCode,
        result.value.expiresOn,
        notes.trim(),
      );
      router.back();
    } catch (caught) {
      setError(errorMessage(caught, 'Não foi possível registrar o preparo.'));
    } finally {
      setSubmitting(false);
    }
  }

  const expected = recipe && batches.trim() !== '' && Number.isInteger(Number(batches)) ? recipe.yieldQuantity.multiply(Number(batches)) : null;

  return (
    <Screen>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <BackLink onPress={() => router.back()} />
          <ScreenTitle title="Produzir preparo" subtitle="Consome os insumos da ficha e gera um lote do produto, com o custo calculado." />
          {error ? <Notice tone="error" message={error} /> : null}
          {preparos.error ? <Notice tone="error" message={preparos.error} /> : null}

          <Card>
            <Text style={styles.label}>Preparo *</Text>
            <View style={styles.chipRow}>
              {available.map((item) => (
                <Chip key={item.id} label={item.name} selected={recipeId === item.id} onPress={() => setRecipeId(item.id)} />
              ))}
            </View>
            {preparos.data && available.length === 0 ? (
              <Text style={styles.hint}>Nenhum preparo com ficha publicada. Publique em Fichas técnicas.</Text>
            ) : null}
            <Field label="Quantidade de lotes *" value={batches} onChangeText={setBatches} keyboardType="number-pad" />
            {recipe && expected ? (
              <Text style={styles.hint}>
                Rendimento esperado: {formatNumber(expected, 2)} {recipe.outputUnit}. O real será informado abaixo.
              </Text>
            ) : null}
            <Field
              label={`Rendimento real obtido (${recipe?.outputUnit ?? 'unidade de estoque'}) *`}
              value={actualYield}
              onChangeText={setActualYield}
              keyboardType="decimal-pad"
              hint="A diferença para o esperado vira perda no registro."
            />
            <Field label="Lote do preparo *" value={lotCode} onChangeText={setLotCode} autoCapitalize="characters" placeholder="Ex.: MOLHO-0101" />
            <Field label="Validade do preparo" value={expiresOn} onChangeText={setExpiresOn} autoCapitalize="none" placeholder="AAAA-MM-DD (opcional)" />
            <Field label="Observações" value={notes} onChangeText={setNotes} multiline />
          </Card>

          <Button label="Registrar produção do preparo" icon="checkmark" onPress={() => void submit()} loading={submitting} />
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
  hint: { fontSize: 12, color: colors.textMuted, lineHeight: 17 },
});
