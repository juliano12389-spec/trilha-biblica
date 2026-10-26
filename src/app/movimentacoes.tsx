import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { listMovements, type MovementItem } from '../data/stock';
import { BackLink, EmptyState, Notice, Screen, ScreenTitle } from '../components/ui';
import type { Decimal } from '../domain/decimal';
import { formatDateTimeBr, formatQuantity } from '../domain/format';
import { formatSignedDelta, movementLabel } from '../domain/movements';
import { useLoader } from '../hooks/useLoader';
import { colors, space } from '../theme';

// Module-level so the loader keeps a stable identity across renders.
const loadRecent = () => listMovements();

export default function MovimentacoesScreen() {
  const router = useRouter();
  const movements = useLoader(loadRecent);
  const { reload } = movements;

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  return (
    <Screen>
      <FlatList
        data={movements.data ?? []}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListHeaderComponent={
          <View style={styles.header}>
            <BackLink onPress={() => router.back()} />
            <ScreenTitle title="Movimentações" subtitle="Últimos 60 registros do livro de estoque, do mais recente ao mais antigo." />
            {movements.error ? <Notice tone="error" message={movements.error} /> : null}
          </View>
        }
        renderItem={({ item }) => <MovementRow movement={item} />}
        ListEmptyComponent={
          movements.loading ? undefined : (
            <EmptyState icon="swap-vertical-outline" title="Nenhuma movimentação ainda" description="Recebimentos, ajustes e descartes aparecem aqui." />
          )
        }
        refreshControl={<RefreshControl refreshing={movements.loading} onRefresh={() => void reload()} tintColor={colors.primary} />}
      />
    </Screen>
  );
}

function MovementRow({ movement }: { movement: MovementItem }) {
  const isEntry = !movement.delta.isNegative();
  const format = (value: Decimal) => formatQuantity(value, movement.unit);
  return (
    <View style={styles.row}>
      <View style={[styles.icon, { backgroundColor: isEntry ? colors.successSoft : colors.dangerSoft }]}>
        <Ionicons name={isEntry ? 'arrow-down-outline' : 'arrow-up-outline'} size={18} color={isEntry ? colors.success : colors.danger} />
      </View>
      <View style={styles.text}>
        <Text style={styles.type}>{movementLabel(movement.type)}</Text>
        <Text style={styles.meta} numberOfLines={1}>
          {movement.ingredientName}
          {movement.reason ? ` • ${movement.reason}` : ''}
        </Text>
        <Text style={styles.meta}>{formatDateTimeBr(movement.occurredAt)}</Text>
      </View>
      <View style={styles.amount}>
        <Text style={[styles.delta, { color: isEntry ? colors.success : colors.danger }]}>
          {formatSignedDelta(movement.delta, format)}
        </Text>
        <Text style={styles.meta}>saldo {format(movement.balanceAfter)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: space.lg, paddingBottom: space.xl },
  header: { gap: space.md, paddingTop: space.sm, paddingBottom: space.md },
  separator: { height: space.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm },
  icon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, gap: 2 },
  type: { fontSize: 14, fontWeight: '700', color: colors.text },
  meta: { fontSize: 12, color: colors.textMuted },
  amount: { alignItems: 'flex-end', gap: 2 },
  delta: { fontSize: 14, fontWeight: '800' },
});
