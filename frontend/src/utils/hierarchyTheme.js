// src/utils/hierarchyTheme.js
// Canonical PRISM navy+blue palette for all hierarchy levels.
// Profile differences come from content/permissions, not colors.

const PRISM_THEME = {
  '--primary-accent': '#0f52ba', // Delhi Police Royal Blue
  '--primary-glow': 'rgba(15, 82, 186, 0.08)',
  '--accent-gold': '#cca43b', // Crest Gold
  '--accent-gold-glow': 'rgba(204, 164, 59, 0.08)',
  '--primary': '#0d2a4a', // Deep Navy
  '--primary-light': '#16406d',
  '--bg-sidebar': '#091729',
  '--bg-sidebar-hover': '#14283f',
};

export const HIERARCHY_THEMES = {
  PS: { ...PRISM_THEME },
  DISTRICT: { ...PRISM_THEME },
  HQ: { ...PRISM_THEME },
};
