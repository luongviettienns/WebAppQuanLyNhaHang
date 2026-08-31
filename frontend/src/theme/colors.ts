import type { Role } from '../api/contracts';

export type ThemeMode = 'light' | 'dark';
export type ThemeRole = Role | 'GUEST';

export interface StatusColor {
  background: string;
  border: string;
  text: string;
}

export interface ThemeColors {
  primary: string;
  secondary: string;
  accent: string;
  success: string;
  warning: string;
  danger: string;
  disabled: string;
  mode: ThemeMode;
  background: string;
  backgroundSecondary: string;
  card: string;
  cardSecondary: string;
  text: string;
  textMuted: string;
  textLight: string;
  border: string;
  borderSecondary: string;
  headerBg: string;
  tabBarBg: string;
  badgeBg: string;
  overlay: string;
  surfaceCanvas: string;
  surfaceBase: string;
  surfaceRaised: string;
  surfaceSunken: string;
  textPrimary: string;
  textSecondary: string;
  textInverse: string;
  borderSubtle: string;
  borderStrong: string;
  focusRing: string;
  interactivePrimary: string;
  interactivePrimaryPressed: string;
  interactiveSecondary: string;
  interactiveSecondaryPressed: string;
  interactiveQuiet: string;
  interactiveDanger: string;
  interactiveDangerPressed: string;
}

export const brandColors = {
  primary: '#B42318',
  secondary: '#C66A15',
  accent: '#C66A15',
  success: '#15803D',
  warning: '#C66A15',
  danger: '#B42318',
  disabled: '#9A958E'
} as const;

export const statusColors = {
  neutral: { background: '#F4F3F0', border: '#D8D4CE', text: '#514C47' },
  info: { background: '#E9F1FB', border: '#AFC6E6', text: '#174A7C' },
  success: { background: '#E8F3EA', border: '#A9D6B4', text: '#126334' },
  warning: { background: '#FFF1DD', border: '#F1C78B', text: '#8A480B' },
  danger: { background: '#FCE9E7', border: '#EBA8A2', text: '#8F1C13' },
  order: {
    PENDING: { background: '#FFF1DD', border: '#F1C78B', text: '#8A480B' },
    PREPARING: { background: '#E9F1FB', border: '#AFC6E6', text: '#174A7C' },
    READY: { background: '#E8F3EA', border: '#A9D6B4', text: '#126334' },
    COMPLETED: { background: '#F4F3F0', border: '#D8D4CE', text: '#514C47' },
    CANCELLED: { background: '#FCE9E7', border: '#EBA8A2', text: '#8F1C13' }
  },
  table: {
    AVAILABLE: { background: '#E8F3EA', border: '#A9D6B4', text: '#126334' },
    OCCUPIED: { background: '#FCE9E7', border: '#EBA8A2', text: '#8F1C13' },
    NEED_CLEANING: { background: '#FFF1DD', border: '#F1C78B', text: '#8A480B' },
    DIRTY: { background: '#F4F3F0', border: '#D8D4CE', text: '#514C47' }
  }
} as const satisfies Record<string, StatusColor | Record<string, StatusColor>>;

export const lightTheme: ThemeColors = {
  ...brandColors,
  mode: 'light',
  background: '#F4F3F0',
  backgroundSecondary: '#ECEAE6',
  card: '#FFFFFF',
  cardSecondary: '#F8F7F5',
  text: '#24211F',
  textMuted: '#6B6560',
  textLight: '#FFFFFF',
  border: '#D8D4CE',
  borderSecondary: '#BDB7AF',
  headerBg: '#FFFFFF',
  tabBarBg: '#FFFFFF',
  badgeBg: '#F4F3F0',
  overlay: 'rgba(36, 33, 31, 0.60)',
  surfaceCanvas: '#F4F3F0',
  surfaceBase: '#FFFFFF',
  surfaceRaised: '#FFFFFF',
  surfaceSunken: '#ECEAE6',
  textPrimary: '#24211F',
  textSecondary: '#6B6560',
  textInverse: '#FFFFFF',
  borderSubtle: '#D8D4CE',
  borderStrong: '#BDB7AF',
  focusRing: '#0F6CBD',
  interactivePrimary: '#B42318',
  interactivePrimaryPressed: '#8F1C13',
  interactiveSecondary: '#FFF1DD',
  interactiveSecondaryPressed: '#F8D9B2',
  interactiveQuiet: '#F4F3F0',
  interactiveDanger: '#B42318',
  interactiveDangerPressed: '#8F1C13'
};

export const darkTheme: ThemeColors = {
  ...brandColors,
  mode: 'dark',
  background: '#24211F',
  backgroundSecondary: '#2D2926',
  card: '#35312E',
  cardSecondary: '#403B37',
  text: '#F7F5F2',
  textMuted: '#C8C2BB',
  textLight: '#FFFFFF',
  border: '#514C47',
  borderSecondary: '#6B6560',
  headerBg: '#2D2926',
  tabBarBg: '#24211F',
  badgeBg: '#403B37',
  overlay: 'rgba(0, 0, 0, 0.72)',
  surfaceCanvas: '#24211F',
  surfaceBase: '#2D2926',
  surfaceRaised: '#35312E',
  surfaceSunken: '#1C1A18',
  textPrimary: '#F7F5F2',
  textSecondary: '#C8C2BB',
  textInverse: '#24211F',
  borderSubtle: '#514C47',
  borderStrong: '#6B6560',
  focusRing: '#7DB8E8',
  interactivePrimary: '#D34B40',
  interactivePrimaryPressed: '#B42318',
  interactiveSecondary: '#4A3520',
  interactiveSecondaryPressed: '#604527',
  interactiveQuiet: '#403B37',
  interactiveDanger: '#D34B40',
  interactiveDangerPressed: '#B42318'
};

export const defaultModeForRole = (role: ThemeRole): ThemeMode =>
  role === 'KITCHEN' ? 'dark' : 'light';

export const storageKeyForRole = (role: ThemeRole) =>
  `crispy_bite_theme_${role.toLowerCase()}`;

// Backwards compatibility alias for screens that have not yet adopted semantic tokens.
export const colors = {
  ...lightTheme,
  backgroundDark: darkTheme.background,
  cardDark: darkTheme.card,
  borderDark: darkTheme.border
};

export type Colors = typeof colors;
