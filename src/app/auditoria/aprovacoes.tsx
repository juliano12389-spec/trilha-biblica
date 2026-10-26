import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  approveStocktake,
  listStocktakeItems,
  listStocktakes,
  rejectStocktake,
  type StocktakeItemRow,
  type StocktakeRow,
} from '../../data/gestao';
import { BackLink, Button, Card, EmptyState, Field, Notice, Pill, Screen, ScreenTitle } from '../../components/ui';
import { formatBRL, formatDateTimeBr, formatQuantity } from '../../domain/format';
import { useAuth } from '../../features/auth/AuthProvider';
import { useLoader } from '../../hooks/useLoader';
import { colors, space } from '../../theme';
import { errorMessage } from '../../lib/errors';

const loadStocktakes = () => listStocktakes();

const STATUS_PILL = {
  aguardando_aprovacao: { label: 'Aguardando decisão', tone: 'warning' },
  aprovado: { label: 'Aprovado', tone: 'success' },
  recusado: { label: 'Recusado', tone: 'danger' },
} as const;

const REJECTION_MIN = 3;
const REJECTION_MAX = 300;

export default function AprovacoesScreen() {
  const router = useRouter();
  const { state } = useAuth();
  const isAdmin = state.status === 'ready' && state.profile.roleCode === 'administrador';
  const stocktakes = useLoader(loadStocktakes);
  const { reload } = stocktakes;
  useFocusEffect(useCallback(() => void reload(), [reload]));

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [items, setItems] = useState<StocktakeItemRow[]>([]);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const selected = (stocktakes.data ?? []).find((row) => row.id === selectedId) ?? null;

  useEffect(() => {
    if (!selectedId) return;
    let active = true;
    listStocktakeItems(selectedId)
      .then((rows) => {
        if (active) setItems(rows);
      })
      .catch((caught: unknown) => {
        if (active) setError(errorMessage(caught, 'Não foi possível carregar os itens da contagem.'));
      });
    return () => {
      active = false;
    };
  }, [selectedId]);

  function open(row: StocktakeRow) {
    setItems([]);
    setSelectedId(row.id);
    setNote('');
    setError(null);
    setMessage(null);
  }

  async function decide(kind: 'approve' | 'reject') {
    if (!selected || submitting) return;
    setError(null);
    const trimmed = note.trim();
    if (kind === 'reject' && (trimmed.length < REJECTION_MIN || trimmed.length > REJECTION_MAX)) {
      setError(`Informe o motivo da recusa (de ${REJECTION_MIN} a ${REJECTION_MAX} caracteres).`);
      return;
    }
    setSubmitting(true);
    try {
      if (kind === 'approve') {
        const adjusted = await approveStocktake(selected.id, trimmed);
        setMessage(adjusted === 0 ? 'Contagem aprovada. Nenhum saldo precisou de ajuste.' : `Contagem aprovada. ${adjusted} ajuste(s) aplicado(s) ao saldo.`);
      } else {
        await rejectStocktake(selected.id, trimmed);
        setMessage('Contagem recusada. O saldo não foi alterado.');
      }
      setSelectedId(null);
      await reload();
    } catch (caught) {
      setError(errorMessage(caught, 'Não foi possível registrar a decisão.'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Screen>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <BackLink onPress={() => router.back()} />
          <ScreenTitle
            title="Aprovações de inventário"
            subtitle={isAdmin ? 'Confira a diferença antes de decidir. Aprovar ajusta o saldo.' : 'Somente o administrador aprova ajustes.'}
          />
          {message ? <Notice tone="info" message={message} /> : null}
          {error ? <Notice tone="error" message={error} /> : null}
          {stocktakes.error ? <Notice tone="error" message={stocktakes.error} /> : null}

          {(stocktakes.data ?? []).length === 0 && !stocktakes.loading ? (
            <EmptyState icon="checkmark-done-outline" title="Nenhuma contagem" description="Quando um inventário for enviado, ele aparece aqui." />
          ) : null}

          {(stocktakes.data ?? []).map((row) => (
            <Card key={row.id} style={styles.row}>
              <View style={styles.rowTop}>
                <View style={styles.rowText}>
                  <Text style={styles.name}>Contagem de {formatDateTimeBr(row.countedAt)}</Text>
                  {row.notes ? <Text style={styles.meta}>{row.notes}</Text> : null}
                  <Text style={styles.meta}>Impacto líquido: {formatBRL(row.netValue)}</Text>
                </View>
                <Pill label={STATUS_PILL[row.status].label} tone={STATUS_PILL[row.status].tone} />
              </View>
              {row.decisionNote ? <Text style={styles.meta}>Decisão: {row.decisionNote}</Text> : null}
              {row.status === 'aguardando_aprovacao' && isAdmin ? (
                <Button
                  label={selectedId === row.id ? 'Fechar' : 'Decidir'}
                  variant="secondary"
                  icon={selectedId === row.id ? 'close' : 'document-text-outline'}
                  onPress={() => (selectedId === row.id ? setSelectedId(null) : open(row))}
                />
              ) : null}

              {selectedId === row.id ? (
                <View style={styles.decision}>
                  {items.map((item, index) => (
                    <View key={`${item.ingredientName}-${index}`} style={styles.itemRow}>
                      <Text style={styles.name}>{item.ingredientName}</Text>
                      <Text style={styles.meta}>
                        Sistema {formatQuantity(item.systemQuantity, item.unit)} • Contado {formatQuantity(item.countedQuantity, item.unit)}
                      </Text>
                      <Text style={[styles.meta, { color: item.difference.isNegative() ? colors.danger : colors.success }]}>
                        Diferença {formatQuantity(item.difference, item.unit)} ({formatBRL(item.financialImpact)})
                      </Text>
                      {item.reason ? <Text style={styles.meta}>Motivo: {item.reason}</Text> : null}
                    </View>
                  ))}
                  <Field
                    label="Observação (obrigatória para recusar)"
                    value={note}
                    onChangeText={setNote}
                    multiline
                    maxLength={REJECTION_MAX}
                  />
                  <Button label="Aprovar ajuste" icon="checkmark" onPress={() => void decide('approve')} loading={submitting} />
                  <Button label="Recusar contagem" variant="ghost" icon="close-circle-outline" onPress={() => void decide('reject')} disabled={submitting} />
                </View>
              ) : null}
            </Card>
          ))}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: space.lg, gap: space.md, paddingBottom: space.xl },
  row: { gap: space.sm },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  rowText: { flex: 1, gap: 2 },
  name: { fontSize: 15, fontWeight: '800', color: colors.text },
  meta: { fontSize: 12, color: colors.textMuted },
  decision: { gap: space.sm, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: space.sm },
  itemRow: { gap: 2, paddingVertical: space.xs },
});
