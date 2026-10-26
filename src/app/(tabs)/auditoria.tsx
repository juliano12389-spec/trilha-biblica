import { StyleSheet, View } from 'react-native';

import { BrandHeader, EmptyState, Screen, ScreenTitle } from '../../components/ui';
import { useAuth } from '../../features/auth/AuthProvider';
import { space } from '../../theme';

export default function AuditoriaScreen() {
  const { state } = useAuth();
  const organizationName = state.status === 'ready' ? state.profile.organizationName : '';

  return (
    <Screen>
      <View style={styles.header}>
        <BrandHeader subtitle={`${organizationName} • Auditoria`} />
        <ScreenTitle title="Auditoria e ajustes" subtitle="Perdas, ajustes e inventário físico." />
      </View>
      <EmptyState
        icon="shield-checkmark-outline"
        title="Auditoria chega nas fases seguintes"
        description="Os ajustes e perdas serão registrados no livro de movimentações (Fase 2). O inventário físico e os relatórios de perdas chegam na Fase 5."
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: space.md, paddingTop: space.sm },
});
