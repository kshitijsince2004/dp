import React from 'react';
import { useTranslation } from 'react-i18next';
import { Languages } from 'lucide-react';

/**
 * A premium EN ↔ हिन्दी language toggle button.
 *
 * Variants:
 *   "pill"   – full pill button with icon + label (for navbars)
 *   "icon"   – compact icon-only button (for tight spaces)
 *   "badge"  – floating fixed badge (for login/public pages)
 *
 * @param {{ variant?: 'pill' | 'icon' | 'badge', className?: string }} props
 */
export default function LanguageToggle({ variant = 'pill', className = '' }) {
  const { i18n } = useTranslation();
  const currentLng = i18n.language || 'en';
  const isHindi = currentLng === 'hi';

  const toggle = () => {
    const next = isHindi ? 'en' : 'hi';
    i18n.changeLanguage(next);
    localStorage.setItem('pharos_lng', next);
  };

  if (variant === 'icon') {
    return (
      <button
        type="button"
        id="language-toggle"
        onClick={toggle}
        className={`lang-toggle-icon ${className}`}
        aria-label={isHindi ? 'Switch to English' : 'हिन्दी में बदलें'}
        title={isHindi ? 'Switch to English' : 'हिन्दी में बदलें'}
      >
        <Languages size={18} aria-hidden="true" />
        <span className="lang-toggle-indicator">{isHindi ? 'EN' : 'हि'}</span>
      </button>
    );
  }

  if (variant === 'badge') {
    return (
      <button
        type="button"
        id="language-toggle-badge"
        onClick={toggle}
        className={`lang-toggle-badge ${className}`}
        aria-label={isHindi ? 'Switch to English' : 'हिन्दी में बदलें'}
      >
        <Languages size={14} aria-hidden="true" />
        <span>{isHindi ? 'English' : 'हिन्दी'}</span>
      </button>
    );
  }

  // Default: "pill" variant
  return (
    <button
      type="button"
      id="language-toggle-pill"
      onClick={toggle}
      className={`lang-toggle-pill ${isHindi ? 'is-hindi' : 'is-english'} ${className}`}
      aria-label={isHindi ? 'Switch to English' : 'हिन्दी में बदलें'}
    >
      <Languages size={15} aria-hidden="true" />
      <span className="lang-toggle-label">
        {isHindi ? 'English' : 'हिन्दी'}
      </span>
      <span className="lang-toggle-active-badge">
        {isHindi ? 'हि' : 'EN'}
      </span>
    </button>
  );
}
