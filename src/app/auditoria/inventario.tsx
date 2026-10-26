import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';

import { listIngredients, type IngredientListItem } from '../../data/catalog';
import { submitStocktake } from '../../data/gestao';
import { BackLink, Button, Card, Field, Notice, Screen, ScreenTitle } from '../../components/ui';
import { Decimal } from '../../domain/decimal';
import { formatQuantity } from '../../domain/format';
import { countDifference, formatPercent, validateCountLines } from '../../domain/gestao';
import { stockStatus } from '../../domain/ingredient';
import { useLoader } from '../../hooks/useLoader';
import { useRequestId } from '../../hooks/useRequestId';
import { colors, space } from '../../theme';

const loadIngredients = () => listIngredients();

export default function InventarioScreen() {
  const router = useRouter();
  const ingredients = useLoader(loadIngredients);
  const { reload } = ingredients;
  useFocusEffect(useCallback(() => void reload(), [reload]));

  const [counts, setCounts] = useState<Record<string, string>>({});
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState('');
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  const requestId = useRequestId(JSON.stringify({ counts, reasons, notes }));

  const items = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (ingredients.data ?? []).filter((item) => term === '' || item.name.toLowerCase().includes(term) || item.sku.toLowerCase().includes(term));
  }, [ingredients.data, search]);

  async function submit() {
    if (submitting) return;
    setError(null);
    setSent(false);
    const all = ingredients.data ?? [];
    const check = validateCountLines(
      all.map((item) => ({
        ingredientName: item.name,
        system: item.balance,
        counted: counts[item.id] ?? '',
        reason: reasons[item.id] ?? '',
      })),
    );
    if (!check.ok) {
      setError(check.message);
      return;
    }
    const lines = all
      .filter((item) => (counts[item.id] ?? '').trim() !== '')
      .map((item) => ({
        ingredientId: item.id,
        counted: Decimal.parseUserInput(counts[item.id] ?? '') ?? Decimal.ZERO,
        reason: item.balance.compareTo(Decimal.parseUserInput(counts[item.id] ?? '') ?? Decimal.ZERO) === 0 ? null : (reasons[item.id] ?? '').trim(),
      }));
    setSubmitting(true);
    try {
      await submitStocktake(requestId, notes.trim(), lines);
      setSent(true);
      setCounts({});
      setReasons({});
      setNotes('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível enviar a contagem.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Screen>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <BackLink onPress={() => router.back()} />
          <ScreenTitle title="Inventário físico" subtitle="Informe o que foi contado. Só insumos preenchidos entram na contagem. Divergências exigem motivo." />
          {error ? <Notice tone="error" message={error} /> : null}
          {sent ? <Notice tone="info" message="Contagem enviada para aprovação do administrador. O saldo só muda depois da aprovação." /> : null}
          {ingredients.error ? <Notice tone="error" message={ingredients.error} /> : null}

          <Field label="Buscar insumo" value={search} onChangeText={setSearch} autoCorrect={false} />

          {items.map((item) => (
            <CountRow
              key={item.id}
              item={item}
              counted={counts[item.id] ?? ''}
              reason={reasons[item.id] ?? ''}
              onCount={(value) => setCounts((current) => ({ ...current, [item.id]: value }))}
              onReason={(value) => setReasons((current) => ({ ...current, [item.id]: value }))}
            />
          ))}

          <Field label="Observações da contagem" value={notes} onChangeText={setNotes} multiline />
          <Button label="Enviar contagem para aprovação" icon="send-outline" onPress={() => void submit()} loading={submitting} />
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function CountRow({
  item,
  counted,
  reason,
  onCount,
  onReason,
}: {
  item: IngredientListItem;
  counted: string;
  reason: string;
  onCount: (value: string) => void;
  onReason: (value: string) => void;
}) {
  const parsed = Decimal.parseUserInput(counted);
  // Quantity and percentage only; the financial impact is shown when the count is approved.
  const diff = parsed === null || counted.trim() === '' ? null : countDifference(item.balance, parsed, Decimal.ZERO);
  const diverges = diff !== null && !diff.difference.isZero();
  const lowStock = stockStatus(item.balance, item.minimumStock) === 'abaixo_minimo';

  return (
    <Card style={styles.row}>
      <View style={styles.rowTop}>
        <View style={styles.rowText}>
          <Text style={styles.name}>{item.name}</Text>
          <Text style={styles.meta}>
            Sistema: {formatQuantity(item.balance, item.stockUnit)}
            {lowStock ? ' • abaixo do mínimo' : ''}
          </Text>
        </View>
      </View>
      <Field label={`Contagem (${item.stockUnit})`} value={counted} onChangeText={onCount} keyboardType="decimal-pad" />
      {diverges && diff ? (
        <>
          <Text style={[styles.meta, { color: colors.danger }]}>
            Diferença {diff.difference.isPositive() ? '+' : ''}{diff.difference.toString()} {item.stockUnit}
            {diff.percent ? ` (${formatPercent(diff.percent)})` : ''}
          </Text>
          <Field label="Motivo da divergência *" value={reason} onChangeText={onReason} placeholder="Ex.: queda na câmara, sobra na contagem" />
        </>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: space.lg, gap: space.md, paddingBottom: space.xl },
  row: { gap: space.sm },
  rowTop: { flexDirection: 'row', alignItems: 'center' },
  rowText: { flex: 1, gap: 2 },
  name: { fontSize: 15, fontWeight: '800', color: colors.text },
  meta: { fontSize: 12, color: colors.textMuted },
});
