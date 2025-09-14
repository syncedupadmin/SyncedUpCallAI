// Design tokens for consistent UI styling
export const tokens = {
  colors: {
    // Primary palette
    primary: '#00d4ff',
    primaryDark: '#0099cc',
    primaryLight: '#33ddff',

    // Secondary palette
    secondary: '#7c3aed',
    secondaryDark: '#6320c4',
    secondaryLight: '#9154f4',

    // Neutral palette
    gray: {
      50: '#f9fafb',
      100: '#f3f4f6',
      200: '#e5e7eb',
      300: '#d1d5db',
      400: '#9ca3af',
      500: '#6b7280',
      600: '#4b5563',
      700: '#374151',
      800: '#1f2937',
      900: '#111827',
    },

    // Semantic colors
    success: '#10b981',
    warning: '#f59e0b',
    danger: '#ef4444',
    info: '#3b82f6',

    // Background colors
    background: '#0a0a0f',
    backgroundSecondary: '#14141f',
    backgroundTertiary: 'rgba(20, 20, 30, 0.6)',

    // Text colors
    text: '#ffffff',
    textSecondary: '#a8a8b3',
    textTertiary: '#6b6b7c',

    // Border colors
    border: 'rgba(255, 255, 255, 0.08)',
    borderHover: 'rgba(255, 255, 255, 0.16)',
  },

  spacing: {
    xs: '4px',
    sm: '8px',
    md: '16px',
    lg: '24px',
    xl: '32px',
    '2xl': '40px',
    '3xl': '48px',
  },

  radii: {
    sm: '4px',
    md: '8px',
    lg: '12px',
    xl: '16px',
    full: '9999px',
  },

  shadows: {
    sm: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
    md: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
    lg: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
    xl: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
    '2xl': '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
    glow: '0 0 20px rgba(0, 212, 255, 0.3)',
  },

  typography: {
    fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    fontSize: {
      xs: '11px',
      sm: '12px',
      md: '14px',
      lg: '16px',
      xl: '18px',
      '2xl': '24px',
      '3xl': '32px',
    },
    fontWeight: {
      normal: 400,
      medium: 500,
      semibold: 600,
      bold: 700,
    },
    lineHeight: {
      tight: 1.2,
      normal: 1.5,
      relaxed: 1.6,
    },
  },

  transitions: {
    fast: '150ms ease',
    normal: '200ms ease',
    slow: '300ms ease',
  },

  zIndex: {
    dropdown: 100,
    sticky: 200,
    modal: 300,
    popover: 400,
    tooltip: 500,
  },
};

// CSS helpers
export const glassEffect = {
  background: 'rgba(20, 20, 30, 0.6)',
  backdropFilter: 'blur(20px)',
  border: `1px solid ${tokens.colors.border}`,
};

export const gradientText = {
  background: 'linear-gradient(135deg, #ffffff 0%, #a8a8b3 100%)',
  WebkitBackgroundClip: 'text',
  WebkitTextFillColor: 'transparent',
  backgroundClip: 'text',
};