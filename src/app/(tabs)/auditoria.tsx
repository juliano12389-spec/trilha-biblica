import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, type ComponentProps } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { dashboardSummary } from '../../data/gestao';
import { BrandHeader, Card, Notice, Pill, Screen, ScreenTitle } from '../../components/ui';
import { useAuth } from '../../features/auth/AuthProvider';
import { useLoader } from '../../hooks/useLoader';
import { colors, space } from '../../theme';

const loadSummary = () => dashboardSummary();

export default function AuditoriaScreen() {
  const router = useRouter();
  const { state } = useAuth();
  const organizationName = state.status === 'ready' ? state.profile.organizationName : '';
  const isAdmin = state.status === 'ready' && state.profile.roleCode === 'administrador';
  const summary = useLoader(loadSummary);
  const { reload } = summary;

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={summary.loading} onRefresh={() => void reload()} tintColor={colors.primary} />}
      >
        <BrandHeader subtitle={`${organizationName} • Auditoria`} />
        <ScreenTitle title="Auditoria e ajustes" subtitle="Contagem física, perdas e aprovações. Tudo fica registrado com motivo." />
        {summary.error ? <Notice tone="error" message={summary.error} /> : null}

        <Hub icon="clipboard-outline" title="Inventário físico" text="Conte o estoque e compare com o sistema." onPress={() => router.push('/auditoria/inventario')} />
        <Hub icon="trash-outline" title="Perdas e desperdícios" text="Registre o que foi perdido, com motivo e custo estimado." onPress={() => router.push('/auditoria/perdas')} />
        <Hub
          icon="checkmark-done-outline"
          title="Aprovações de inventário"
          text={isAdmin ? 'Contagens aguardando sua decisão.' : 'Somente o administrador aprova ajustes.'}
          badge={summary.data?.pendingStocktakes ? String(summary.data.pendingStocktakes) : undefined}
          onPress={() => router.push('/auditoria/aprovacoes')}
        />
        <Hub icon="bar-chart-outline" title="Relatórios e custos" text="Posição de estoque, custo por pizza, consumo e compras." onPress={() => router.push('/relatorios')} />

        {summary.data ? (
          <Card>
            <Text style={styles.cardTitle}>No mês</Text>
            <View style={styles.row}>
              <Text style={styles.meta}>Valor estimado em perdas</Text>
              <Pill label={`R$ ${summary.data.wasteValueMonth.toFixed(2).replace('.', ',')}`} tone="danger" />
            </View>
          </Card>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

function Hub({
  icon,
  title,
  text,
  badge,
  onPress,
}: {
  icon: ComponentProps<typeof Ionicons>['name'];
  title: string;
  text: string;
  badge?: string;
  onPress: () => void;
}) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={title} onPress={onPress}>
      <Card style={styles.hub}>
        <View style={styles.hubTop}>
          <Ionicons name={icon} size={22} color={colors.primary} />
          <Text style={styles.cardTitle}>{title}</Text>
          {badge ? <Pill label={badge} tone="warning" /> : null}
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </View>
        <Text style={styles.meta}>{text}</Text>
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.md, paddingBottom: space.xl, paddingTop: space.sm },
  hub: { gap: space.xs },
  hubTop: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  cardTitle: { flex: 1, fontSize: 15, fontWeight: '800', color: colors.text },
  meta: { fontSize: 13, color: colors.textMuted, lineHeight: 18 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md },
});
