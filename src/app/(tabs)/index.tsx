import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { listIngredients } from '../../data/catalog';
import { listLots } from '../../data/stock';
import { dashboardSummary } from '../../data/gestao';
import { BrandHeader, Button, Card, Notice, Pill, Screen, ScreenTitle } from '../../components/ui';
import { formatBRL, formatDateBr } from '../../domain/format';
import { stockStatus } from '../../domain/ingredient';
import { lotExpiryStatus, todayIso } from '../../domain/stock';
import { useAuth } from '../../features/auth/AuthProvider';
import { useLoader } from '../../hooks/useLoader';
import { colors, space } from '../../theme';

const UPCOMING = [
  { icon: 'stats-chart-outline', title: 'Custos, inventário, perdas e relatórios', phase: 'Fase 5' },
] as const;

const loadIngredients = () => listIngredients();
const loadSummary = () => dashboardSummary();

export default function InicioScreen() {
  const router = useRouter();
  const { state, refreshProfile } = useAuth();
  const organizationName = state.status === 'ready' ? state.profile.organizationName : '';
  const fullName = state.status === 'ready' ? state.profile.fullName : '';

  const ingredients = useLoader(loadIngredients);
  const lots = useLoader(listLots);
  const summary = useLoader(loadSummary);
  const { reload: reloadIngredients } = ingredients;
  const { reload: reloadLots } = lots;
  const { reload: reloadSummary } = summary;

  useFocusEffect(
    useCallback(() => {
      void reloadIngredients();
      void reloadLots();
      void reloadSummary();
    }, [reloadIngredients, reloadLots, reloadSummary]),
  );

  const items = useMemo(() => ingredients.data ?? [], [ingredients.data]);
  const belowMinimum = items.filter((item) => stockStatus(item.balance, item.minimumStock) === 'abaixo_minimo');

  const today = todayIso();
  const attentionLots = useMemo(
    () =>
      (lots.data ?? [])
        .map((lot) => ({ lot, status: lotExpiryStatus(lot.expiresOn, today) }))
        .filter(({ status }) => status === 'vencido' || status === 'vence_em_breve')
        .sort((a, b) => (a.lot.expiresOn ?? '').localeCompare(b.lot.expiresOn ?? '')),
    [lots.data, today],
  );
  const expiredCount = attentionLots.filter(({ status }) => status === 'vencido').length;
  const soonCount = attentionLots.length - expiredCount;
  const loadError = ingredients.error ?? lots.error;

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={ingredients.loading || lots.loading}
            onRefresh={() => {
              void refreshProfile();
              void reloadIngredients();
              void reloadLots();
            }}
            tintColor={colors.primary}
          />
        }
      >
        <BrandHeader subtitle={`${organizationName} • Início`} />
        <ScreenTitle title={`Olá, ${firstName(fullName)}`} subtitle="Resumo do estoque da pizzaria." />

        {loadError ? <Notice tone="error" message={loadError} /> : null}

        {summary.data ? (
          <Card style={styles.summaryCard}>
            <Text style={styles.cardTitle}>Hoje</Text>
            <View style={styles.summaryRow}>
              <Text style={styles.metricLabel}>Pizzas vendidas</Text>
              <Text style={styles.summaryValue}>{summary.data.pizzasSoldToday}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.metricLabel}>Faturamento</Text>
              <Text style={styles.summaryValue}>{formatBRL(summary.data.revenueToday)}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.metricLabel}>Estoque estimado</Text>
              <Text style={styles.summaryValue}>{formatBRL(summary.data.stockValue)}</Text>
            </View>
          </Card>
        ) : null}

        <View style={styles.metrics}>
          <Metric label="Insumos ativos" value={ingredients.data ? items.length : null} />
          <Metric label="Abaixo do mínimo" value={ingredients.data ? belowMinimum.length : null} danger={belowMinimum.length > 0} />
          <Metric label="Lotes vencidos" value={lots.data ? expiredCount : null} danger={expiredCount > 0} />
          <Metric label="Vencem em 7 dias" value={lots.data ? soonCount : null} warn={soonCount > 0} />
        </View>

        {attentionLots.length > 0 ? (
          <Card style={styles.alertCard}>
            <View style={styles.cardHeader}>
              <Ionicons name="time-outline" size={18} color={colors.danger} />
              <Text style={styles.cardTitle}>Lotes que pedem atenção</Text>
            </View>
            {attentionLots.slice(0, 6).map(({ lot, status }) => (
              <View key={lot.lotId} style={styles.lotRow}>
                <View style={styles.lotText}>
                  <Text style={styles.lotName}>{lot.ingredientName}</Text>
                  <Text style={styles.lotMeta}>
                    Lote {lot.lotCode} • vence {formatDateBr(lot.expiresOn ?? '')}
                  </Text>
                </View>
                <Pill label={status === 'vencido' ? 'Vencido' : 'Vence em breve'} tone={status === 'vencido' ? 'danger' : 'warning'} />
              </View>
            ))}
          </Card>
        ) : null}

        {belowMinimum.length > 0 ? (
          <Card style={styles.alertCard}>
            <View style={styles.cardHeader}>
              <Ionicons name="warning-outline" size={18} color={colors.danger} />
              <Text style={styles.cardTitle}>Abaixo do estoque mínimo</Text>
            </View>
            {belowMinimum.slice(0, 6).map((item) => (
              <Text key={item.id} style={styles.lotName}>
                • {item.name}
              </Text>
            ))}
          </Card>
        ) : null}

        <View style={styles.actions}>
          <Button label="Recebimento" icon="download-outline" onPress={() => router.push('/recebimento/novo')} style={styles.actionButton} />
          <Button label="Novo insumo" variant="secondary" icon="add" onPress={() => router.push('/insumo/novo')} style={styles.actionButton} />
        </View>
        <View style={styles.actions}>
          <Button label="Produzir" variant="secondary" icon="restaurant-outline" onPress={() => router.push('/producao/pizza')} style={styles.actionButton} />
          <Button label="Vendas" variant="secondary" icon="receipt-outline" onPress={() => router.push('/vendas')} style={styles.actionButton} />
        </View>

        <Card>
          <View style={styles.cardHeader}>
            <Ionicons name="time-outline" size={18} color={colors.primary} />
            <Text style={styles.cardTitle}>Próximas etapas</Text>
          </View>
          {UPCOMING.map((step) => (
            <View key={step.title} style={styles.upcomingRow}>
              <Ionicons name={step.icon} size={18} color={colors.textMuted} />
              <Text style={styles.upcomingText}>{step.title}</Text>
              <Pill label={step.phase} tone="neutral" />
            </View>
          ))}
        </Card>
      </ScrollView>
    </Screen>
  );
}

