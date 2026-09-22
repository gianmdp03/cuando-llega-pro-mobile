const MATERIAL_DARK_COLORS = {
  grey6: '#1E1E24',
  grey5: '#28282C',
  grey4: '#25252B',
  grey3: '#A4A4AB',
  grey2: '#8E8E93',
  grey: '#A4A4AB',
  background: '#121212',
  foreground: '#E1E1E6',
  root: '#121212',
  card: '#1E1E24',
  cardForeground: '#E1E1E6',
  popover: '#25252B',
  popoverForeground: '#E1E1E6',
  destructive: '#E5B842',
  primary: '#80D4FF',
  primaryForeground: '#121212',
  secondary: '#25252B',
  secondaryForeground: '#E1E1E6',
  muted: '#28282C',
  mutedForeground: '#A4A4AB',
  accent: '#0E2B18',
  accentForeground: '#6CD58A',
  border: '#28282C',
  input: '#25252B',
  ring: '#80D4FF',
} as const;

const COLORS = {
  white: '#E1E1E6',
  black: '#121212',
  light: MATERIAL_DARK_COLORS,
  dark: MATERIAL_DARK_COLORS,
} as const;

export { COLORS };
