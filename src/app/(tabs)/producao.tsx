import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { listProductionOrders, type ProductionOrderItem } from '../../data/production';
import { BrandHeader, Button, EmptyState, Notice, Screen, ScreenTitle } from '../../components/ui';
import { formatBRL, formatDateBr } from '../../domain/format';
import { useAuth } from '../../features/auth/AuthProvider';
import { useLoader } from '../../hooks/useLoader';
import { colors, space } from '../../theme';

const loadOrders = () => listProductionOrders();

export default function ProducaoScreen() {
  const router = useRouter();
  const { state } = useAuth();
  const organizationName = state.status === 'ready' ? state.profile.organizationName : '';
  const orders = useLoader(loadOrders);
  const { reload } = orders;

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  return (
    <Screen>
      <FlatList
        data={orders.data ?? []}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListHeaderComponent={
          <View style={styles.header}>
            <BrandHeader subtitle={`${organizationName} • Produção`} />
            <ScreenTitle title="Produção" subtitle="Pizzas e preparos. Cada ordem guarda a ficha e o custo usados na época." />
            <View style={styles.actions}>
              <Button label="Produzir pizzas" icon="pizza-outline" onPress={() => router.push('/producao/pizza')} style={styles.action} />
              <Button label="Produzir preparo" variant="secondary" icon="flask-outline" onPress={() => router.push('/producao/preparo')} style={styles.action} />
            </View>
            <Button label="Fichas técnicas" variant="ghost" icon="book-outline" onPress={() => router.push('/fichas')} />
            {orders.error ? <Notice tone="error" message={orders.error} /> : null}
          </View>
        }
        renderItem={({ item }) => <OrderRow order={item} />}
        ListEmptyComponent={
          orders.loading ? undefined : (
            <EmptyState
              icon="restaurant-outline"
              title="Nenhuma produção registrada"
              description="Quando você produzir pizzas ou preparos, as ordens aparecem aqui com o custo."
            />
          )
        }
        refreshControl={<RefreshControl refreshing={orders.loading} onRefresh={() => void reload()} tintColor={colors.primary} />}
      />
    </Screen>
  );
}

function OrderRow({ order }: { order: ProductionOrderItem }) {
  return (
    <View style={styles.row}>
      <View style={[styles.icon, { backgroundColor: order.kind === 'pizza' ? colors.primarySoft : colors.successSoft }]}>
        <Ionicons name={order.kind === 'pizza' ? 'pizza-outline' : 'flask-outline'} size={18} color={colors.primary} />
      </View>
      <View style={styles.text}>
        <Text style={styles.title} numberOfLines={2}>
          {order.title}
        </Text>
        <Text style={styles.meta}>
          {order.quantityLabel} • {formatDateBr(order.producedOn)}
        </Text>
      </View>
      <View style={styles.cost}>
        <Text style={styles.total}>{formatBRL(order.totalCost)}</Text>
        <Text style={styles.meta}>{formatBRL(order.unitCost)} / {order.kind === 'pizza' ? 'pizza' : 'unidade'}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: space.lg, paddingBottom: space.xl },
  header: { gap: space.md, paddingTop: space.sm, paddingBottom: space.md },
  separator: { height: space.xs },
  actions: { flexDirection: 'row', gap: space.md },
  action: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm },
  icon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, gap: 2 },
  title: { fontSize: 14, fontWeight: '700', color: colors.text },
  meta: { fontSize: 12, color: colors.textMuted },
  cost: { alignItems: 'flex-end', gap: 2 },
  total: { fontSize: 14, fontWeight: '800', color: colors.text },
});
