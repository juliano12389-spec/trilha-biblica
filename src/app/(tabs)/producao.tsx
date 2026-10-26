import { BrandHeader, EmptyState, Screen, ScreenTitle } from '../../components/ui';
import { useAuth } from '../../features/auth/AuthProvider';
import { space } from '../../theme';
import { StyleSheet, View } from 'react-native';

export default function ProducaoScreen() {
  const { state } = useAuth();
  const organizationName = state.status === 'ready' ? state.profile.organizationName : '';

  return (
    <Screen>
      <View style={styles.header}>
        <BrandHeader subtitle={`${organizationName} • Produção`} />
        <ScreenTitle title="Produção" subtitle="Fichas técnicas e baixa automática de ingredientes." />
      </View>
      <EmptyState
        icon="restaurant-outline"
        title="Produção chega na Fase 3"
        description="Aqui ficarão as fichas técnicas das pizzas e o registro de produção com baixa automática dos ingredientes."
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: space.md, paddingTop: space.sm },
});
