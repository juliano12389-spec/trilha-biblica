import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { listProducts } from '../data/production';
import { consumptionReport, dashboardSummary, listStockPosition, productCosts, reorderSuggestions } from '../data/gestao';
import { BackLink, Card, Notice, Screen, ScreenTitle } from '../components/ui';
import { Decimal } from '../domain/decimal';
import { formatBRL, formatNumber, formatQuantity } from '../domain/format';
import { formatPercent, pizzaMargin } from '../domain/gestao';
import { addDaysIso, todayIso } from '../domain/stock';
import { useLoader } from '../hooks/useLoader';
import { colors, space } from '../theme';

// Module-level so the loader keeps a stable identity across renders.
const loadReports = async () => {
  const to = todayIso();
  const from = addDaysIso(to, -30);
  const [summary, position, products, consumption, reorder] = await Promise.all([
    dashboardSummary(),
    listStockPosition(),
    listProducts(),
    consumptionReport(from, to),
    reorderSuggestions(),
  ]);
  const costs = await productCosts(products);
  return { from, to, summary, position, costs, consumption, reorder };
};

export default function RelatoriosScreen() {
  const router = useRouter();
  const reports = useLoader(loadReports);
  const { reload } = reports;
  useFocusEffect(useCallback(() => void reload(), [reload]));

  const data = reports.data;
  const stockTotal = (data?.position ?? []).reduce((sum, row) => sum.add(row.stockValue), Decimal.ZERO);

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={reports.loading} onRefresh={() => void reload()} tintColor={colors.primary} />}
      >
        <BackLink onPress={() => router.back()} />
        <ScreenTitle title="Relatórios" subtitle="Calculados a partir do livro de estoque e das fichas. Nada é digitado à mão." />
        {reports.error ? <Notice tone="error" message={reports.error} /> : null}

        {data ? (
          <Card>
            <Text style={styles.title}>Painel de hoje e do mês</Text>
            <Line label="Valor estimado do estoque" value={formatBRL(data.summary.stockValue)} />
            <Line label="Insumos abaixo do mínimo" value={String(data.summary.belowMinimum)} />
            <Line label="Lotes vencidos com saldo" value={String(data.summary.expired)} />
            <Line label="Lotes que vencem em 7 dias" value={String(data.summary.expiring7d)} />
            <Line label="Pizzas produzidas hoje" value={String(data.summary.pizzasProducedToday)} />
            <Line label="Pizzas vendidas hoje" value={String(data.summary.pizzasSoldToday)} />
            <Line label="Faturamento de hoje" value={formatBRL(data.summary.revenueToday)} />
            <Line label="Perdas estimadas no mês" value={formatBRL(data.summary.wasteValueMonth)} />
          </Card>
        ) : null}

        {data ? (
          <Card>
            <Text style={styles.title}>Custo e margem por pizza</Text>
            <Text style={styles.note}>
              Custo de ingredientes pelo custo médio atual da ficha. Não é lucro: mão de obra, aluguel, energia, impostos e taxas de entrega não entram.
            </Text>
            {data.costs.length === 0 ? <Text style={styles.note}>Nenhum sabor com ficha publicada.</Text> : null}
            {data.costs.map((row) => {
              const { margin, costShare } = pizzaMargin(row.price, row.cost);
              return (
                <View key={row.productId} style={styles.block}>
                  <Text style={styles.name}>{row.name}</Text>
                  <Text style={styles.meta}>
                    Preço {formatBRL(row.price)} • custo de ingredientes {formatBRL(row.cost)} • margem sobre ingredientes {formatBRL(margin)}
                    {costShare ? ` • ingredientes são ${formatPercent(costShare)} do preço` : ''}
                  </Text>
                </View>
              );
            })}
          </Card>
        ) : null}

        {data ? (
          <Card>
            <Text style={styles.title}>Posição de estoque</Text>
            <Text style={styles.note}>Saldo x custo médio. Total: {formatBRL(stockTotal)}.</Text>
            {data.position.map((row) => (
              <View key={row.ingredientId} style={styles.block}>
                <Text style={styles.name}>{row.name}</Text>
                <Text style={styles.meta}>
                  {formatQuantity(row.balance, row.unit)} • mínimo {formatQuantity(row.minimumStock, row.unit)} • valor {formatBRL(row.stockValue)}
                </Text>
              </View>
            ))}
          </Card>
        ) : null}

        {data ? (
          <Card>
            <Text style={styles.title}>Consumo teórico x real</Text>
            <Text style={styles.note}>
              Período de {data.from} a {data.to}. Teórico = fichas x pizzas e preparos. Real = baixas no livro. A diferença é perda e ajuste.
            </Text>
            {data.consumption.length === 0 ? <Text style={styles.note}>Nenhum consumo no período.</Text> : null}
            {data.consumption.map((row) => {
              const gap = row.real.subtract(row.theoretical);
              return (
                <View key={row.ingredientId} style={styles.block}>
                  <Text style={styles.name}>{row.name}</Text>
                  <Text style={styles.meta}>
                    teórico {formatQuantity(row.theoretical, row.unit)} • real {formatQuantity(row.real, row.unit)} • diferença {formatNumber(gap, 2)} {row.unit}
                  </Text>
                </View>
              );
            })}
          </Card>
        ) : null}

        {data ? (
          <Card>
            <Text style={styles.title}>Sugestão de compras</Text>
            <Text style={styles.note}>
              Consumo real dos últimos 30 dias x (prazo do fornecedor + 7 dias), mais o mínimo, menos o saldo. Ainda não considera compras já feitas, porque pedidos de compra não existem no sistema.
            </Text>
            {data.reorder.length === 0 ? <Text style={styles.note}>Nenhum insumo precisa de compra agora.</Text> : null}
            {data.reorder.map((row) => (
              <View key={row.ingredientId} style={styles.block}>
                <Text style={styles.name}>{row.name}</Text>
                <Text style={styles.meta}>
                  sugerir {formatQuantity(row.suggested, row.unit)} • saldo {formatQuantity(row.balance, row.unit)} • consumo diário {formatNumber(row.dailyConsumption, 3)} {row.unit} • prazo {row.leadTimeDays} dia(s)
                </Text>
              </View>
            ))}
          </Card>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.line}>
      <Text style={styles.meta}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.md, paddingBottom: space.xl, paddingTop: space.sm },
  title: { fontSize: 16, fontWeight: '800', color: colors.text },
  note: { fontSize: 12, color: colors.textMuted, lineHeight: 17 },
  block: { gap: 2, paddingVertical: space.xs, borderTopWidth: 1, borderTopColor: colors.border },
  name: { fontSize: 14, fontWeight: '700', color: colors.text },
  meta: { fontSize: 12, color: colors.textMuted, lineHeight: 17 },
  line: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.md, paddingVertical: 2 },
  value: { fontSize: 14, fontWeight: '800', color: colors.text },
});
