import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { listSuppliers } from '../../data/catalog';
import { BackLink, Button, Card, EmptyState, Notice, Screen, ScreenTitle } from '../../components/ui';
import { useLoader } from '../../hooks/useLoader';
import { colors, space } from '../../theme';

// Module-level so the loader keeps a stable identity across renders.
const loadSuppliers = () => listSuppliers();

export default function FornecedoresScreen() {
  const router = useRouter();
  const suppliers = useLoader(loadSuppliers);
  const { reload } = suppliers;

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  return (
    <Screen>
      <FlatList
        data={suppliers.data ?? []}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListHeaderComponent={
          <View style={styles.header}>
            <BackLink onPress={() => router.back()} />
            <ScreenTitle title="Fornecedores" subtitle="Quem entrega os insumos da pizzaria." />
            <Button label="Novo fornecedor" icon="person-add-outline" onPress={() => router.push('/fornecedores/novo')} />
            {suppliers.error ? <Notice tone="error" message={suppliers.error} /> : null}
          </View>
        }
        renderItem={({ item }) => (
          <Card style={styles.card}>
            <Text style={styles.name}>{item.name}</Text>
            {item.document ? <Text style={styles.meta}>Documento {item.document}</Text> : null}
            {item.phone || item.email ? (
              <View style={styles.contact}>
                <Ionicons name="call-outline" size={14} color={colors.textMuted} />
                <Text style={styles.meta}>{[item.phone, item.email].filter(Boolean).join(' • ')}</Text>
              </View>
            ) : null}
          </Card>
        )}
        ListEmptyComponent={
          suppliers.loading ? undefined : (
            <EmptyState
              icon="people-outline"
              title="Nenhum fornecedor cadastrado"
              description="Cadastre os fornecedores para registrar recebimentos com a nota fiscal."
            />
          )
        }
        refreshControl={<RefreshControl refreshing={suppliers.loading} onRefresh={() => void reload()} tintColor={colors.primary} />}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: space.lg, paddingBottom: space.xl },
  header: { gap: space.md, paddingTop: space.sm, paddingBottom: space.md },
  separator: { height: space.md },
  card: { gap: space.xs },
  name: { fontSize: 16, fontWeight: '800', color: colors.text },
  meta: { fontSize: 13, color: colors.textMuted },
  contact: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
});
