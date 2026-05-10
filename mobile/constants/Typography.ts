// Maestro Claudio — Typography
// Carga de fuentes Bebas Neue / DM Sans / Space Mono.

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

/** Hook que carga las 3 familias y devuelve `loaded: boolean`. */
export function useAppFonts() {
  const [loaded] = useBebas({
    BebasNeue_400Regular,
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_600SemiBold,
    SpaceMono_400Regular,
    SpaceMono_700Bold,
  });
  return loaded;
}

export const Fonts = {
  display: 'BebasNeue_400Regular',
  body: 'DMSans_400Regular',
  bodyMedium: 'DMSans_500Medium',
  bodySemibold: 'DMSans_600SemiBold',
  mono: 'SpaceMono_400Regular',
  monoBold: 'SpaceMono_700Bold',
} as const;

export const TextStyles = {
  hero:    { fontFamily: Fonts.display,  fontSize: 56, lineHeight: 56, letterSpacing: 1 },
  display: { fontFamily: Fonts.display,  fontSize: 32, lineHeight: 34, letterSpacing: 0.6 },
  title:   { fontFamily: Fonts.bodySemibold, fontSize: 18, lineHeight: 22 },
  body:    { fontFamily: Fonts.body, fontSize: 14, lineHeight: 20 },
  small:   { fontFamily: Fonts.body, fontSize: 12, lineHeight: 16 },
  monoSm:  { fontFamily: Fonts.monoBold, fontSize: 11, letterSpacing: 1, textTransform: 'uppercase' as const },
};
