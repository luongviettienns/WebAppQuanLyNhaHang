export const colors = {
  primary: '#DC2626',      // Crispy Red - Nút CTA chính, Logo, Điểm nhấn
  secondary: '#EA580C',    // Spicy Orange - Thẻ danh mục, Header, Badge
  accent: '#F59E0B',       // Honey Mustard - Ngôi sao, Giá tiền, Upsell
  background: '#FFFBEB',   // Warm Cream - Nền Web App khách hàng & POS
  backgroundDark: '#0F172A', // Slate Charcoal - Nền màn hình Bếp KDS chống lóa
  card: '#FFFFFF',         // Pure White - Thẻ món ăn, Modal Popup
  cardDark: '#1E293B',     // Slate Card - Thẻ món trong KDS
  text: '#1E293B',         // Text chính Dark Slate
  textMuted: '#64748B',    // Text phụ Gray
  textLight: '#F8FAFC',    // Text trắng
  border: '#E2E8F0',       // Viền mỏng
  borderDark: '#334155',   // Viền Dark mode
  
  // Semantic status colors
  success: '#16A34A',      // Fresh Green - Bàn trống, Prep Time < 3m
  warning: '#D97706',      // Amber - Bàn chờ dọn, Prep Time 3-5m
  danger: '#DC2626',       // Red - Bàn có khách, Prep Time > 5m
  disabled: '#94A3B8'
} as const;

export type Colors = typeof colors;
