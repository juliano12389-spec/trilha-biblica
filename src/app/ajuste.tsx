import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';

import { listLots, registerAdjustment } from '../data/stock';
import { BackLink, Button, Card, Field, Notice, Pill, Screen, ScreenTitle } from '../components/ui';
import { formatDateBr, formatQuantity } from '../domain/format';
import { ADJUSTMENT_REASON, lotExpiryStatus, parseSignedQuantity, todayIso } from '../domain/stock';
import { useLoader } from '../hooks/useLoader';
import { useRequestId } from '../hooks/useRequestId';
import { colors, space } from '../theme';

export default function AjusteScreen() {
  const router = useRouter();
  const { lotId } = useLocalSearchParams<{ lotId: string }>();
  const lots = useLoader(listLots);
  const { reload } = lots;

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  const lot = useMemo(() => (lots.data ?? []).find((item) => item.lotId === lotId) ?? null, [lots.data, lotId]);
  const status = lot ? lotExpiryStatus(lot.expiresOn, todayIso()) : null;

  const [quantityText, setQuantityText] = useState('');
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<{ quantity?: string; reason?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // A retry of unchanged content reuses the id, so it cannot post twice.
  const requestId = useRequestId(`${lotId}|${quantityText}|${reason}`);

  async function submit() {
    if (submitting || !lot) return;
    setFormError(null);
    const nextErrors: typeof errors = {};

    const quantity = parseSignedQuantity(quantityText);
    if (quantity === null) {
      nextErrors.quantity = 'Use sinal: -2 para saída, +2 para entrada (até 4 casas).';
    } else if (quantity.isPositive() && status === 'vencido') {
      nextErrors.quantity = 'Lote vencido: só são permitidas saídas (descarte).';
    }

    const trimmedReason = reason.trim();
    if (trimmedReason.length < ADJUSTMENT_REASON.min || trimmedReason.length > ADJUSTMENT_REASON.max) {
      nextErrors.reason = `Informe o motivo (de ${ADJUSTMENT_REASON.min} a ${ADJUSTMENT_REASON.max} caracteres).`;
    }

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0 || quantity === null) {
      return;
    }

    setSubmitting(true);
    try {
      await registerAdjustment(lot.lotId, quantity, trimmedReason, requestId);
      router.back();
    } catch (caught) {
      setFormError(caught instanceof Error ? caught.message : 'Não foi possível registrar o ajuste.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Screen>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <BackLink onPress={() => router.back()} />
          <ScreenTitle title="Ajustar lote" subtitle="Entradas e saídas ficam registradas com motivo." />

          {lots.error ? <Notice tone="error" message={lots.error} /> : null}
          {!lot && lots.data ? <Notice tone="error" message="Lote não encontrado ou sem saldo." /> : null}

          {lot ? (
            <Card style={styles.summary}>
              <View style={styles.summaryTop}>
                <Text style={styles.ingredient}>{lot.ingredientName}</Text>
                {status ? <Pill label={statusLabel(status)} tone={statusTone(status)} /> : null}
              </View>
              <Text style={styles.meta}>
                Lote {lot.lotCode} • saldo {formatQuantity(lot.balance, lot.unit)}
              </Text>
              <Text style={styles.meta}>
                {lot.expiresOn ? `Validade ${formatDateBr(lot.expiresOn)}` : 'Validade não informada'}
              </Text>
            </Card>
          ) : null}

          {formError ? <Notice tone="error" message={formError} /> : null}

          {lot ? (
            <Card>
              <Field
                label={`Quantidade em ${lot.unit} (use + ou -) *`}
                value={quantityText}
                onChangeText={(value) => {
                  setQuantityText(value);
                  setErrors((current) => ({ ...current, quantity: undefined }));
                }}
                placeholder="-2"
                keyboardType="numbers-and-punctuation"
                error={errors.quantity}
              />
              <Field
                label="Motivo *"
                value={reason}
                onChangeText={(value) => {
                  setReason(value);
                  setErrors((current) => ({ ...current, reason: undefined }));
                }}
                placeholder="Ex.: queda na câmara, contagem a maior"
                multiline
                error={errors.reason}
              />
            </Card>
          ) : null}

          {lot ? <Button label="Registrar ajuste" icon="checkmark" onPress={() => void submit()} loading={submitting} /> : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function statusLabel(status: ReturnType<typeof lotExpiryStatus>): string {
  return { vencido: 'Vencido', vence_em_breve: 'Vence em breve', ok: 'No prazo', sem_validade: 'Sem validade' }[status];
}

function statusTone(status: ReturnType<typeof lotExpiryStatus>): 'danger' | 'warning' | 'success' | 'neutral' {
  return { vencido: 'danger', vence_em_breve: 'warning', ok: 'success', sem_validade: 'neutral' }[status] as
    | 'danger'
    | 'warning'
    | 'success'
    | 'neutral';
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: space.lg, gap: space.lg, paddingBottom: space.xl },
  summary: { gap: space.xs },
  summaryTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  ingredient: { flex: 1, fontSize: 17, fontWeight: '800', color: colors.text },
  meta: { fontSize: 13, color: colors.textMuted },
});
