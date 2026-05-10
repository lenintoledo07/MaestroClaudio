// Maestro Claudio — Typography V4 "Studious Calm"
// Espejo de web/src/styles/typography.css.
//   - Inter para UI / chrome / nav
//   - JetBrains Mono para data, timestamps, códigos
//   - Newsreader serif para CONTENIDO (summary, exam tips, respuestas chat)
// Bebas Neue + DM Sans + Space Mono se mantienen por compat.

import {
  useFonts as useBebas,
  BebasNeue_400Regular,
} from '@expo-google-fonts/bebas-neue';
import {
  DMSans_400Regular,
  DMSans_500Medium,
  DMSans_600SemiBold,
} from '@expo-google-fonts/dm-sans';
import {
  SpaceMono_400Regular,
  SpaceMono_700Bold,
} from '@expo-google-fonts/space-mono';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter';
import {
  JetBrainsMono_400Regular,
  JetBrainsMono_500Medium,
  JetBrainsMono_600SemiBold,
} from '@expo-google-fonts/jetbrains-mono';
import {
  Newsreader_400Regular,
  Newsreader_500Medium,
  Newsreader_600SemiBold,
  Newsreader_400Regular_Italic,
} from '@expo-google-fonts/newsreader';

export function useAppFonts() {
  const [loaded] = useBebas({
    BebasNeue_400Regular,
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_600SemiBold,
    SpaceMono_400Regular,
    SpaceMono_700Bold,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    JetBrainsMono_400Regular,
    JetBrainsMono_500Medium,
    JetBrainsMono_600SemiBold,
    Newsreader_400Regular,
    Newsreader_500Medium,
    Newsreader_600SemiBold,
    Newsreader_400Regular_Italic,
  });
  return loaded;
}

export const Fonts = {
  // V4 canónicas
  display:       'Inter_600SemiBold',     // headlines / títulos UI
  body:          'Inter_400Regular',
  bodyMedium:    'Inter_500Medium',
  bodySemibold:  'Inter_600SemiBold',
  mono:          'JetBrainsMono_400Regular',
  monoBold:      'JetBrainsMono_600SemiBold',
  // Serif para contenido prosa (summary, exam tip body, chat assistant)
  serif:         'Newsreader_400Regular',
  serifMedium:   'Newsreader_500Medium',
  serifSemibold: 'Newsreader_600SemiBold',
  serifItalic:   'Newsreader_400Regular_Italic',
} as const;

export const TextStyles = {
  hero:    { fontFamily: Fonts.display, fontSize: 44, lineHeight: 44, letterSpacing: -0.6 },
  display: { fontFamily: Fonts.display, fontSize: 22, lineHeight: 26, letterSpacing: -0.4 },
  title:   { fontFamily: Fonts.bodySemibold, fontSize: 14, lineHeight: 18 },
  body:    { fontFamily: Fonts.body, fontSize: 13.5, lineHeight: 20 },
  small:   { fontFamily: Fonts.body, fontSize: 12, lineHeight: 16 },
  monoSm:  { fontFamily: Fonts.monoBold, fontSize: 10, letterSpacing: 0.8, textTransform: 'uppercase' as const },
  // Variantes serif para contenido
  prose:       { fontFamily: Fonts.serif, fontSize: 16, lineHeight: 24 },
  proseTitle:  { fontFamily: Fonts.serifMedium, fontSize: 22, lineHeight: 28 },
  proseItalic: { fontFamily: Fonts.serifItalic, fontSize: 15, lineHeight: 22 },
};
