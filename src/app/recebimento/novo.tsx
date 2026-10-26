import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState, type ComponentProps } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { listIngredients, listSuppliers, type IngredientListItem } from '../../data/catalog';
import { createReceipt } from '../../data/stock';
import { BackLink, Button, Card, Chip, Field, Notice, Screen, ScreenTitle } from '../../components/ui';
import { formatBRL, formatDateBr } from '../../domain/format';
import {
  isIsoDate,
  receiptTotal,
  todayIso,
  validateReceiptItem,
  type ReceiptItem,
  type ReceiptItemInput,
} from '../../domain/stock';
import { useLoader } from '../../hooks/useLoader';
import { useRequestId } from '../../hooks/useRequestId';
import { colors, radius, space } from '../../theme';
import { errorMessage } from '../../lib/errors';

interface ItemDraft {
  ingredientId: string;
  quantity: string;
  unitCost: string;
  lotCode: string;
  manufacturedOn: string;
  expiresOn: string;
}

const EMPTY_ITEM: ItemDraft = {
  ingredientId: '',
  quantity: '',
  unitCost: '',
  lotCode: '',
  manufacturedOn: '',
  expiresOn: '',
};

export default function NovoRecebimentoScreen() {
  const router = useRouter();
  const suppliers = useLoader(listSuppliers);
  const ingredients = useLoader(listIngredients);
  const { reload: reloadSuppliers } = suppliers;
  const { reload: reloadIngredients } = ingredients;

  useFocusEffect(
    useCallback(() => {
      void reloadSuppliers();
      void reloadIngredients();
    }, [reloadSuppliers, reloadIngredients]),
  );

  const [supplierId, setSupplierId] = useState('');
  const [documentNumber, setDocumentNumber] = useState('');
  const [receivedOn, setReceivedOn] = useState(() => todayIso());
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<ReceiptItem[]>([]);

  const [itemOpen, setItemOpen] = useState(false);
  const [itemDraft, setItemDraft] = useState<ItemDraft>(EMPTY_ITEM);
  const [itemError, setItemError] = useState<string | null>(null);

  const [errors, setErrors] = useState<{ supplier?: string; receivedOn?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // A retry of unchanged content reuses the id, so it cannot post twice.
  // Decimal values hold BigInts, which JSON cannot serialise, so the key is built from strings.
  const requestId = useRequestId(
    JSON.stringify({
      supplierId,
      documentNumber,
      receivedOn,
      notes,
      items: items.map((item) => [item.ingredientId, item.quantity.toString(), item.unitCost.toString(), item.lotCode, item.manufacturedOn, item.expiresOn]),
    }),
  );

  const selectedIngredient = (ingredients.data ?? []).find((item) => item.id === itemDraft.ingredientId) ?? null;
  const total = receiptTotal(items);

  function updateItemDraft<K extends keyof ItemDraft>(field: K, value: ItemDraft[K]) {
    setItemDraft((current) => ({ ...current, [field]: value }));
    setItemError(null);
  }

  function addItem() {
    if (!selectedIngredient) {
      setItemError('Escolha o insumo recebido.');
      return;
    }
    const input: ReceiptItemInput = {
      ingredientId: selectedIngredient.id,
      ingredientName: selectedIngredient.name,
      quantity: itemDraft.quantity,
      unitCost: itemDraft.unitCost,
      lotCode: itemDraft.lotCode,
      manufacturedOn: itemDraft.manufacturedOn,
      expiresOn: itemDraft.expiresOn,
      requiresExpiry: selectedIngredient.shelfLifeDays !== null,
    };
    const result = validateReceiptItem(input, todayIso());
    if (!result.ok) {
      setItemError(result.message);
      return;
    }
    const duplicate = items.some(
      (item) => item.ingredientId === result.value.ingredientId && item.lotCode.toLowerCase() === result.value.lotCode.toLowerCase(),
    );
    if (duplicate) {
      setItemError('Este lote desse insumo já está nesta nota.');
      return;
    }
    setItems((current) => [...current, result.value]);
    setItemDraft(EMPTY_ITEM);
    setItemOpen(false);
  }

  function removeItem(index: number) {
    setItems((current) => current.filter((_, position) => position !== index));
  }

  async function submit() {
    if (submitting) return;
    setFormError(null);
    const nextErrors: typeof errors = {};
    if (supplierId === '') nextErrors.supplier = 'Escolha o fornecedor.';
    if (!isIsoDate(receivedOn)) nextErrors.receivedOn = 'Use a data no formato AAAA-MM-DD.';
    else if (receivedOn > todayIso()) nextErrors.receivedOn = 'A data do recebimento não pode ser futura.';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      setFormError('Revise a nota fiscal antes de confirmar.');
      return;
    }
    if (items.length === 0) {
      setFormError('Adicione ao menos um item ao recebimento.');
      return;
    }

    setSubmitting(true);
    try {
      await createReceipt(
        { supplierId, documentNumber: documentNumber.trim(), receivedOn, notes: notes.trim() },
        items,
        requestId,
      );
      router.back();
    } catch (caught) {
      setFormError(errorMessage(caught, 'Não foi possível registrar o recebimento.'));
    } finally {
      setSubmitting(false);
    }
  }

  const suppliersList = suppliers.data ?? [];
  const ingredientsList = ingredients.data ?? [];

  return (
    <Screen>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <BackLink onPress={() => router.back()} />
          <ScreenTitle title="Registrar recebimento" subtitle="Nota fiscal, itens e lotes. Tudo é gravado de uma vez." />

          {formError ? <Notice tone="error" message={formError} /> : null}
          {suppliers.error ? <Notice tone="error" message={suppliers.error} /> : null}

          <Card>
            <SectionTitle icon="document-text-outline" title="Nota fiscal" />
            <Text style={styles.label}>Fornecedor *</Text>
            <View style={styles.chipWrap}>
              {suppliersList.map((supplier) => (
                <Chip
                  key={supplier.id}
                  label={supplier.name}
                  selected={supplierId === supplier.id}
                  onPress={() => {
                    setSupplierId(supplier.id);
                    setErrors((current) => ({ ...current, supplier: undefined }));
                  }}
                />
              ))}
            </View>
            {errors.supplier ? <Text style={styles.error}>{errors.supplier}</Text> : null}
            {suppliers.data && suppliersList.length === 0 ? (
              <>
                <Text style={styles.hint}>Nenhum fornecedor cadastrado. Cadastre um antes de receber mercadoria.</Text>
                <Button label="Cadastrar fornecedor" variant="secondary" icon="person-add-outline" onPress={() => router.push('/fornecedores/novo')} />
              </>
            ) : null}

            <Field
              label="Número da nota fiscal ou documento"
              value={documentNumber}
              onChangeText={setDocumentNumber}
              autoCapitalize="characters"
              hint="Opcional. Não é possível registrar a mesma nota duas vezes para o mesmo fornecedor."
            />
            <Field
              label="Data do recebimento"
              value={receivedOn}
              onChangeText={(value) => {
                setReceivedOn(value);
                setErrors((current) => ({ ...current, receivedOn: undefined }));
              }}
              placeholder="AAAA-MM-DD"
              autoCapitalize="none"
              error={errors.receivedOn}
            />
            <Field label="Observações" value={notes} onChangeText={setNotes} multiline />
          </Card>

          <Card>
            <SectionTitle icon="list-outline" title="Itens recebidos" />
            {items.length === 0 ? <Text style={styles.hint}>Nenhum item adicionado ainda.</Text> : null}
            {items.map((item, index) => (
              <View key={`${item.ingredientId}-${item.lotCode}-${index}`} style={styles.itemRow}>
                <View style={styles.itemText}>
                  <Text style={styles.itemName}>{item.ingredientName}</Text>
                  <Text style={styles.itemMeta}>
                    Lote {item.lotCode}
                    {item.expiresOn ? ` • validade ${formatDateBr(item.expiresOn)}` : ' • sem validade informada'}
                  </Text>
                  <Text style={styles.itemMeta}>
                    {item.quantity.toString()} × {formatBRL(item.unitCost)} = {formatBRL(item.total)}
                  </Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Remover ${item.ingredientName}`}
                  onPress={() => removeItem(index)}
                  style={styles.removeButton}
                >
                  <Ionicons name="trash-outline" size={18} color={colors.danger} />
                </Pressable>
              </View>
            ))}
            {items.length > 0 ? (
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Total da nota</Text>
                <Text style={styles.totalValue}>{formatBRL(total)}</Text>
              </View>
            ) : null}

            {itemOpen ? (
              <View style={styles.itemForm}>
                <Text style={styles.label}>Insumo *</Text>
                <View style={styles.chipWrap}>
                  {ingredientsList.map((ingredient) => (
                    <Chip
                      key={ingredient.id}
                      label={ingredient.name}
                      selected={itemDraft.ingredientId === ingredient.id}
                      onPress={() => updateItemDraft('ingredientId', ingredient.id)}
                    />
                  ))}
                </View>
                {ingredients.data && ingredientsList.length === 0 ? (
                  <Text style={styles.hint}>Cadastre insumos antes de registrar um recebimento.</Text>
                ) : null}

                <Field
                  label={`Quantidade recebida (${selectedIngredient?.purchaseUnit ?? 'unidade de compra'}) *`}
                  value={itemDraft.quantity}
                  onChangeText={(value) => updateItemDraft('quantity', value)}
                  keyboardType="decimal-pad"
                />
                <Field
                  label={`Custo unitário (R$ por ${selectedIngredient?.purchaseUnit ?? 'unidade de compra'}) *`}
                  value={itemDraft.unitCost}
                  onChangeText={(value) => updateItemDraft('unitCost', value)}
                  keyboardType="decimal-pad"
                />
                <Field
                  label="Lote do fabricante *"
                  value={itemDraft.lotCode}
                  onChangeText={(value) => updateItemDraft('lotCode', value)}
                  autoCapitalize="characters"
                />
                <Field
                  label="Data de fabricação"
                  value={itemDraft.manufacturedOn}
                  onChangeText={(value) => updateItemDraft('manufacturedOn', value)}
                  placeholder="AAAA-MM-DD (opcional)"
                  autoCapitalize="none"
                />
                <Field
                  label={selectedIngredient && selectedIngredient.shelfLifeDays !== null ? 'Validade *' : 'Validade'}
                  value={itemDraft.expiresOn}
                  onChangeText={(value) => updateItemDraft('expiresOn', value)}
                  placeholder="AAAA-MM-DD"
                  autoCapitalize="none"
                  hint={requiresExpiryHint(selectedIngredient)}
                />

                {itemError ? <Notice tone="error" message={itemError} /> : null}
                <View style={styles.itemActions}>
                  <Button label="Adicionar ao recebimento" icon="add" onPress={addItem} style={styles.flexButton} />
                  <Button
                    label="Cancelar"
                    variant="ghost"
                    onPress={() => {
                      setItemOpen(false);
                      setItemDraft(EMPTY_ITEM);
                      setItemError(null);
                    }}
                  />
                </View>
              </View>
            ) : (
              <Button
                label="Adicionar item"
                variant="secondary"
                icon="add-circle-outline"
                onPress={() => setItemOpen(true)}
              />
            )}
          </Card>

          <Button label="Confirmar recebimento" icon="checkmark" onPress={() => void submit()} loading={submitting} />
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function requiresExpiryHint(ingredient: IngredientListItem | null): string {
  if (!ingredient) return 'Opcional, exceto para insumos que controlam validade.';
  return ingredient.shelfLifeDays !== null
    ? 'Obrigatória: este insumo controla validade. Lotes vencidos não são aceitos.'
    : 'Opcional: este insumo não controla validade.';
}

function SectionTitle({ icon, title }: { icon: ComponentProps<typeof Ionicons>['name']; title: string }) {
  return (
    <View style={styles.sectionTitle}>
      <Ionicons name={icon} size={18} color={colors.primary} />
      <Text style={styles.sectionTitleText}>{title}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: space.lg, gap: space.lg, paddingBottom: space.xl },
  sectionTitle: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  sectionTitleText: { fontSize: 16, fontWeight: '800', color: colors.text },
  label: { fontSize: 13, fontWeight: '600', color: colors.text },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  error: { fontSize: 12, color: colors.danger },
  hint: { fontSize: 12, color: colors.textMuted, lineHeight: 17 },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  itemText: { flex: 1, gap: 2 },
  itemName: { fontSize: 15, fontWeight: '700', color: colors.text },
  itemMeta: { fontSize: 12, color: colors.textMuted },
  removeButton: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.dangerSoft,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: space.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  totalLabel: { fontSize: 14, fontWeight: '700', color: colors.text },
  totalValue: { fontSize: 16, fontWeight: '800', color: colors.text },
  itemForm: { gap: space.md, paddingTop: space.sm },
  itemActions: { gap: space.sm },
  flexButton: { alignSelf: 'stretch' },
});
