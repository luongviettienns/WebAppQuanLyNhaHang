export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  
  // Touch Target cong thai hoc F&B
  touchTargetMobile: 44,
  touchTargetPOS: 56,
  touchTargetKDS: 56
};

export const radii = {
  xs: 4,
  sm: 6,
  md: 8,
  lg: 12,
  pill: 999
} as const;

export const elevation = {
  modal: {
    boxShadow: '0 12px 24px rgba(36, 33, 31, 0.24)',
    elevation: 8
  },
  floatingAction: {
    boxShadow: '0 6px 12px rgba(36, 33, 31, 0.2)',
    elevation: 6
  }
} as const;
