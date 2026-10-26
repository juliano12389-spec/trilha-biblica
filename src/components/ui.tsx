import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps, ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, radius, space } from '../theme';

export function Screen({ children, edges }: { children: ReactNode; edges?: ComponentProps<typeof SafeAreaView>['edges'] }) {
  return (
    <SafeAreaView style={styles.screen} edges={edges ?? ['top', 'left', 'right']}>
      {children}
    </SafeAreaView>
  );
}

export function BrandHeader({ subtitle }: { subtitle: string }) {
  return (
    <View style={styles.brandRow}>
      <View style={styles.brandMark}>
        <Ionicons name="cube" size={20} color={colors.surface} />
      </View>
      <View style={styles.brandText}>
        <View style={styles.brandTitleRow}>
          <Text style={styles.brandName}>StockPro</Text>
        </View>
        <Text style={styles.brandSubtitle} numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
    </View>
  );
}

export function BackLink({ onPress }: { onPress: () => void }) {
  return <Button label="Voltar" variant="ghost" icon="chevron-back" onPress={onPress} style={styles.backLink} />;
}

export function ScreenTitle({ title, subtitle, aside }: { title: string; subtitle?: string; aside?: ReactNode }) {
  return (
    <View style={styles.titleRow}>
      <View style={styles.titleText}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      {aside}
    </View>
  );
}

type ButtonVariant = 'primary' | 'secondary' | 'ghost';

export function Button({
  label,
  onPress,
  variant = 'primary',
  loading = false,
  disabled = false,
  icon,
  style,
}: {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  loading?: boolean;
  disabled?: boolean;
  icon?: ComponentProps<typeof Ionicons>['name'];
  style?: ViewStyle;
}) {
  const isDisabled = disabled || loading;
  const textColor = variant === 'primary' ? colors.surface : colors.primary;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.button,
        variant === 'primary' && styles.buttonPrimary,
        variant === 'secondary' && styles.buttonSecondary,
        variant === 'ghost' && styles.buttonGhost,
        pressed && variant === 'primary' && styles.buttonPrimaryPressed,
        isDisabled && styles.buttonDisabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={textColor} />
      ) : (
        <View style={styles.buttonContent}>
          {icon ? <Ionicons name={icon} size={18} color={textColor} /> : null}
          <Text style={[styles.buttonLabel, { color: textColor }]}>{label}</Text>
        </View>
      )}
    </Pressable>
  );
}

export function Field({
  label,
  error,
  hint,
  ...inputProps
}: TextInputProps & { label: string; error?: string; hint?: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        placeholderTextColor={colors.textMuted}
        accessibilityLabel={label}
        style={[styles.input, error ? styles.inputError : null, inputProps.multiline && styles.inputMultiline]}
        {...inputProps}
      />
      {error ? <Text style={styles.fieldError}>{error}</Text> : hint ? <Text style={styles.fieldHint}>{hint}</Text> : null}
    </View>
  );
}

export function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.chip, selected ? styles.chipSelected : styles.chipIdle]}
    >
      <Text style={[styles.chipLabel, selected ? styles.chipLabelSelected : null]}>{label}</Text>
    </Pressable>
  );
}

export function Pill({ label, tone }: { label: string; tone: 'success' | 'danger' | 'warning' | 'neutral' }) {
  const palette = {
    success: { bg: colors.successSoft, fg: colors.success },
    danger: { bg: colors.dangerSoft, fg: colors.danger },
    warning: { bg: colors.warningSoft, fg: colors.warning },
    neutral: { bg: colors.neutralSoft, fg: colors.textMuted },
  }[tone];
  return (
    <View style={[styles.pill, { backgroundColor: palette.bg }]}>
      <Text style={[styles.pillLabel, { color: palette.fg }]}>{label}</Text>
    </View>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Notice({ tone, message }: { tone: 'error' | 'info'; message: string }) {
  const isError = tone === 'error';
  return (
    <View style={[styles.notice, { backgroundColor: isError ? colors.dangerSoft : colors.primarySoft }]}>
      <Ionicons
        name={isError ? 'alert-circle' : 'information-circle'}
        size={18}
        color={isError ? colors.danger : colors.primary}
      />
      <Text style={[styles.noticeText, { color: isError ? colors.danger : colors.text }]}>{message}</Text>
    </View>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: ComponentProps<typeof Ionicons>['name'];
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Ionicons name={icon} size={28} color={colors.primary} />
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyDescription}>{description}</Text>
      {action}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  backLink: { alignSelf: 'flex-start', paddingHorizontal: 0, minHeight: 36 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingTop: space.sm },
  brandMark: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandText: { flex: 1 },
  brandTitleRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  brandName: { fontSize: 18, fontWeight: '800', color: colors.text },
  brandSubtitle: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: space.md },
  titleText: { flex: 1 },
  title: { fontSize: 22, fontWeight: '800', color: colors.text },
  subtitle: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  button: {
    minHeight: 50,
    borderRadius: radius.md,
    paddingHorizontal: space.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonPrimary: { backgroundColor: colors.primary },
  buttonPrimaryPressed: { backgroundColor: colors.primaryPressed },
  buttonSecondary: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  buttonGhost: { backgroundColor: 'transparent' },
  buttonDisabled: { opacity: 0.5 },
  buttonContent: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  buttonLabel: { fontSize: 16, fontWeight: '700' },
  field: { gap: space.xs },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: colors.text },
  input: {
    minHeight: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: space.md,
    fontSize: 16,
    color: colors.text,
  },
  inputMultiline: { minHeight: 80, paddingTop: space.md, textAlignVertical: 'top' },
  inputError: { borderColor: colors.danger },
  fieldError: { fontSize: 12, color: colors.danger },
  fieldHint: { fontSize: 12, color: colors.textMuted },
  chip: { paddingHorizontal: space.md, paddingVertical: space.sm, borderRadius: radius.pill, borderWidth: 1 },
  chipIdle: { backgroundColor: colors.surface, borderColor: colors.border },
  chipSelected: { backgroundColor: colors.text, borderColor: colors.text },
  chipLabel: { fontSize: 13, fontWeight: '600', color: colors.text },
  chipLabelSelected: { color: colors.surface },
  pill: { paddingHorizontal: space.sm, paddingVertical: 2, borderRadius: radius.pill, alignSelf: 'flex-start' },
  pillLabel: { fontSize: 11, fontWeight: '700' },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.lg,
    gap: space.sm,
  },
  notice: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm, padding: space.md, borderRadius: radius.md },
  noticeText: { flex: 1, fontSize: 14, lineHeight: 20 },
  empty: { alignItems: 'center', gap: space.sm, paddingVertical: space.xl, paddingHorizontal: space.lg },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.sm,
  },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: colors.text, textAlign: 'center' },
  emptyDescription: { fontSize: 14, color: colors.textMuted, textAlign: 'center', lineHeight: 20 },
});
