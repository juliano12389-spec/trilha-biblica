import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { listLots, type LotItem } from '../data/stock';
import { BackLink, Button, Card, EmptyState, Notice, Pill, Screen, ScreenTitle } from '../components/ui';
import { formatDateBr, formatQuantity } from '../domain/format';
import { lotExpiryStatus, todayIso, type LotStatus } from '../domain/stock';
import { useLoader } from '../hooks/useLoader';
import { colors, space } from '../theme';

const STATUS_PILL: Record<LotStatus, { label: string; tone: 'danger' | 'warning' | 'success' | 'neutral' }> = {
  vencido: { label: 'Vencido', tone: 'danger' },
  vence_em_breve: { label: 'Vence em breve', tone: 'warning' },
  ok: { label: 'No prazo', tone: 'success' },
  sem_validade: { label: 'Sem validade', tone: 'neutral' },
};

export default function LotesScreen() {
  const router = useRouter();
  const lots = useLoader(listLots);
  const { reload } = lots;

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  const today = todayIso();
  const counts = useMemo(() => {
    const items = lots.data ?? [];
    return {
      expired: items.filter((lot) => lotExpiryStatus(lot.expiresOn, today) === 'vencido').length,
      soon: items.filter((lot) => lotExpiryStatus(lot.expiresOn, today) === 'vence_em_breve').length,
    };
  }, [lots.data, today]);

  return (
    <Screen>
      <FlatList
        data={lots.data ?? []}
        keyExtractor={(item) => item.lotId}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListHeaderComponent={
          <View style={styles.header}>
            <BackLink onPress={() => router.back()} />
            <ScreenTitle title="Lotes e validade" subtitle="Ordem FEFO: o que vence primeiro aparece no topo." />
            {counts.expired > 0 ? (
              <Notice tone="error" message={`${counts.expired} ${counts.expired === 1 ? 'lote está vencido' : 'lotes estão vencidos'} e bloqueado${counts.expired === 1 ? '' : 's'} para entrada.`} />
            ) : null}
            {counts.soon > 0 ? (
              <Notice tone="info" message={`${counts.soon} ${counts.soon === 1 ? 'lote vence' : 'lotes vencem'} nos próximos 7 dias.`} />
            ) : null}
            {lots.error ? <Notice tone="error" message={lots.error} /> : null}
          </View>
        }
        renderItem={({ item }) => <LotCard lot={item} today={today} onAdjust={() => router.push({ pathname: '/ajuste', params: { lotId: item.lotId } })} />}
        ListEmptyComponent={
          lots.loading ? undefined : (
            <EmptyState
              icon="layers-outline"
              title="Nenhum lote com saldo"
              description="Os lotes aparecem aqui depois do primeiro recebimento ou do saldo inicial de um insumo."
            />
          )
        }
        refreshControl={<RefreshControl refreshing={lots.loading} onRefresh={() => void reload()} tintColor={colors.primary} />}
      />
    </Screen>
  );
}

function LotCard({ lot, today, onAdjust }: { lot: LotItem; today: string; onAdjust: () => void }) {
  const status = lotExpiryStatus(lot.expiresOn, today);
  const pill = STATUS_PILL[status];
  return (
    <Card style={styles.card}>
      <View style={styles.cardTop}>
        <View style={styles.cardText}>
          <Text style={styles.ingredient}>{lot.ingredientName}</Text>
          <Text style={styles.meta}>
            {lot.ingredientSku} • Lote {lot.lotCode}
          </Text>
        </View>
        <Pill label={pill.label} tone={pill.tone} />
      </View>
      <View style={styles.balanceRow}>
        <Ionicons name="layers-outline" size={18} color={colors.textMuted} />
        <Text style={styles.balance}>{formatQuantity(lot.balance, lot.unit)}</Text>
        <Text style={styles.expiry}>
          {lot.expiresOn ? `Vence em ${formatDateBr(lot.expiresOn)}` : 'Validade não informada'}
        </Text>
      </View>
      <Button label="Ajustar lote" variant="secondary" icon="create-outline" onPress={onAdjust} />
    </Card>
  );
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: space.lg, paddingBottom: space.xl },
  header: { gap: space.md, paddingTop: space.sm, paddingBottom: space.md },
  separator: { height: space.md },
  card: { gap: space.md },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: space.md },
  cardText: { flex: 1, gap: 2 },
  ingredient: { fontSize: 16, fontWeight: '800', color: colors.text },
  meta: { fontSize: 12, color: colors.textMuted },
  balanceRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' },
  balance: { fontSize: 18, fontWeight: '800', color: colors.text },
  expiry: { fontSize: 13, color: colors.textMuted, flexBasis: '100%' },
});
