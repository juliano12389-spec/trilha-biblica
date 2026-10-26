import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { getSalesMode, setSalesMode } from '../../data/sales';
import { BackLink, Button, Card, Notice, Pill, Screen, ScreenTitle } from '../../components/ui';
import { SALES_MODES, type SalesModeCode } from '../../domain/sales';
import { useAuth } from '../../features/auth/AuthProvider';
import { useLoader } from '../../hooks/useLoader';
import { colors, radius, space } from '../../theme';

const loadMode = () => getSalesMode();

export default function ModoVendasScreen() {
  const router = useRouter();
  const { state } = useAuth();
  const isAdmin = state.status === 'ready' && state.profile.roleCode === 'administrador';
  const current = useLoader(loadMode);
  const [selected, setSelected] = useState<SalesModeCode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const chosen = selected ?? current.data ?? null;

  async function save() {
    if (!chosen || submitting) return;
    setError(null);
    setSaved(false);
    setSubmitting(true);
    try {
      await setSalesMode(chosen);
      setSaved(true);
      await current.reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível mudar o modo.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <BackLink onPress={() => router.back()} />
        <ScreenTitle title="Modo de baixa" subtitle="Define quando os ingredientes saem do estoque." />
        {!isAdmin ? <Notice tone="info" message="Somente o administrador pode mudar o modo. Você pode consultar a configuração." /> : null}
        {error ? <Notice tone="error" message={error} /> : null}
        {saved ? <Notice tone="info" message="Modo atualizado." /> : null}

        {SALES_MODES.map((option) => {
          const active = chosen === option.code;
          return (
            <Pressable
              key={option.code}
              accessibilityRole="radio"
              accessibilityState={{ selected: active, disabled: !isAdmin }}
              onPress={() => isAdmin && setSelected(option.code)}
              style={[styles.option, active && styles.optionActive]}
            >
              <View style={styles.optionTop}>
                <Text style={styles.optionTitle}>{option.label}</Text>
                {current.data === option.code ? <Pill label="Atual" tone="success" /> : null}
              </View>
              <Text style={styles.optionText}>{option.description}</Text>
            </Pressable>
          );
        })}

        <Card>
          <Text style={styles.optionText}>
            Mudar para baixa na venda não é permitido enquanto houver pizzas prontas em estoque.
          </Text>
        </Card>

        {isAdmin ? (
          <Button label="Salvar modo" icon="checkmark" onPress={() => void save()} loading={submitting} />
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.md, paddingBottom: space.xl },
  option: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: space.lg, gap: space.xs, backgroundColor: colors.surface },
  optionActive: { borderColor: colors.primary, borderWidth: 2 },
  optionTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  optionTitle: { fontSize: 16, fontWeight: '800', color: colors.text },
  optionText: { fontSize: 13, color: colors.textMuted, lineHeight: 19 },
});
