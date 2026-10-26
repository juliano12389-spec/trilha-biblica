import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { listIngredients, type IngredientListItem } from '../../data/catalog';
import { BrandHeader, Button, Card, Chip, EmptyState, Notice, Pill, Screen, ScreenTitle } from '../../components/ui';
import { useAuth } from '../../features/auth/AuthProvider';
import { formatBRL, formatQuantity } from '../../domain/format';
import { stockStatus } from '../../domain/ingredient';
import { useLoader } from '../../hooks/useLoader';
import { colors, radius, space } from '../../theme';

const ALL = 'Todos';

export default function EstoqueScreen() {
  const router = useRouter();
  const { state } = useAuth();
  const organizationName = state.status === 'ready' ? state.profile.organizationName : '';

  const ingredients = useLoader(listIngredients);
  const { reload: reloadIngredients } = ingredients;

  const [query, setQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState(ALL);

  // Reload whenever the screen gains focus, e.g. after saving a new ingredient.
  useFocusEffect(
    useCallback(() => {
      void reloadIngredients();
    }, [reloadIngredients]),
  );

  const items = useMemo(() => ingredients.data ?? [], [ingredients.data]);

  const categoryNames = useMemo(() => {
    const names = new Set(items.map((item) => item.categoryName));
    return [ALL, ...Array.from(names).sort((a, b) => a.localeCompare(b, 'pt-BR'))];
  }, [items]);

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    return items.filter((item) => {
      if (selectedCategory !== ALL && item.categoryName !== selectedCategory) return false;
      if (term === '') return true;
      return item.name.toLowerCase().includes(term) || item.sku.toLowerCase().includes(term);
    });
  }, [items, query, selectedCategory]);

  const belowMinimum = items.filter((item) => stockStatus(item.balance, item.minimumStock) === 'abaixo_minimo').length;

  const header = (
    <View style={styles.header}>
      <BrandHeader subtitle={`${organizationName} • Estoque`} />
      <ScreenTitle
        title="Catálogo de insumos"
        aside={<Pill label={`${items.length} ${items.length === 1 ? 'insumo' : 'insumos'}`} tone="neutral" />}
      />
      <Button label="Novo insumo" icon="add" onPress={() => router.push('/insumo/novo')} />

      <View style={styles.searchBox}>
        <Ionicons name="search" size={18} color={colors.textMuted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Buscar por nome ou código"
          placeholderTextColor={colors.textMuted}
          style={styles.searchInput}
          autoCorrect={false}
          accessibilityLabel="Buscar insumo"
        />
      </View>

      {categoryNames.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          {categoryNames.map((name) => (
            <Chip key={name} label={name} selected={selectedCategory === name} onPress={() => setSelectedCategory(name)} />
          ))}
        </ScrollView>
      ) : null}

      {belowMinimum > 0 ? (
        <Notice tone="error" message={`${belowMinimum} ${belowMinimum === 1 ? 'insumo está' : 'insumos estão'} abaixo do estoque mínimo.`} />
      ) : null}
      {ingredients.error ? <Notice tone="error" message={ingredients.error} /> : null}
    </View>
  );

  if (!ingredients.loading && ingredients.data !== null && items.length === 0 && !ingredients.error) {
    return (
      <Screen>
        {header}
        <EmptyState
          icon="file-tray-outline"
          title="Nenhum insumo cadastrado"
          description="Cadastre os ingredientes da pizzaria para começar a controlar o estoque."
          action={<Button label="Cadastrar primeiro insumo" onPress={() => router.push('/insumo/novo')} />}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <FlatList
        data={visible}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={header}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        renderItem={({ item }) => <IngredientCard item={item} />}
        ListEmptyComponent={
          ingredients.loading ? undefined : (
            <EmptyState icon="search-outline" title="Nenhum insumo encontrado" description="Ajuste a busca ou a categoria selecionada." />
          )
        }
        refreshControl={<RefreshControl refreshing={ingredients.loading} onRefresh={() => void ingredients.reload()} tintColor={colors.primary} />}
        keyboardShouldPersistTaps="handled"
      />
    </Screen>
  );
}

function IngredientCard({ item }: { item: IngredientListItem }) {
  const status = stockStatus(item.balance, item.minimumStock);
  const isLow = status === 'abaixo_minimo';
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Insumo ${item.name}`}>
      <Card style={styles.itemCard}>
        <View style={styles.itemTop}>
          <View style={styles.itemTitle}>
            <Text style={styles.itemCategory}>
              {item.sku} • {item.categoryName}
            </Text>
            <Text style={styles.itemName} numberOfLines={2}>
              {item.name}
            </Text>
          </View>
          <Pill label={isLow ? 'Abaixo do mín.' : 'Normal'} tone={isLow ? 'danger' : 'success'} />
        </View>

        <View style={styles.balanceRow}>
          <View>
            <Text style={styles.balanceLabel}>Saldo em estoque</Text>
            <Text style={[styles.balanceValue, isLow && styles.balanceLow]}>
              {formatQuantity(item.balance, item.stockUnit)}
            </Text>
          </View>
          <View style={styles.balanceRight}>
            <Text style={styles.balanceLabel}>Estoque mínimo</Text>
            <Text style={styles.balanceMin}>{formatQuantity(item.minimumStock, item.stockUnit)}</Text>
          </View>
        </View>

        <Text style={styles.cost}>
          Custo de aquisição: {formatBRL(item.purchaseUnitCost)} / {item.purchaseUnit}
        </Text>
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: space.lg, paddingBottom: space.xl, gap: 0 },
  header: { gap: space.md, paddingTop: space.sm, paddingBottom: space.md },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    minHeight: 48,
  },
  searchInput: { flex: 1, fontSize: 15, color: colors.text, paddingVertical: space.sm },
  chipRow: { gap: space.sm, paddingVertical: space.xs },
  separator: { height: space.md },
  itemCard: { gap: space.md },
  itemTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: space.md },
  itemTitle: { flex: 1, gap: 2 },
  itemCategory: { fontSize: 12, color: colors.textMuted, fontWeight: '600' },
  itemName: { fontSize: 17, fontWeight: '800', color: colors.text },
  balanceRow: { flexDirection: 'row', justifyContent: 'space-between', gap: space.md },
  balanceRight: { alignItems: 'flex-end' },
  balanceLabel: { fontSize: 12, color: colors.textMuted },
  balanceValue: { fontSize: 22, fontWeight: '800', color: colors.text },
  balanceLow: { color: colors.danger },
  balanceMin: { fontSize: 15, fontWeight: '700', color: colors.text },
  cost: { fontSize: 13, color: colors.textMuted },
});
