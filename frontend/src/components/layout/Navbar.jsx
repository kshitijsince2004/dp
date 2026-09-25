import { Link } from 'react-router-dom';
import { Shield, LogOut, User, Menu, X } from 'lucide-react';
import { useState } from 'react';
import useAuthStore from '../../store/authStore.js';
import { useAuth } from '../../hooks/useAuth.js';
import { ROUTES, APP_NAME } from '../../utils/constants.js';
import delhiPoliceLogo from '../../assets/delhi_police_logo.png';
import LanguageToggle from '../ui/LanguageToggle.jsx';

const navLinks = [
  { label: 'About PRISM', to: '#about' },
  { label: 'Security Policy', to: '#security' },
  { label: 'Helplines', to: '#helplines' },
];

export const Navbar = () => {
  const { isAuthenticated, user } = useAuthStore();
  const { logoutMutation } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <nav className="fixed top-0 left-0 right-0 z-40 public-navbar-container">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">

          {/* Logo */}
          <Link to={ROUTES.HOME} className="flex items-center gap-2 group">
            <img src={delhiPoliceLogo} alt="Delhi Police Logo" className="w-8 h-8 object-contain" />
            <span className="font-bold text-lg public-navbar-logo tracking-tight font-display">{APP_NAME}</span>
          </Link>

          {/* Desktop Nav */}
          <div className="hidden md:flex items-center gap-1">
            {navLinks.map((link) => (
              <a
                key={link.to}
                href={link.to}
                onClick={(e) => {
                  if (link.to === '#about') {
                    e.preventDefault();
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }
                }}
                className="px-4 py-2 rounded-lg text-sm font-medium public-navbar-link transition-colors"
              >
                {link.label}
              </a>
            ))}
          </div>

          <div className="hidden md:flex items-center gap-3">
            <LanguageToggle variant="pill" />
          </div>

          {/* Mobile Menu Toggle */}
          <button
            className="md:hidden p-2 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
            onClick={() => setMobileOpen((v) => !v)}
            aria-label="Toggle menu"
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      {mobileOpen && (
        <div className="md:hidden border-t border-slate-200 bg-white px-4 py-3 space-y-2 shadow-lg">
          {navLinks.map((link) => (
            <a
              key={link.to}
              href={link.to}
              onClick={(e) => {
                setMobileOpen(false);
                if (link.to === '#about') {
                  e.preventDefault();
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }
              }}
              className="block px-3 py-2 rounded-lg text-sm font-medium text-slate-600 hover:text-[#cca43b] transition-colors"
            >
              {link.label}
            </a>
          ))}
          <div className="pt-2 border-t border-slate-100 flex flex-col gap-2">
            <LanguageToggle variant="pill" className="w-full justify-center" />
          </div>
        </div>
      )}
    </nav>
  );
};
