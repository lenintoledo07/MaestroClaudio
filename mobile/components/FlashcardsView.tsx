// Flashcards con flip al tap + navegación. Reemplaza el JSON crudo cuando el
// backend devuelve el array de cards para mode='flashcards'.

import * as React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Colors, Spacing, Radius } from '../constants/Colors';
import { Fonts, TextStyles } from '../constants/Typography';

type Card = { front: string; back: string };

export default function FlashcardsView({ cards }: { cards: Card[] }) {
  const [index, setIndex] = React.useState(0);
  const [flipped, setFlipped] = React.useState(false);
  const card = cards[index];

  if (!card) return null;

  const go = (delta: number) => {
    const next = Math.max(0, Math.min(cards.length - 1, index + delta));
    if (next !== index) {
      setIndex(next);
      setFlipped(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.label}>FLASHCARDS</Text>
        <Text style={styles.label}>{index + 1} / {cards.length}</Text>
      </View>

      <Pressable
        onPress={() => setFlipped((f) => !f)}
        style={[styles.card, flipped && { backgroundColor: 'rgba(129,140,248,0.12)' }]}
      >
        <Text style={styles.sideLabel}>
          {flipped ? 'REVERSO' : 'FRENTE'} · tocá para girar
        </Text>
        <Text style={styles.cardText}>{flipped ? card.back : card.front}</Text>
      </Pressable>

      <View style={styles.actions}>
        <Pressable onPress={() => go(-1)} disabled={index === 0} style={[styles.navBtn, index === 0 && { opacity: 0.4 }]}>
          <Text style={styles.navBtnText}>← Anterior</Text>
        </Pressable>
        <Pressable onPress={() => go(1)} disabled={index === cards.length - 1} style={[styles.navBtn, index === cards.length - 1 && { opacity: 0.4 }]}>
          <Text style={styles.navBtnText}>Siguiente →</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.bg2,
    borderColor: Colors.border, borderWidth: 1,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
  },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: Spacing.md },
  label: { color: Colors.muted, fontSize: 10, letterSpacing: 1, fontFamily: TextStyles.monoSm.fontFamily },

  card: {
    minHeight: 180,
    padding: 22,
    backgroundColor: Colors.bg3,
    borderColor: Colors.border2, borderWidth: 1,
    borderRadius: 12,
    justifyContent: 'center',
  },
  sideLabel: { color: Colors.muted, fontSize: 10, letterSpacing: 1, marginBottom: 10 },
  cardText: { color: Colors.text, fontFamily: Fonts.serif, fontSize: 17, lineHeight: 24 },

  actions: { flexDirection: 'row', justifyContent: 'space-between', marginTop: Spacing.md },
  navBtn: { paddingVertical: 10, paddingHorizontal: 14 },
  navBtnText: { color: Colors.muted, fontSize: 13 },
});
