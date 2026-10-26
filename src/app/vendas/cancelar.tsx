import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';

import { cancelSale, listSaleItems } from '../../data/sales';
import { BackLink, Button, Card, Field, Notice, Screen, ScreenTitle } from '../../components/ui';
import { validateCancellationReason, validateRecovered } from '../../domain/sales';
import { useLoader } from '../../hooks/useLoader';
import { colors, space } from '../../theme';

export default function CancelarVendaScreen() {
  const router = useRouter();
  const { saleId, number } = useLocalSearchParams<{ saleId: string; number?: string }>();
  const items = useLoader(useCallback(() => listSaleItems(saleId), [saleId]));

  const [reason, setReason] = useState('');
  const [recovered, setRecovered] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (submitting) return;
    setError(null);
    const motive = validateCancellationReason(reason);
    if (!motive.ok) {
      setError(motive.message);
      return;
    }
    const rows = (items.data ?? []).map((item) => ({ itemId: item.id, pizzas: item.pizzas, recovered: recovered[item.id] ?? '' }));
    const counts = validateRecovered(rows);
    if (!counts.ok) {
      setError(counts.message);
      return;
    }
    setSubmitting(true);
    try {
      await cancelSale(saleId, motive.value, counts.value);
      router.back();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível cancelar a venda.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Screen>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <BackLink onPress={() => router.back()} />
          <ScreenTitle title={`Cancelar pedido #${number ?? ''}`} subtitle="Informe quantas pizzas foram efetivamente recuperadas. Só elas voltam ao estoque." />
          {error ? <Notice tone="error" message={error} /> : null}
          {items.error ? <Notice tone="error" message={items.error} /> : null}

          <Card>
            <Text style={styles.sectionTitle}>Itens da venda</Text>
            {(items.data ?? []).map((item) => (
              <View key={item.id} style={styles.item}>
                <Text style={styles.name}>
                  {item.pizzas} × {item.productAName}
                  {item.productBName ? ` / ${item.productBName}` : ''}
                </Text>
                <Field
                  label={`Recuperadas (de ${item.pizzas})`}
                  value={recovered[item.id] ?? ''}
                  onChangeText={(value) => setRecovered((current) => ({ ...current, [item.id]: value }))}
                  keyboardType="number-pad"
                  placeholder="0"
                />
              </View>
            ))}
            <Text style={styles.hint}>
              Pizzas montadas e não entregues, mas intactas, podem ser recuperadas. Ingredientes gastos ou pizzas descartadas não voltam.
            </Text>
          </Card>

          <Card>
            <Field label="Motivo do cancelamento *" value={reason} onChangeText={setReason} multiline />
          </Card>

          <Button label="Confirmar cancelamento" variant="secondary" icon="close-circle-outline" onPress={() => void submit()} loading={submitting} />
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: space.lg, gap: space.lg, paddingBottom: space.xl },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: colors.text },
  item: { gap: space.xs, paddingVertical: space.xs },
  name: { fontSize: 14, fontWeight: '700', color: colors.text },
  hint: { fontSize: 12, color: colors.textMuted, lineHeight: 17 },
});
