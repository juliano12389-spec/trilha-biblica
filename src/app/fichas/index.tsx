import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { listPreparoRecipes, listProducts } from '../../data/production';
import { BackLink, Button, Card, EmptyState, Notice, Pill, Screen, ScreenTitle } from '../../components/ui';
import { formatBRL, formatNumber } from '../../domain/format';
import { PIZZA_SIZES } from '../../domain/production';
import { useLoader } from '../../hooks/useLoader';
import { colors, space } from '../../theme';

const loadProducts = () => listProducts();
const loadPreparos = () => listPreparoRecipes();

export default function FichasScreen() {
  const router = useRouter();
  const products = useLoader(loadProducts);
  const preparos = useLoader(loadPreparos);
  const { reload: reloadProducts } = products;
  const { reload: reloadPreparos } = preparos;

  useFocusEffect(
    useCallback(() => {
      void reloadProducts();
      void reloadPreparos();
    }, [reloadProducts, reloadPreparos]),
  );

  const error = products.error ?? preparos.error;

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={products.loading || preparos.loading}
            onRefresh={() => {
              void reloadProducts();
              void reloadPreparos();
            }}
            tintColor={colors.primary}
          />
        }
      >
        <BackLink onPress={() => router.back()} />
        <ScreenTitle title="Fichas técnicas" subtitle="Receita de cada sabor e de cada preparo. Mudanças geram uma nova versão." />
        {error ? <Notice tone="error" message={error} /> : null}

        <Card>
          <View style={styles.sectionHead}>
            <Ionicons name="pizza-outline" size={18} color={colors.primary} />
            <Text style={styles.sectionTitle}>Pizzas</Text>
          </View>
          {products.data && products.data.length === 0 ? (
            <EmptyState icon="pizza-outline" title="Nenhum sabor cadastrado" description="Cadastre um sabor e depois publique a sua ficha técnica." />
          ) : null}
          {(products.data ?? []).map((product) => (
            <View key={product.id} style={styles.row}>
              <View style={styles.rowText}>
                <Text style={styles.name}>{product.name}</Text>
                <Text style={styles.meta}>
                  {product.code} • {PIZZA_SIZES.find((size) => size.code === product.size)?.label} • {formatBRL(product.salePrice)}
                </Text>
              </View>
              <Pill label={product.hasRecipe ? 'Com ficha' : 'Sem ficha'} tone={product.hasRecipe ? 'success' : 'warning'} />
              {product.pizzaRecipeId ? (
                <Button
                  label={product.hasRecipe ? 'Editar ficha' : 'Publicar ficha'}
                  variant="secondary"
                  onPress={() =>
                    router.push({ pathname: '/fichas/editar', params: { recipeId: product.pizzaRecipeId ?? '', title: product.name, kind: 'pizza' } })
                  }
                  style={styles.rowButton}
                />
              ) : null}
            </View>
          ))}
          <Button label="Novo sabor" icon="add" onPress={() => router.push('/fichas/novo-produto')} />
        </Card>

        <Card>
          <View style={styles.sectionHead}>
            <Ionicons name="flask-outline" size={18} color={colors.primary} />
            <Text style={styles.sectionTitle}>Preparos</Text>
          </View>
          {preparos.data && preparos.data.length === 0 ? (
            <Text style={styles.hint}>Molhos, massas e outros preparos feitos em lote. Ex.: molho de tomate com 2 kg de tomate.</Text>
          ) : null}
          {(preparos.data ?? []).map((preparo) => (
            <View key={preparo.id} style={styles.row}>
              <View style={styles.rowText}>
                <Text style={styles.name}>{preparo.name}</Text>
                <Text style={styles.meta}>
                  Gera {preparo.outputName} • rendimento de {formatNumber(preparo.yieldQuantity, 2)} {preparo.outputUnit} por lote
                </Text>
              </View>
              <Pill label={preparo.hasRecipe ? 'Com ficha' : 'Sem ficha'} tone={preparo.hasRecipe ? 'success' : 'warning'} />
              <Button
                label={preparo.hasRecipe ? 'Editar ficha' : 'Publicar ficha'}
                variant="secondary"
                onPress={() => router.push({ pathname: '/fichas/editar', params: { recipeId: preparo.id, title: preparo.name, kind: 'preparo' } })}
                style={styles.rowButton}
              />
            </View>
          ))}
          <Button label="Novo preparo" icon="add" onPress={() => router.push('/fichas/novo-preparo')} />
        </Card>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.lg, paddingBottom: space.xl },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: colors.text },
  row: { gap: space.sm, paddingVertical: space.sm, borderTopWidth: 1, borderTopColor: colors.border },
  rowText: { gap: 2 },
  rowButton: { alignSelf: 'stretch' },
  name: { fontSize: 15, fontWeight: '700', color: colors.text },
  meta: { fontSize: 12, color: colors.textMuted },
  hint: { fontSize: 12, color: colors.textMuted, lineHeight: 17 },
});
