import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState, type ComponentProps, type ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';

import { createIngredient, listCategories, listSuppliers } from '../../data/catalog';
import {
  Button,
  Card,
  Chip,
  Field,
  Notice,
  Screen,
  ScreenTitle,
} from '../../components/ui';
import {
  DEFAULT_INGREDIENT_CATEGORIES,
  validateIngredientInput,
  type IngredientField,
  type IngredientFormInput,
} from '../../domain/ingredient';
import {
  UNITS,
  conversionModeFor,
  fixedConversionFactor,
  isUnitCode,
  type UnitCode,
} from '../../domain/units';
import { newRequestId } from '../../lib/ids';
import { useLoader } from '../../hooks/useLoader';
import { colors, space } from '../../theme';

const EMPTY_FORM: IngredientFormInput = {
  name: '',
  sku: '',
  categoryId: '',
  purchaseUnit: '',
  stockUnit: '',
  consumptionUnit: '',
  purchaseToStockFactor: '',
  consumptionToStockFactor: '',
  openingQuantity: '',
  minimumStock: '',
  maximumStock: '',
  purchaseUnitCost: '',
  supplierId: '',
  storageLocation: '',
  shelfLifeDays: '',
};

export default function NovoInsumoScreen() {
  const router = useRouter();
  const categories = useLoader(listCategories);
  const suppliers = useLoader(listSuppliers);
  const { reload: reloadCategories } = categories;
  const { reload: reloadSuppliers } = suppliers;

  useFocusEffect(
    useCallback(() => {
      void reloadCategories();
      void reloadSuppliers();
    }, [reloadCategories, reloadSuppliers]),
  );

  const [form, setForm] = useState<IngredientFormInput>(EMPTY_FORM);
  const [errors, setErrors] = useState<Partial<Record<IngredientField, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Stable across retries of the same content, so a retry after a lost response
  // returns the ingredient already created. Changing any field rotates it.
  const requestId = useRef(newRequestId());

  function update<K extends IngredientField>(field: K, value: IngredientFormInput[K]) {
    requestId.current = newRequestId();
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  }

  function changeUnit(field: 'purchaseUnit' | 'stockUnit' | 'consumptionUnit', value: UnitCode) {
    requestId.current = newRequestId();
    // A factor typed for a previous unit pair no longer applies.
    setForm((current) => ({
      ...current,
      [field]: value,
      purchaseToStockFactor: '',
      consumptionToStockFactor: '',
    }));
    setErrors((current) => ({
      ...current,
      [field]: undefined,
      purchaseToStockFactor: undefined,
      consumptionToStockFactor: undefined,
    }));
  }

  async function submit() {
    if (submitting) return;
    setFormError(null);

    const result = validateIngredientInput(form);
    if (!result.ok) {
      setErrors(result.errors);
      setFormError('Revise os campos destacados antes de cadastrar.');
      return;
    }
    setErrors({});

    setSubmitting(true);
    try {
      await createIngredient(result.value, requestId.current);
      router.back();
    } catch (caught) {
      setFormError(caught instanceof Error ? caught.message : 'Não foi possível cadastrar o insumo.');
    } finally {
      setSubmitting(false);
    }
  }

  const purchaseUnit = isUnitCode(form.purchaseUnit) ? form.purchaseUnit : null;
  const stockUnit = isUnitCode(form.stockUnit) ? form.stockUnit : null;
  const consumptionUnit = isUnitCode(form.consumptionUnit) ? form.consumptionUnit : null;

  const stockLabel = stockUnit ?? 'unidade de estoque';

  return (
    <Screen>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Button
            label="Voltar"
            variant="ghost"
            icon="chevron-back"
            onPress={() => router.back()}
            style={styles.back}
          />
          <ScreenTitle title="Novo insumo" subtitle="Preencha os dados do ingrediente. Campos com * são obrigatórios." />

          {formError ? <Notice tone="error" message={formError} /> : null}

          <Card>
            <SectionTitle icon="pricetag-outline" title="Identificação" />
            <Field label="Nome do ingrediente *" value={form.name} onChangeText={(v) => update('name', v)} error={errors.name} />
            <Field
              label="Código interno (SKU) *"
              value={form.sku}
              onChangeText={(v) => update('sku', v)}
              autoCapitalize="characters"
              autoCorrect={false}
              error={errors.sku}
              hint="Letras, números, ponto, hífen ou sublinhado."
            />

            <Text style={styles.label}>Categoria *</Text>
            <ChipRow>
              {(categories.data ?? []).map((category) => (
                <Chip
                  key={category.id}
                  label={category.name}
                  selected={form.categoryId === category.id}
                  onPress={() => update('categoryId', category.id)}
                />
              ))}
            </ChipRow>
            {categories.error ? <Notice tone="error" message={categories.error} /> : null}
            {errors.categoryId ? <Text style={styles.error}>{errors.categoryId}</Text> : null}
            {categories.data && categories.data.length === 0 ? (
              <Text style={styles.hint}>
                Nenhuma categoria encontrada. Categorias sugeridas: {DEFAULT_INGREDIENT_CATEGORIES.join(', ')}.
              </Text>
            ) : null}

            <Text style={styles.label}>Fornecedor principal</Text>
            <ChipRow>
              <Chip label="Não informar" selected={form.supplierId === ''} onPress={() => update('supplierId', '')} />
              {(suppliers.data ?? []).map((supplier) => (
                <Chip
                  key={supplier.id}
                  label={supplier.name}
                  selected={form.supplierId === supplier.id}
                  onPress={() => update('supplierId', supplier.id)}
                />
              ))}
            </ChipRow>
            {suppliers.data && suppliers.data.length === 0 ? (
              <Text style={styles.hint}>Nenhum fornecedor cadastrado ainda. O cadastro completo de fornecedores chega na Fase 2.</Text>
            ) : null}
          </Card>

          <Card>
            <SectionTitle icon="swap-horizontal-outline" title="Unidades e conversões" />
            <UnitPicker
              label="Unidade de compra *"
              value={purchaseUnit}
              onChange={(unit) => changeUnit('purchaseUnit', unit)}
              error={errors.purchaseUnit}
            />
            <UnitPicker
              label="Unidade de estoque *"
              value={stockUnit}
              onChange={(unit) => changeUnit('stockUnit', unit)}
              error={errors.stockUnit}
              hint="Saldo, estoque mínimo e movimentações ficam nesta unidade."
            />
            <UnitPicker
              label="Unidade usada na receita *"
              value={consumptionUnit}
              onChange={(unit) => changeUnit('consumptionUnit', unit)}
              error={errors.consumptionUnit}
            />

            {purchaseUnit && stockUnit ? (
              <FactorField
                from={purchaseUnit}
                to={stockUnit}
                label={`Quantas ${stockUnit} cabem em 1 ${purchaseUnit}?`}
                value={form.purchaseToStockFactor}
                onChange={(v) => update('purchaseToStockFactor', v)}
                error={errors.purchaseToStockFactor}
                manualHint="Obrigatório para converter a compra no estoque, como densidade ou quantidade por caixa."
              />
            ) : null}

            {consumptionUnit && stockUnit ? (
              <FactorField
                from={consumptionUnit}
                to={stockUnit}
                label={`Quantas ${stockUnit} equivalem a 1 ${consumptionUnit} usado na receita?`}
                value={form.consumptionToStockFactor}
                onChange={(v) => update('consumptionToStockFactor', v)}
                error={errors.consumptionToStockFactor}
                manualHint="Obrigatório quando a receita usa outra grandeza do que o estoque."
              />
            ) : null}
          </Card>

          <Card>
            <SectionTitle icon="cube-outline" title="Estoque" />
            <Field
              label={`Quantidade atual em estoque (${stockLabel})`}
              value={form.openingQuantity}
              onChangeText={(v) => update('openingQuantity', v)}
              keyboardType="decimal-pad"
              error={errors.openingQuantity}
              hint="Saldo inicial. Fica registrado como primeiro movimento do insumo. Em branco = zero."
            />
            <Field
              label={`Estoque mínimo (${stockLabel})`}
              value={form.minimumStock}
              onChangeText={(v) => update('minimumStock', v)}
              keyboardType="decimal-pad"
              error={errors.minimumStock}
            />
            <Field
              label={`Estoque máximo (${stockLabel}) — opcional`}
              value={form.maximumStock}
              onChangeText={(v) => update('maximumStock', v)}
              keyboardType="decimal-pad"
              error={errors.maximumStock}
            />
            <Field
              label="Local de armazenamento"
              value={form.storageLocation}
              onChangeText={(v) => update('storageLocation', v)}
              placeholder="Ex.: Câmara fria, Depósito"
              error={errors.storageLocation}
            />
            <Field
              label="Prazo de validade (dias) — opcional"
              value={form.shelfLifeDays}
              onChangeText={(v) => update('shelfLifeDays', v)}
              keyboardType="number-pad"
              error={errors.shelfLifeDays}
              hint="Em branco = este insumo não controla validade."
            />
          </Card>

          <Card>
            <SectionTitle icon="cash-outline" title="Custo" />
            <Field
              label={`Custo de aquisição (R$ por ${purchaseUnit ?? 'unidade de compra'})`}
              value={form.purchaseUnitCost}
              onChangeText={(v) => update('purchaseUnitCost', v)}
              keyboardType="decimal-pad"
              error={errors.purchaseUnitCost}
              hint="Usado para estimar o valor do estoque e o custo das pizzas."
            />
          </Card>

          <Button label="Cadastrar insumo" icon="checkmark" onPress={() => void submit()} loading={submitting} />
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function SectionTitle({ icon, title }: { icon: ComponentProps<typeof Ionicons>['name']; title: string }) {
  return (
    <View style={styles.sectionTitle}>
      <Ionicons name={icon} size={18} color={colors.primary} />
      <Text style={styles.sectionTitleText}>{title}</Text>
    </View>
  );
}

function ChipRow({ children }: { children: ReactNode }) {
  return <View style={styles.chipWrap}>{children}</View>;
}

function UnitPicker({
  label,
  value,
  onChange,
  error,
  hint,
}: {
  label: string;
  value: UnitCode | null;
  onChange: (unit: UnitCode) => void;
  error?: string;
  hint?: string;
}) {
  return (
    <View style={styles.unitBlock}>
      <Text style={styles.label}>{label}</Text>
      <ChipRow>
        {UNITS.map((unit) => (
          <Chip key={unit.code} label={unit.code} selected={value === unit.code} onPress={() => onChange(unit.code)} />
        ))}
      </ChipRow>
      {error ? <Text style={styles.error}>{error}</Text> : hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

/**
 * Shows the universal factor when one exists, asks for the factor when it must
 * come from the user, and says nothing when the units are the same.
 */
function FactorField({
  from,
  to,
  label,
  value,
  onChange,
  error,
  manualHint,
}: {
  from: UnitCode;
  to: UnitCode;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  manualHint: string;
}) {
  const mode = conversionModeFor(from, to);

  if (mode === 'identidade') {
    return <Text style={styles.hint}>{`${from} e ${to} são a mesma unidade: fator 1.`}</Text>;
  }

  if (mode === 'tabela') {
    const factor = fixedConversionFactor(from, to)?.toString() ?? '';
    return (
      <View style={styles.autoFactor}>
        <Ionicons name="checkmark-circle-outline" size={18} color={colors.success} />
        <Text style={styles.autoFactorText}>
          Fator automático pela tabela: 1 {from} = {factor} {to}
        </Text>
      </View>
    );
  }

  return (
    <Field
      label={label}
      value={value}
      onChangeText={onChange}
      keyboardType="decimal-pad"
      error={error}
      hint={manualHint}
    />
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: space.lg, gap: space.lg, paddingBottom: space.xl },
  back: { alignSelf: 'flex-start', paddingHorizontal: 0, minHeight: 36 },
  sectionTitle: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: space.xs },
  sectionTitleText: { fontSize: 16, fontWeight: '800', color: colors.text },
  label: { fontSize: 13, fontWeight: '600', color: colors.text, marginTop: space.xs },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  unitBlock: { gap: space.sm },
  error: { fontSize: 12, color: colors.danger },
  hint: { fontSize: 12, color: colors.textMuted, lineHeight: 17 },
  autoFactor: { flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: colors.successSoft, padding: space.md, borderRadius: 12 },
  autoFactorText: { flex: 1, fontSize: 13, color: colors.text, fontWeight: '600' },
});
