import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';

import { listIngredients } from '../../data/catalog';
import { listLots } from '../../data/stock';
import { listWaste, registerWaste } from '../../data/gestao';
import { BackLink, Button, Card, Chip, Field, Notice, Screen, ScreenTitle } from '../../components/ui';
import { formatBRL, formatDateBr, formatQuantity } from '../../domain/format';
import { WASTE_REASONS, validateWaste } from '../../domain/gestao';
import { useLoader } from '../../hooks/useLoader';
import { useRequestId } from '../../hooks/useRequestId';
import { colors, space } from '../../theme';
import { errorMessage } from '../../lib/errors';

const loadIngredients = () => listIngredients();
const loadLots = () => listLots();
const loadWaste = () => listWaste();

export default function PerdasScreen() {
  const router = useRouter();
  const ingredients = useLoader(loadIngredients);
  const lots = useLoader(loadLots);
  const waste = useLoader(loadWaste);
  const { reload: reloadIngredients } = ingredients;
  const { reload: reloadWaste } = waste;
  const { reload: reloadLots } = lots;
  useFocusEffect(
    useCallback(() => {
      void reloadIngredients();
      void reloadWaste();
      void reloadLots();
    }, [reloadIngredients, reloadWaste, reloadLots]),
  );

  const [ingredientId, setIngredientId] = useState<string | null>(null);
  const [lotId, setLotId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const requestId = useRequestId(JSON.stringify({ ingredientId, lotId, quantity, reason, notes }));

  const selected = (ingredients.data ?? []).find((item) => item.id === ingredientId) ?? null;
  const ingredientLots = useMemo(
    () => (lots.data ?? []).filter((lot) => lot.ingredientId === ingredientId),
    [lots.data, ingredientId],
  );

  async function submit() {
    if (submitting) return;
    setError(null);
    if (!selected) {
      setError('Escolha o insumo perdido.');
      return;
    }
    const check = validateWaste({ quantity, reason: reason ?? '', notes });
    if (!check.ok) {
      setError(check.message);
      return;
    }
    setSubmitting(true);
    try {
      await registerWaste(requestId, selected.id, lotId, check.value.quantity, check.value.reason, check.value.notes, null);
      setQuantity('');
      setReason(null);
      setNotes('');
      setLotId(null);
      await reloadWaste();
      await reloadLots();
    } catch (caught) {
      setError(errorMessage(caught, 'Não foi possível registrar a perda.'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Screen>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <BackLink onPress={() => router.back()} />
          <ScreenTitle title="Perdas e desperdícios" subtitle="A baixa sai do lote que vence primeiro, a menos que você escolha um lote." />
          {error ? <Notice tone="error" message={error} /> : null}

          <Card>
            <Text style={styles.label}>Insumo *</Text>
            <View style={styles.chipRow}>
              {(ingredients.data ?? []).map((item) => (
                <Chip
                  key={item.id}
                  label={item.name}
                  selected={ingredientId === item.id}
                  onPress={() => {
                    setIngredientId(item.id);
                    setLotId(null);
                  }}
                />
              ))}
            </View>

            {selected ? (
              <>
                <Text style={styles.label}>Lote</Text>
                <View style={styles.chipRow}>
                  <Chip label="Automático (FEFO)" selected={lotId === null} onPress={() => setLotId(null)} />
                  {ingredientLots.map((lot) => (
                    <Chip
                      key={lot.lotId}
                      label={`${lot.lotCode} • ${formatQuantity(lot.balance, lot.unit)}`}
                      selected={lotId === lot.lotId}
                      onPress={() => setLotId(lot.lotId)}
                    />
                  ))}
                </View>
              </>
            ) : null}

            <Field label={`Quantidade perdida (${selected?.stockUnit ?? 'unidade de estoque'}) *`} value={quantity} onChangeText={setQuantity} keyboardType="decimal-pad" />

            <Text style={styles.label}>Motivo *</Text>
            <View style={styles.chipRow}>
              {WASTE_REASONS.map((option) => (
                <Chip key={option.code} label={option.label} selected={reason === option.code} onPress={() => setReason(option.code)} />
              ))}
            </View>
            <Field label="Observações" value={notes} onChangeText={setNotes} multiline />
            <Button label="Registrar perda" icon="checkmark" onPress={() => void submit()} loading={submitting} />
          </Card>

          <Text style={styles.section}>Últimas perdas</Text>
          {(waste.data ?? []).map((row) => (
            <View key={row.id} style={styles.row}>
              <Ionicons name="trash-outline" size={18} color={colors.danger} />
              <View style={styles.rowText}>
                <Text style={styles.name}>{row.ingredientName}</Text>
                <Text style={styles.meta}>
                  {formatQuantity(row.quantity, row.unit)} • {WASTE_REASONS.find((option) => option.code === row.reason)?.label ?? row.reason} • {formatDateBr(row.occurredOn)}
                </Text>
              </View>
              <Text style={styles.cost}>{formatBRL(row.costEstimate)}</Text>
            </View>
          ))}
          {waste.data && waste.data.length === 0 ? <Text style={styles.meta}>Nenhuma perda registrada.</Text> : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: space.lg, gap: space.md, paddingBottom: space.xl },
  label: { fontSize: 13, fontWeight: '600', color: colors.text },
  section: { fontSize: 15, fontWeight: '800', color: colors.text, marginTop: space.sm },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.xs },
  rowText: { flex: 1, gap: 2 },
  name: { fontSize: 14, fontWeight: '700', color: colors.text },
  meta: { fontSize: 12, color: colors.textMuted },
  cost: { fontSize: 14, fontWeight: '800', color: colors.text },
});
