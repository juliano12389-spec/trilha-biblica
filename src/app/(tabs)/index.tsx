import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { listIngredients } from '../../data/catalog';
import { BrandHeader, Button, Card, Notice, Pill, Screen, ScreenTitle } from '../../components/ui';
import { useAuth } from '../../features/auth/AuthProvider';
import { stockStatus } from '../../domain/ingredient';
import { useLoader } from '../../hooks/useLoader';
import { colors, space } from '../../theme';

const UPCOMING = [
  { icon: 'download-outline', title: 'Recebimentos, lotes e validade', phase: 'Fase 2' },
  { icon: 'restaurant-outline', title: 'Fichas técnicas e produção', phase: 'Fase 3' },
  { icon: 'receipt-outline', title: 'Vendas, cancelamentos e estornos', phase: 'Fase 4' },
  { icon: 'stats-chart-outline', title: 'Custos, inventário, perdas e relatórios', phase: 'Fase 5' },
] as const;

export default function InicioScreen() {
  const router = useRouter();
  const { state, refreshProfile } = useAuth();
  const organizationName = state.status === 'ready' ? state.profile.organizationName : '';
  const fullName = state.status === 'ready' ? state.profile.fullName : '';

  const ingredients = useLoader(listIngredients);
  const { reload: reloadIngredients } = ingredients;

  useFocusEffect(
    useCallback(() => {
      void reloadIngredients();
    }, [reloadIngredients]),
  );

  const items = ingredients.data ?? [];
  const belowMinimum = items.filter((item) => stockStatus(item.balance, item.minimumStock) === 'abaixo_minimo');

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={ingredients.loading}
            onRefresh={() => {
              void refreshProfile();
              void reloadIngredients();
            }}
            tintColor={colors.primary}
          />
        }
      >
        <BrandHeader subtitle={`${organizationName} • Início`} />
        <ScreenTitle title={`Olá, ${firstName(fullName)}`} subtitle="Resumo do estoque da pizzaria." />

        {ingredients.error ? <Notice tone="error" message={ingredients.error} /> : null}

        <View style={styles.metrics}>
          <Card style={styles.metric}>
            <Text style={styles.metricLabel}>Insumos ativos</Text>
            <Text style={styles.metricValue}>{ingredients.data ? items.length : '—'}</Text>
          </Card>
          <Card style={styles.metric}>
            <Text style={styles.metricLabel}>Abaixo do mínimo</Text>
            <Text style={[styles.metricValue, belowMinimum.length > 0 && styles.metricDanger]}>
              {ingredients.data ? belowMinimum.length : '—'}
            </Text>
          </Card>
        </View>

        {belowMinimum.length > 0 ? (
          <Card style={styles.alertCard}>
            <View style={styles.cardHeader}>
              <Ionicons name="warning-outline" size={18} color={colors.danger} />
              <Text style={styles.cardTitle}>Alertas de estoque</Text>
              <Pill label={`${belowMinimum.length}`} tone="danger" />
            </View>
            {belowMinimum.slice(0, 5).map((item) => (
              <Text key={item.id} style={styles.alertItem}>
                • {item.name}
              </Text>
            ))}
          </Card>
        ) : null}

        <View style={styles.actions}>
          <Button label="Novo insumo" icon="add" onPress={() => router.push('/insumo/novo')} style={styles.actionButton} />
          <Button label="Ver estoque" variant="secondary" icon="file-tray-stacked-outline" onPress={() => router.push('/estoque')} style={styles.actionButton} />
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

function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] || 'equipe';
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.lg, paddingBottom: space.xl, paddingTop: space.sm },
  metrics: { flexDirection: 'row', gap: space.md },
  metric: { flex: 1, gap: space.xs },
  metricLabel: { fontSize: 12, color: colors.textMuted, fontWeight: '600' },
  metricValue: { fontSize: 28, fontWeight: '800', color: colors.text },
  metricDanger: { color: colors.danger },
  alertCard: { borderColor: colors.dangerSoft },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  cardTitle: { flex: 1, fontSize: 15, fontWeight: '800', color: colors.text },
  alertItem: { fontSize: 14, color: colors.text },
  actions: { flexDirection: 'row', gap: space.md },
  actionButton: { flex: 1 },
  upcomingRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.xs },
  upcomingText: { flex: 1, fontSize: 14, color: colors.text },
});