function Metric({ label, value, danger, warn }: { label: string; value: number | null; danger?: boolean; warn?: boolean }) {
  return (
    <Card style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={[styles.metricValue, danger && styles.metricDanger, warn && styles.metricWarn]}>
        {value === null ? '—' : value}
      </Text>
    </Card>
  );
}

function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] || 'equipe';
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.lg, paddingBottom: space.xl, paddingTop: space.sm },
  summaryCard: { gap: space.sm },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  summaryValue: { fontSize: 15, fontWeight: '800', color: colors.text },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  metric: { flexBasis: '47%', flexGrow: 1, gap: space.xs },
  metricLabel: { fontSize: 12, color: colors.textMuted, fontWeight: '600' },
  metricValue: { fontSize: 26, fontWeight: '800', color: colors.text },
  metricDanger: { color: colors.danger },
  metricWarn: { color: colors.warning },
  alertCard: { borderColor: colors.dangerSoft, gap: space.md },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  cardTitle: { flex: 1, fontSize: 15, fontWeight: '800', color: colors.text },
  lotRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md },
  lotText: { flex: 1, gap: 2 },
  lotName: { fontSize: 14, fontWeight: '700', color: colors.text },
  lotMeta: { fontSize: 12, color: colors.textMuted },
  actions: { flexDirection: 'row', gap: space.md },
  actionButton: { flex: 1 },
  upcomingRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.xs },
  upcomingText: { flex: 1, fontSize: 14, color: colors.text },
});
