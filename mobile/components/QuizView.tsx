// Quiz interactivo. Reemplaza el dump JSON crudo cuando el backend devuelve
// quiz_questions para mode='quiz'.

import * as React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Colors, Spacing, Radius } from '../constants/Colors';
import { Fonts, TextStyles } from '../constants/Typography';

type Question = {
  question: string;
  options: string[];
  correct: number | string;
  explanation?: string;
};

function correctIndex(q: Question, optionsLen: number): number {
  if (typeof q.correct === 'number') return q.correct;
  if (typeof q.correct === 'string') {
    const letter = q.correct.trim().toUpperCase().charAt(0);
    const idx = letter.charCodeAt(0) - 'A'.charCodeAt(0);
    if (idx >= 0 && idx < optionsLen) return idx;
  }
  return -1;
}

export default function QuizView({ questions }: { questions: Question[] }) {
  const [picks, setPicks] = React.useState<(number | null)[]>(() => questions.map(() => null));
  const answered = picks.filter((p) => p !== null).length;
  const correctCount = picks.reduce<number>(
    (acc, p, i) => (p != null && p === correctIndex(questions[i], questions[i].options?.length || 4) ? acc + 1 : acc),
    0,
  );
  const allAnswered = answered === questions.length;

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.label}>QUIZ</Text>
        {allAnswered && (
          <Text style={[styles.label, { color: Colors.orange }]}>
            {correctCount}/{questions.length}
          </Text>
        )}
      </View>

      {questions.map((q, qi) => {
        const pick = picks[qi];
        const correct = correctIndex(q, q.options?.length || 4);
        const isAnswered = pick != null;
        return (
          <View key={qi} style={styles.qBlock}>
            <Text style={styles.qText}>
              <Text style={styles.qNum}>{qi + 1}. </Text>{q.question}
            </Text>
            <View style={{ marginTop: 8 }}>
              {(q.options || []).map((opt, oi) => {
                const isPick = pick === oi;
                const isCorrect = correct === oi;
                let bg = Colors.bg3;
                let border = Colors.border;
                if (isAnswered) {
                  if (isCorrect) { bg = 'rgba(34,197,94,0.15)'; border = '#22C55E'; }
                  else if (isPick) { bg = 'rgba(239,68,68,0.15)'; border = '#EF4444'; }
                }
                return (
                  <Pressable
                    key={oi}
                    onPress={() => !isAnswered && setPicks((p) => p.map((v, i) => i === qi ? oi : v))}
                    disabled={isAnswered}
                    style={[styles.optBtn, { backgroundColor: bg, borderColor: border }]}
                  >
                    <Text style={styles.optLetter}>{String.fromCharCode(65 + oi)}</Text>
                    <Text style={styles.optText}>{opt}</Text>
                    {isAnswered && isCorrect && <Text style={styles.optMark}>✓</Text>}
                    {isAnswered && isPick && !isCorrect && <Text style={[styles.optMark, { color: '#EF4444' }]}>✗</Text>}
                  </Pressable>
                );
              })}
            </View>
            {isAnswered && q.explanation && (
              <View style={styles.explanation}>
                <Text style={styles.explanationText}>
                  <Text style={{ color: Colors.muted }}>↳ </Text>{q.explanation}
                </Text>
              </View>
            )}
          </View>
        );
      })}
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

  qBlock: { marginBottom: Spacing.lg },
  qNum: { color: Colors.muted, fontWeight: '600' },
  qText: { color: Colors.text, fontFamily: Fonts.serif, fontSize: 15, lineHeight: 22 },

  optBtn: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 10, paddingHorizontal: 12,
    marginBottom: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  optLetter: { color: Colors.muted, fontFamily: 'monospace', marginRight: 10, fontSize: 13 },
  optText: { color: Colors.text, fontSize: 13, flex: 1, lineHeight: 18 },
  optMark: { color: '#22C55E', fontSize: 16, marginLeft: 8 },

  explanation: {
    marginTop: 6,
    padding: 8,
    backgroundColor: Colors.bg3,
    borderRadius: 6,
  },
  explanationText: { color: Colors.text, fontSize: 12, lineHeight: 18 },
});
