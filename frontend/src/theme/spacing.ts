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
  pill: 999
} as const;

export const elevation = {
  modal: {
    shadowColor: '#24211F',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.24,
    shadowRadius: 24,
    elevation: 8
  },
  floatingAction: {
    shadowColor: '#24211F',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 6
  }
} as const;
