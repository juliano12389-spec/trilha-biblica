import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { getSalesMode, listFinishedGoods, listSales } from '../../data/sales';
import { BackLink, Button, Card, EmptyState, Notice, Pill, Screen, ScreenTitle } from '../../components/ui';
import { CHANNELS, SALES_MODES } from '../../domain/sales';
import { formatBRL, formatDateTimeBr } from '../../domain/format';
import { useLoader } from '../../hooks/useLoader';
import { colors, space } from '../../theme';

const loadSales = () => listSales();
const loadFinished = () => listFinishedGoods();
const loadMode = () => getSalesMode();

export default function VendasScreen() {
  const router = useRouter();
  const sales = useLoader(loadSales);
  const finished = useLoader(loadFinished);
  const mode = useLoader(loadMode);
  const { reload: reloadSales } = sales;
  const { reload: reloadFinished } = finished;
  const { reload: reloadMode } = mode;

  useFocusEffect(
    useCallback(() => {
      void reloadSales();
      void reloadFinished();
      void reloadMode();
    }, [reloadSales, reloadFinished, reloadMode]),
  );

  const modeInfo = SALES_MODES.find((option) => option.code === mode.data) ?? SALES_MODES[0];
  const error = sales.error ?? finished.error ?? mode.error;

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={sales.loading || finished.loading}
            onRefresh={() => {
              void reloadSales();
              void reloadFinished();
              void reloadMode();
            }}
            tintColor={colors.primary}
          />
        }
      >
        <BackLink onPress={() => router.back()} />
        <ScreenTitle title="Vendas" subtitle="Pedidos de balcão, telefone, WhatsApp e delivery." />
        {error ? <Notice tone="error" message={error} /> : null}

        <Card>
          <View style={styles.modeRow}>
            <Ionicons name="options-outline" size={18} color={colors.primary} />
            <Text style={styles.cardTitle}>Modo: {modeInfo.label}</Text>
          </View>
          <Text style={styles.meta}>{modeInfo.description}</Text>
          <Button label="Configurar modo" variant="secondary" onPress={() => router.push('/vendas/modo')} />
        </Card>

        {mode.data === 'baixa_na_producao' ? (
          <Card>
            <Text style={styles.cardTitle}>Pizzas prontas em estoque</Text>
            {finished.data && finished.data.length === 0 ? (
              <Text style={styles.meta}>Nenhuma pizza pronta. Registre uma produção para abastecer o balcão.</Text>
            ) : null}
            {(finished.data ?? []).map((row) => (
              <View key={`${row.productAId}-${row.productBId ?? ''}`} style={styles.row}>
                <Text style={styles.name}>{row.label}</Text>
                <Text style={styles.total}>{row.balance} {row.balance === 1 ? 'pizza' : 'pizzas'}</Text>
              </View>
            ))}
          </Card>
        ) : null}

        <Button label="Nova venda" icon="add" onPress={() => router.push('/vendas/nova')} />

        <Text style={styles.section}>Últimas vendas</Text>
        {sales.data && sales.data.length === 0 ? (
          <EmptyState icon="receipt-outline" title="Nenhuma venda ainda" description="As vendas registradas aparecem aqui, com o número do pedido." />
        ) : null}
        {(sales.data ?? []).map((sale) => {
          const channel = CHANNELS.find((option) => option.code === sale.channel)?.label ?? sale.channel;
          const cancelled = sale.status === 'cancelada';
          return (
            <Card key={sale.id} style={cancelled ? styles.cancelledCard : undefined}>
              <View style={styles.saleTop}>
                <Text style={styles.name}>Pedido #{sale.saleNumber} • {channel}</Text>
                <Pill label={cancelled ? 'Cancelada' : 'Confirmada'} tone={cancelled ? 'neutral' : 'success'} />
              </View>
              <Text style={styles.meta}>
                {formatDateTimeBr(sale.soldAt)}
                {sale.payment ? ` • ${sale.payment}` : ''}
                {sale.discount.isPositive() ? ` • desconto ${formatBRL(sale.discount)}` : ''}
              </Text>
              <View style={styles.saleBottom}>
                <Text style={[styles.total, cancelled && styles.strike]}>{formatBRL(sale.total)}</Text>
                {!cancelled ? (
                  <Button
                    label="Cancelar"
                    variant="secondary"
                    icon="close-circle-outline"
                    onPress={() => router.push({ pathname: '/vendas/cancelar', params: { saleId: sale.id, number: String(sale.saleNumber) } })}
                    style={styles.cancelButton}
                  />
                ) : null}
              </View>
              {cancelled && sale.cancelReason ? <Text style={styles.meta}>Motivo: {sale.cancelReason}</Text> : null}
            </Card>
          );
        })}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.lg, paddingBottom: space.xl },
  modeRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  cardTitle: { flex: 1, fontSize: 15, fontWeight: '800', color: colors.text },
  section: { fontSize: 15, fontWeight: '800', color: colors.text },
  meta: { fontSize: 12, color: colors.textMuted, lineHeight: 17 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: space.xs },
  name: { flex: 1, fontSize: 14, fontWeight: '700', color: colors.text },
  total: { fontSize: 15, fontWeight: '800', color: colors.text },
  strike: { textDecorationLine: 'line-through', color: colors.textMuted },
  saleTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  saleBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  cancelButton: { minHeight: 40, paddingHorizontal: space.md },
  cancelledCard: { opacity: 0.7 },
});
