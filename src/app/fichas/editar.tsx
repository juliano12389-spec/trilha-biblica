import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text } from 'react-native';

import { listIngredients } from '../../data/catalog';
import { getCurrentRecipe, publishRecipe } from '../../data/production';
import { BackLink, Button, Card, Notice, Screen, ScreenTitle } from '../../components/ui';
import { RecipeLinesEditor, type DraftLine } from '../../components/RecipeLinesEditor';
import { validateRecipeLine } from '../../domain/production';
import { useLoader } from '../../hooks/useLoader';
import { colors, space } from '../../theme';

// Module-level so the loader keeps a stable identity across renders.
const loadIngredients = () => listIngredients();

export default function EditarFichaScreen() {
  const router = useRouter();
  const { recipeId, title, kind } = useLocalSearchParams<{ recipeId: string; title?: string; kind?: string }>();
  const ingredients = useLoader(loadIngredients);
  const current = useLoader(useCallback(() => getCurrentRecipe(recipeId), [recipeId]));
  const { reload: reloadIngredients } = ingredients;
  const { reload: reloadCurrent } = current;

  useFocusEffect(
    useCallback(() => {
      void reloadIngredients();
      void reloadCurrent();
    }, [reloadIngredients, reloadCurrent]),
  );

  const [lines, setLines] = useState<DraftLine[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // First load: copy the current version into editable lines, once.
  const draft: DraftLine[] = lines ?? (current.data?.lines ?? []).map((line) => ({
    ingredientId: line.ingredientId,
    ingredientName: line.ingredientName,
    consumptionUnit: line.consumptionUnit,
    quantity: line.quantity.toString(),
    split: line.split,
  }));

  async function save() {
    if (submitting) return;
    setError(null);
    if (draft.length === 0) {
      setError('A ficha precisa de ao menos um ingrediente.');
      return;
    }
    const parsed = [];
    for (const line of draft) {
      const result = validateRecipeLine({ ...line });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      parsed.push({ ingredientId: line.ingredientId, quantity: result.value.quantityValue, split: line.split });
    }
    setSubmitting(true);
    try {
      await publishRecipe(recipeId, parsed);
      router.back();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível publicar a ficha.');
    } finally {
      setSubmitting(false);
    }
  }

  const nextVersion = (current.data?.versionNumber ?? 0) + 1;

  return (
    <Screen>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <BackLink onPress={() => router.back()} />
          <ScreenTitle
            title={title ?? 'Ficha técnica'}
            subtitle={
              current.data
                ? `Versão atual: ${current.data.versionNumber}. Salvar publica a versão ${nextVersion}.`
                : 'Ainda sem ficha publicada. Salvar publica a versão 1.'
            }
          />
          {error ? <Notice tone="error" message={error} /> : null}
          {current.error ? <Notice tone="error" message={current.error} /> : null}
          <Card>
            <RecipeLinesEditor lines={draft} onChange={setLines} ingredients={ingredients.data ?? []} mode={kind === 'preparo' ? 'preparo' : 'pizza'} />
          </Card>
          <Text style={styles.note}>
            Versões publicadas não mudam. Ordens de produção antigas continuam com a ficha que foi usada na época.
          </Text>
          <Button label={`Publicar versão ${nextVersion}`} icon="checkmark" onPress={() => void save()} loading={submitting} />
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: space.lg, gap: space.lg, paddingBottom: space.xl },
  note: { fontSize: 12, color: colors.textMuted, lineHeight: 17 },
});
