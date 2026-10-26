import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { listProducts, type ProductItem } from '../../data/production';
import { registerSale, type SaleItemInput } from '../../data/sales';
import { BackLink, Button, Card, Chip, Field, Notice, Screen, ScreenTitle } from '../../components/ui';
import { formatBRL } from '../../domain/format';
import { PIZZA_SIZES, validatePizzaOrder } from '../../domain/production';
import { CHANNELS, PAYMENTS, pizzaUnitPrice, saleSubtotal, validateDiscount } from '../../domain/sales';
import { Decimal } from '../../domain/decimal';
import { useLoader } from '../../hooks/useLoader';
import { useRequestId } from '../../hooks/useRequestId';
import { colors, radius, space } from '../../theme';

const loadProducts = () => listProducts();

interface DraftItem extends SaleItemInput {
  label: string;
  unitPrice: Decimal;
}

export default function NovaVendaScreen() {
  const router = useRouter();
  const products = useLoader(loadProducts);
  const { reload } = products;
  useFocusEffect(useCallback(() => void reload(), [reload]));

  const [channel, setChannel] = useState('balcao');
  const [externalId, setExternalId] = useState('');
  const [payment, setPayment] = useState<string | null>(null);
  const [discountText, setDiscountText] = useState('');
  const [items, setItems] = useState<DraftItem[]>([]);

  const [productA, setProductA] = useState<string | null>(null);
  const [halfAndHalf, setHalfAndHalf] = useState(false);
  const [productB, setProductB] = useState<string | null>(null);
  const [pizzasText, setPizzasText] = useState('');
  const [itemError, setItemError] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const available = useMemo(() => (products.data ?? []).filter((item) => item.hasRecipe), [products.data]);
  const first: ProductItem | null = available.find((item) => item.id === productA) ?? null;
  const secondChoices = available.filter((item) => item.id !== productA && (!first || item.size === first.size));

  const subtotal = saleSubtotal(items.map((item) => ({ unitPrice: item.unitPrice, pizzas: item.pizzas })));
  const discount = validateDiscount(discountText, subtotal);

  const requestId = useRequestId(JSON.stringify({ channel, externalId, payment, discountText, items }));

  function addItem() {
    setItemError(null);
    const order = validatePizzaOrder({ productA, productB: halfAndHalf ? productB : null, pizzas: pizzasText });
    if (!order.ok) {
      setItemError(order.message);
      return;
    }
    const a = available.find((item) => item.id === order.value.productA);
    const b = order.value.productB ? available.find((item) => item.id === order.value.productB) : undefined;
    if (!a || (order.value.productB && !b)) {
      setItemError('Sabor não encontrado. Atualize a lista e tente de novo.');
      return;
    }
    const label = b ? `${a.name} / ${b.name}` : a.name;
    setItems((current) => [
      ...current,
      {
        productA: a.id,
        productB: b?.id ?? null,
        pizzas: order.value.pizzas,
        label,
        unitPrice: pizzaUnitPrice(a.salePrice, b?.salePrice ?? null),
      },
    ]);
    setProductA(null);
    setProductB(null);
    setHalfAndHalf(false);
    setPizzasText('');
  }

  async function submit() {
    if (submitting) return;
    setError(null);
    if (items.length === 0) {
      setError('Adicione ao menos um item à venda.');
      return;
    }
    if (!discount.ok) {
      setError(discount.message);
      return;
    }
    if (channel === 'delivery' && externalId.trim() === '') {
      setError('Informe o número do pedido do aplicativo de delivery.');
      return;
    }
    setSubmitting(true);
    try {
      await registerSale(requestId, channel, externalId.trim(), items, discount.value, payment, '');
      router.back();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível registrar a venda.');
    } finally {
      setSubmitting(false);
    }
  }

  const discountValue = discount.ok ? discount.value : Decimal.ZERO;
  const total = discount.ok ? subtotal.subtract(discountValue) : subtotal;

  return (
    <Screen>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <BackLink onPress={() => router.back()} />
          <ScreenTitle title="Nova venda" subtitle="Canal, itens e pagamento. O estoque é baixado conforme o modo configurado." />
          {error ? <Notice tone="error" message={error} /> : null}
          {products.error ? <Notice tone="error" message={products.error} /> : null}

          <Card>
            <Text style={styles.label}>Canal *</Text>
            <View style={styles.chipRow}>
              {CHANNELS.map((option) => (
                <Chip key={option.code} label={option.label} selected={channel === option.code} onPress={() => setChannel(option.code)} />
              ))}
            </View>
            {channel === 'delivery' ? (
              <Field label="Número do pedido no aplicativo *" value={externalId} onChangeText={setExternalId} autoCapitalize="characters" hint="Reenviar o mesmo pedido não cria outra venda." />
            ) : null}
          </Card>

          <Card>
            <Text style={styles.sectionTitle}>Itens</Text>
            {items.map((item, index) => (
              <View key={`${item.productA}-${item.productB ?? ''}-${index}`} style={styles.itemRow}>
                <View style={styles.itemText}>
                  <Text style={styles.name}>{item.pizzas} × {item.label}</Text>
                  <Text style={styles.meta}>{formatBRL(item.unitPrice)} cada</Text>
                </View>
                <Text style={styles.total}>{formatBRL(item.unitPrice.multiply(item.pizzas))}</Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Remover ${item.label}`}
                  onPress={() => setItems((current) => current.filter((_, position) => position !== index))}
                  style={styles.remove}
                >
                  <Ionicons name="trash-outline" size={16} color={colors.danger} />
                </Pressable>
              </View>
            ))}

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
                  }}
                />
              ))}
            </View>
            <View style={styles.chipRow}>
              <Chip label="Inteira" selected={!halfAndHalf} onPress={() => { setHalfAndHalf(false); setProductB(null); }} />
              <Chip label="Meio a meio" selected={halfAndHalf} onPress={() => setHalfAndHalf(true)} />
            </View>
            {halfAndHalf ? (
              <View style={styles.chipRow}>
                {secondChoices.map((item) => (
                  <Chip key={item.id} label={item.name} selected={productB === item.id} onPress={() => setProductB(item.id)} />
                ))}
              </View>
            ) : null}
            <Field label="Quantidade de pizzas *" value={pizzasText} onChangeText={setPizzasText} keyboardType="number-pad" />
            {itemError ? <Notice tone="error" message={itemError} /> : null}
            <Button label="Adicionar item" variant="secondary" icon="add" onPress={addItem} />
          </Card>

          <Card>
            <Text style={styles.label}>Forma de pagamento</Text>
            <View style={styles.chipRow}>
              {PAYMENTS.map((option) => (
                <Chip key={option.code} label={option.label} selected={payment === option.code} onPress={() => setPayment(payment === option.code ? null : option.code)} />
              ))}
            </View>
            <Field label="Desconto (R$)" value={discountText} onChangeText={setDiscountText} keyboardType="decimal-pad" error={!discount.ok && discountText.trim() !== '' ? discount.message : undefined} />
            <View style={styles.totals}>
              <Text style={styles.meta}>Subtotal {formatBRL(subtotal)}</Text>
              <Text style={styles.totalBig}>Total {formatBRL(total)}</Text>
            </View>
          </Card>

          <Button label="Registrar venda" icon="checkmark" onPress={() => void submit()} loading={submitting} />
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
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.xs, borderTopWidth: 1, borderTopColor: colors.border },
  itemText: { flex: 1, gap: 2 },
  name: { fontSize: 14, fontWeight: '700', color: colors.text },
  meta: { fontSize: 12, color: colors.textMuted },
  total: { fontSize: 14, fontWeight: '800', color: colors.text },
  remove: { width: 30, height: 30, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.dangerSoft },
  totals: { gap: space.xs, alignItems: 'flex-end' },
  totalBig: { fontSize: 18, fontWeight: '800', color: colors.text },
});
