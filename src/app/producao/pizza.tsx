import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';

import { listProducts, previewPizzaRequirements, registerPizzaProduction, type RequirementRow } from '../../data/production';
import { BackLink, Button, Card, Chip, Field, Notice, Pill, Screen, ScreenTitle } from '../../components/ui';
import { formatNumber } from '../../domain/format';
import { PIZZA_SIZES, validatePizzaOrder } from '../../domain/production';
import { todayIso } from '../../domain/stock';
import { useLoader } from '../../hooks/useLoader';
import { useRequestId } from '../../hooks/useRequestId';
import { colors, space } from '../../theme';

const loadProducts = () => listProducts();

export default function ProducaoPizzaScreen() {
  const router = useRouter();
  const products = useLoader(loadProducts);
  const { reload } = products;
  useFocusEffect(useCallback(() => void reload(), [reload]));

  const [productA, setProductA] = useState<string | null>(null);
  const [halfAndHalf, setHalfAndHalf] = useState(false);
  const [productB, setProductB] = useState<string | null>(null);
  const [pizzas, setPizzas] = useState('');
  const [producedOn, setProducedOn] = useState(() => todayIso());
  const [notes, setNotes] = useState('');
  const [requirements, setRequirements] = useState<RequirementRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const available = useMemo(() => (products.data ?? []).filter((item) => item.hasRecipe), [products.data]);
  const first = available.find((item) => item.id === productA) ?? null;
  const secondChoices = available.filter((item) => item.id !== productA && (!first || item.size === first.size));

  const requestId = useRequestId(JSON.stringify({ productA, productB: halfAndHalf ? productB : null, pizzas, producedOn, notes }));

  function currentOrder() {
    return validatePizzaOrder({
      productA,
      productB: halfAndHalf ? productB : null,
      pizzas,
    });
  }

  async function checkRequirements() {
    setError(null);
    const order = currentOrder();
    if (!order.ok) {
      setError(order.message);
      return;
    }
    try {
      setRequirements(await previewPizzaRequirements(order.value.productA, order.value.productB, order.value.pizzas));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível calcular os ingredientes.');
    }
  }

  async function submit() {
    if (submitting) return;
    setError(null);
    const order = currentOrder();
    if (!order.ok) {
      setError(order.message);
      return;
    }
    if (producedOn > todayIso()) {
      setError('A data da produção não pode ser futura.');
      return;
    }
    setSubmitting(true);
    try {
      await registerPizzaProduction(requestId, order.value.productA, order.value.productB, order.value.pizzas, producedOn, notes.trim());
      router.back();
    } catch (caught) {
      // The backend lists every missing ingredient when stock is short; show it as is.
      setError(caught instanceof Error ? caught.message : 'Não foi possível registrar a produção.');
    } finally {
      setSubmitting(false);
    }
  }

  const missing = (requirements ?? []).filter((row) => row.missing.isPositive());

  return (
    <Screen>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <BackLink onPress={() => router.back()} />
          <ScreenTitle title="Produzir pizzas" subtitle="A baixa dos ingredientes é automática, pela ficha publicada e pelo lote que vence primeiro." />

          {error ? <Notice tone="error" message={error} /> : null}
          {products.error ? <Notice tone="error" message={products.error} /> : null}

          <Card>
            <Text style={styles.label}>Sabor *</Text>
            <View style={styles.chipRow}>
              {available.map((item) => (
                <Chip
                  key={item.id}
                  label={`${item.name} • ${PIZZA_SIZES.find((size) => size.code === item.size)?.label}`}
                  selected={productA === item.id}
                  onPress={() => {
                    setProductA(item.id);
                    setProductB(null);
                    setRequirements(null);
                  }}
                />
              ))}
            </View>
            {products.data && available.length === 0 ? (
              <Text style={styles.hint}>Nenhum sabor com ficha publicada. Publique a ficha em Fichas técnicas.</Text>
            ) : null}

            <View style={styles.chipRow}>
              <Chip label="Inteira (1 sabor)" selected={!halfAndHalf} onPress={() => { setHalfAndHalf(false); setProductB(null); }} />
              <Chip label="Meio a meio" selected={halfAndHalf} onPress={() => setHalfAndHalf(true)} />
            </View>

            {halfAndHalf ? (
              <>
                <Text style={styles.label}>Segundo sabor *</Text>
                <View style={styles.chipRow}>
                  {secondChoices.map((item) => (
                    <Chip key={item.id} label={item.name} selected={productB === item.id} onPress={() => setProductB(item.id)} />
                  ))}
                </View>
                {productA && secondChoices.length === 0 ? (
                  <Text style={styles.hint}>Não há outro sabor com ficha no mesmo tamanho.</Text>
                ) : null}
              </>
            ) : null}

            <Field label="Quantidade de pizzas *" value={pizzas} onChangeText={setPizzas} keyboardType="number-pad" />
            <Field label="Data da produção" value={producedOn} onChangeText={setProducedOn} autoCapitalize="none" placeholder="AAAA-MM-DD" />
            <Field label="Observações" value={notes} onChangeText={setNotes} multiline />
          </Card>

          <Button label="Ver ingredientes necessários" variant="secondary" icon="list-outline" onPress={() => void checkRequirements()} />

          {requirements ? (
            <Card>
              <Text style={styles.sectionTitle}>Ingredientes necessários</Text>
              {requirements.length === 0 ? <Text style={styles.hint}>Nenhum ingrediente na ficha.</Text> : null}
              {requirements.map((row) => (
                <View key={row.ingredientId} style={styles.reqRow}>
                  <View style={styles.reqText}>
                    <Text style={styles.reqName}>{row.name}</Text>
                    <Text style={styles.reqMeta}>
                      precisa {formatNumber(row.required, 2)} {row.unit} • disponível {formatNumber(row.available, 2)} {row.unit}
                    </Text>
                  </View>
                  {row.missing.isPositive() ? <Pill label="Falta" tone="danger" /> : <Pill label="OK" tone="success" />}
                </View>
              ))}
              {missing.length > 0 ? (
                <Notice tone="error" message="Há faltas: a produção não pode ser confirmada com esses ingredientes." />
              ) : null}
            </Card>
          ) : null}

          <Button label="Confirmar produção" icon="checkmark" onPress={() => void submit()} loading={submitting} />
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: space.lg, gap: space.lg, paddingBottom: space.xl },
  label: { fontSize: 13, fontWeight: '600', color: colors.text },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: colors.text },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  hint: { fontSize: 12, color: colors.textMuted, lineHeight: 17 },
  reqRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.xs },
  reqText: { flex: 1, gap: 2 },
  reqName: { fontSize: 14, fontWeight: '700', color: colors.text },
  reqMeta: { fontSize: 12, color: colors.textMuted },
});
