/** Design tokens taken from the StockPro reference screens. */
export const colors = {
  primary: '#B5361A',
  primaryPressed: '#942A12',
  primarySoft: '#FBE7E1',
  background: '#F7F2EF',
  surface: '#FFFFFF',
  border: '#EBDFD8',
  text: '#2B1B14',
  textMuted: '#7D6B64',
  success: '#2E9E55',
  successSoft: '#E3F4E9',
  danger: '#C0392B',
  dangerSoft: '#FCE6E3',
  warning: '#B7791F',
  warningSoft: '#FCF1DC',
  neutralSoft: '#EFE9E6',
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 } as const;

export const radius = { md: 12, lg: 16, pill: 999 } as const;

/** Side gutter for phone widths, per the mobile layout requirement. */
export const GUTTER = 16;
