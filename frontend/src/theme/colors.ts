export type ThemeMode = 'light' | 'dark';

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
}

export const brandColors = {
  primary: '#DC2626',      // Crispy Red - Nút CTA chính, Logo, Điểm nhấn
  secondary: '#EA580C',    // Spicy Orange - Thẻ danh mục, Header, Badge
  accent: '#F59E0B',       // Honey Mustard - Ngôi sao, Giá tiền, Upsell
  success: '#16A34A',      // Fresh Green - Bàn trống, Prep Time < 3m
  warning: '#D97706',      // Amber - Bàn chờ dọn, Prep Time 3-5m
  danger: '#DC2626',       // Red - Bàn có khách, Prep Time > 5m
  disabled: '#94A3B8'
} as const;

export const lightTheme: ThemeColors = {
  ...brandColors,
  mode: 'light',
  background: '#FFFBEB',   // Warm Cream - Nền Web App khách hàng & POS
  backgroundSecondary: '#F8FAFC',
  card: '#FFFFFF',         // Pure White - Thẻ món ăn, Modal Popup
  cardSecondary: '#FEF3C7', // Warm Accent Box
  text: '#1E293B',         // Text chính Dark Slate
  textMuted: '#64748B',    // Text phụ Gray
  textLight: '#F8FAFC',    // Text trắng
  border: '#E2E8F0',       // Viền mỏng
  borderSecondary: '#CBD5E1',
  headerBg: '#FFFFFF',
  tabBarBg: '#FFFFFF',
  badgeBg: '#F1F5F9',
  overlay: 'rgba(15, 23, 42, 0.6)'
};

export const darkTheme: ThemeColors = {
  ...brandColors,
  mode: 'dark',
  background: '#0F172A',   // Slate Charcoal - Nền màn hình Bếp KDS chống lóa
  backgroundSecondary: '#1E293B',
  card: '#1E293B',         // Slate Card - Thẻ món trong KDS & Dark Mode
  cardSecondary: '#334155',
  text: '#F8FAFC',         // Text chính trắng sáng
  textMuted: '#94A3B8',    // Text phụ Cool Gray
  textLight: '#F8FAFC',    // Text trắng
  border: '#334155',       // Viền Dark mode
  borderSecondary: '#475569',
  headerBg: '#1E293B',
  tabBarBg: '#0F172A',
  badgeBg: '#334155',
  overlay: 'rgba(0, 0, 0, 0.75)'
};

// Backwards compatibility alias
export const colors = {
  ...lightTheme,
  backgroundDark: darkTheme.background,
  cardDark: darkTheme.card,
  borderDark: darkTheme.border
};

export type Colors = typeof colors;
