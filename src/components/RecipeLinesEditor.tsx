import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { IngredientListItem } from '../data/catalog';
import type { SplitRule } from '../domain/production';
import { colors, radius, space } from '../theme';
import { Button, Chip, Field, Notice } from './ui';

export interface DraftLine {
  ingredientId: string;
  ingredientName: string;
  consumptionUnit: string;
  quantity: string;
  split: SplitRule;
}

/**
 * Edits the lines of a recipe. Quantities are typed in each ingredient's
 * consumption unit, for one whole pizza (or one batch of a preparo).
 */
export function RecipeLinesEditor({
  lines,
  onChange,
  ingredients,
  mode,
}: {
  lines: DraftLine[];
  onChange: (lines: DraftLine[]) => void;
  ingredients: IngredientListItem[];
  /** 'pizza' shows the metade/inteira rule; a preparo's lines are always inteira. */
  mode: 'pizza' | 'preparo';
}) {
  const [open, setOpen] = useState(false);
  const [ingredientId, setIngredientId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [split, setSplit] = useState<SplitRule>(mode === 'pizza' ? 'metade' : 'inteira');
  const [error, setError] = useState<string | null>(null);

  const available = ingredients.filter((item) => !lines.some((line) => line.ingredientId === item.id));
  const selected = ingredients.find((item) => item.id === ingredientId) ?? null;

  function addLine() {
    if (!selected) {
      setError('Escolha o ingrediente.');
      return;
    }
    if (quantity.trim() === '') {
      setError(`Informe a quantidade em ${selected.consumptionUnit}.`);
      return;
    }
    onChange([
      ...lines,
      {
        ingredientId: selected.id,
        ingredientName: selected.name,
        consumptionUnit: selected.consumptionUnit,
        quantity: quantity.trim(),
        split: mode === 'pizza' ? split : 'inteira',
      },
    ]);
    setIngredientId('');
    setQuantity('');
    setError(null);
    setOpen(false);
  }

  function updateLine(index: number, patch: Partial<DraftLine>) {
    onChange(lines.map((line, position) => (position === index ? { ...line, ...patch } : line)));
  }

  return (
    <View style={styles.wrap}>
      {lines.length === 0 ? <Text style={styles.hint}>Nenhum ingrediente na ficha ainda.</Text> : null}

      {lines.map((line, index) => (
        <View key={line.ingredientId} style={styles.line}>
          <View style={styles.lineHead}>
            <Text style={styles.lineName}>{line.ingredientName}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Remover ${line.ingredientName}`}
              onPress={() => onChange(lines.filter((_, position) => position !== index))}
              style={styles.remove}
            >
              <Ionicons name="trash-outline" size={16} color={colors.danger} />
            </Pressable>
          </View>
          <Field
            label={`Quantidade por ${mode === 'pizza' ? 'pizza' : 'lote'} (${line.consumptionUnit})`}
            value={line.quantity}
            onChangeText={(value) => updateLine(index, { quantity: value })}
            keyboardType="decimal-pad"
          />
          {mode === 'pizza' ? (
            <View style={styles.chipRow}>
              <Chip label="Metade (cada sabor)" selected={line.split === 'metade'} onPress={() => updateLine(index, { split: 'metade' })} />
              <Chip label="Inteira (uma vez)" selected={line.split === 'inteira'} onPress={() => updateLine(index, { split: 'inteira' })} />
            </View>
          ) : null}
        </View>
      ))}

      {open ? (
        <View style={styles.form}>
          <Text style={styles.label}>Ingrediente</Text>
          <View style={styles.chipRow}>
            {available.map((item) => (
              <Chip key={item.id} label={item.name} selected={ingredientId === item.id} onPress={() => setIngredientId(item.id)} />
            ))}
          </View>
          {available.length === 0 ? <Text style={styles.hint}>Todos os ingredientes já estão na ficha.</Text> : null}
          <Field
            label={`Quantidade por ${mode === 'pizza' ? 'pizza' : 'lote'} (${selected?.consumptionUnit ?? 'unidade de consumo'})`}
            value={quantity}
            onChangeText={setQuantity}
            keyboardType="decimal-pad"
          />
          {mode === 'pizza' ? (
            <View style={styles.chipRow}>
              <Chip label="Metade (cada sabor)" selected={split === 'metade'} onPress={() => setSplit('metade')} />
              <Chip label="Inteira (uma vez)" selected={split === 'inteira'} onPress={() => setSplit('inteira')} />
            </View>
          ) : null}
          {error ? <Notice tone="error" message={error} /> : null}
          <View style={styles.actions}>
            <Button label="Adicionar linha" icon="add" onPress={addLine} style={styles.flex} />
            <Button label="Cancelar" variant="ghost" onPress={() => { setOpen(false); setError(null); }} />
          </View>
        </View>
      ) : (
        <Button label="Adicionar ingrediente" variant="secondary" icon="add-circle-outline" onPress={() => setOpen(true)} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.md },
  line: { gap: space.sm, paddingVertical: space.sm, borderTopWidth: 1, borderTopColor: colors.border },
  lineHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  lineName: { fontSize: 15, fontWeight: '700', color: colors.text, flex: 1 },
  remove: { width: 32, height: 32, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.dangerSoft },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  form: { gap: space.md, paddingTop: space.sm },
  label: { fontSize: 13, fontWeight: '600', color: colors.text },
  hint: { fontSize: 12, color: colors.textMuted },
  actions: { gap: space.sm },
  flex: { alignSelf: 'stretch' },
});
