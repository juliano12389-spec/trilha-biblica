import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';

import { listIngredients } from '../../data/catalog';
import { createPreparoRecipe, publishRecipe } from '../../data/production';
import { BackLink, Button, Card, Chip, Field, Notice, Screen, ScreenTitle } from '../../components/ui';
import { RecipeLinesEditor, type DraftLine } from '../../components/RecipeLinesEditor';
import { Decimal } from '../../domain/decimal';
import { decimalPlaces } from '../../domain/stock';
import { validateRecipeLine } from '../../domain/production';
import { useLoader } from '../../hooks/useLoader';
import { colors, space } from '../../theme';

const loadIngredients = () => listIngredients();

export default function NovoPreparoScreen() {
  const router = useRouter();
  const ingredients = useLoader(loadIngredients);
  const { reload } = ingredients;
  useFocusEffect(useCallback(() => void reload(), [reload]));

  const [name, setName] = useState('');
  const [outputId, setOutputId] = useState('');
  const [yieldText, setYieldText] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // The output must be a stock ingredient of its own: it is also the product of the preparo.
  const outputs = ingredients.data ?? [];

  async function submit() {
    if (submitting) return;
    setError(null);
    if (name.trim().length < 2) return setError('Informe o nome do preparo.');
    if (outputId === '') return setError('Escolha o insumo que o preparo produz (ex.: Molho pronto).');
    const yieldValue = Decimal.parseUserInput(yieldText);
    if (yieldValue === null || !yieldValue.isPositive() || decimalPlaces(yieldValue) > 4) {
      return setError('Informe o rendimento esperado por lote (maior que zero, até 4 casas).');
    }
    if (lines.length === 0) return setError('Adicione os ingredientes que entram no preparo.');
    if (lines.some((line) => line.ingredientId === outputId)) {
      return setError('O preparo não pode consumir o próprio produto.');
    }
    const parsed = [];
    for (const line of lines) {
      const result = validateRecipeLine({ ...line });
      if (!result.ok) return setError(result.message);
      parsed.push({ ingredientId: line.ingredientId, quantity: result.value.quantityValue, split: 'inteira' as const });
    }

    setSubmitting(true);
    try {
      const recipeId = await createPreparoRecipe(name.trim(), outputId, yieldValue);
      await publishRecipe(recipeId, parsed);
      router.back();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível cadastrar o preparo.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Screen>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <BackLink onPress={() => router.back()} />
          <ScreenTitle title="Novo preparo" subtitle="Ex.: molho de tomate feito em lotes a partir de tomate, sal e temperos." />
          {error ? <Notice tone="error" message={error} /> : null}
          <Card>
            <Field label="Nome do preparo *" value={name} onChangeText={setName} />
            <Text style={styles.label}>Insumo que o preparo produz *</Text>
            <View style={styles.chipRow}>
              {outputs.map((item) => (
                <Chip key={item.id} label={item.name} selected={outputId === item.id} onPress={() => setOutputId(item.id)} />
              ))}
            </View>
            {ingredients.data && outputs.length === 0 ? (
              <Text style={styles.hint}>Cadastre o insumo de saída (ex.: Molho pronto) antes de criar o preparo.</Text>
            ) : null}
            <Field
              label="Rendimento esperado por lote *"
              value={yieldText}
              onChangeText={setYieldText}
              keyboardType="decimal-pad"
              hint="Na unidade de estoque do insumo de saída."
            />
          </Card>
          <Card>
            <Text style={styles.label}>Ingredientes por lote (consumidos inteiros)</Text>
            <RecipeLinesEditor lines={lines} onChange={setLines} ingredients={ingredients.data ?? []} mode="preparo" />
          </Card>
          <Button label="Cadastrar e publicar ficha" icon="checkmark" onPress={() => void submit()} loading={submitting} />
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
  hint: { fontSize: 12, color: colors.textMuted },
});
