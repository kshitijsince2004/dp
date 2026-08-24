import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { motion } from 'framer-motion';
import {
  AlertTriangle,
  Lock,
  Eye,
  EyeOff
} from 'lucide-react';
import { loginSchema } from '../../utils/validators.js';
import { useAuth } from '../../hooks/useAuth.js';
import delhiPoliceLogo from '../../assets/delhi_police_logo.png';
import { useNavigate } from 'react-router-dom';
import useAuthStore from '../../store/authStore.js';
import { log } from '../../utils/logger.js';

const QUICK_PROFILES = [
  // badge MUST match a seeded users.badge_no (backend/seeds/01_users.js) — the login POST
  // sends this string straight through. HQ Analyst was "HQ001" (no such badge; the dev alias
  // /neha|hqa001|analyst/ doesn't match "hq001" either) → 401 → bounce-to-login. Fixed to the
  // real seed HQA001, and the two remaining HQ-tier roles added (HQD001 / SA001).
  { badge: "SA001",  abbr: "SYS", role: "System Admin",           name: "System Administrator",  theme: "hq"  },
  { badge: "HQD001", abbr: "ADM", role: "HQ Admin",               name: "Rajiv Ranjan",          theme: "hq"  },
  { badge: "HQA001", abbr: "HQ",  role: "Research Cell",          name: "HQ Analyst",          theme: "hq"  },
  { badge: "DO001",  abbr: "DCP", role: "SO Branch/DCP",       name: "New Delhi District",    theme: "dcp" },
  { badge: "ACP001", abbr: "ACP", role: "ACP Sub Division",     name: "Parliament St Subdiv",  theme: "acp" },
  { badge: "SHO001", abbr: "SHO", role: "SHO",  name: "Parliament St PS",      theme: "sho" },
  { badge: "HC001",  abbr: "HC",  role: "Record Branch/HC",         name: "Parliament St PS",      theme: "hc"  },
];

export default function LoginPage() {
  const [showPassword, setShowPassword] = useState(false);
  const { loginMutation } = useAuth();
  const { isAuthenticated } = useAuthStore();
  const navigate = useNavigate();

  useEffect(() => {
    log.debug('page:mount', { route: '/login' });
    return () => log.debug('page:unmount', { route: '/login' });
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      log.debug('auth:already_authenticated_redirect', { route: '/login', to: '/dashboard' });
      navigate('/dashboard', { replace: true });
    }
  }, [isAuthenticated, navigate]);

  // REDACT: never log passwords — only mutation lifecycle + badge id.
  useEffect(() => {
    if (loginMutation.isSuccess) {
      log.info('auth:login_mutation_success');
    }
  }, [loginMutation.isSuccess]);

  useEffect(() => {
    if (loginMutation.isError) {
      log.error('auth:login_mutation_failed', { err: loginMutation.error });
    }
  }, [loginMutation.isError, loginMutation.error]);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "HC001",
      password: "Test@1234",
    }
  });

  const onSubmit = (data) => {
    log.debug('action:login_submit', { badge: data.email });
    loginMutation.mutate({
      email: data.email,
      password: data.password,
    });
  };

  const handleQuickLogin = (badgeNo) => {
    log.debug('action:quick_login_click', { badge: badgeNo });
    setValue('email', badgeNo);
    setValue('password', 'Test@1234');
    setTimeout(() => {
      loginMutation.mutate({ email: badgeNo, password: "Test@1234" });
    }, 100);
  };
  return (
    <div className="login-split-container">

      {/* Floating Global Header: Top Left of the page */}
      <div className="branding-header">
        <div className="crest-frame">
          <img src={delhiPoliceLogo} alt="Delhi Police Crest" className="branding-crest-img" />
        </div>
        <div className="branding-org">
          <span className="branding-org-name">Delhi Police</span>
          <h2 className="branding-title-sub" style={{ fontSize: '2.5rem', fontWeight: '900', color: 'var(--accent-gold)', marginBottom: '0.25rem' }}>PRISM</h2>
        </div>
      </div>

      {/* ── Left Panel: Branding ── */}
      <div className="login-branding-panel" style={{paddingTop: '120px'}}>
        <div className="branding-hero-center">
          <p className="text-base sm:text-lg font-black text-amber-400 mb-3 tracking-widest uppercase">
            Police Reporting, Intelligence &amp; Statistics Management
          </p>
          <p className="branding-desc">
            PRISM enables single-point data entry, automated report generation, hierarchical approvals, and district-wide analytics.
          </p>
          <div className="branding-features-list">
            <div className="branding-feature-item">
              <span className="branding-feature-dot" />
              <span>Hierarchical 5-Tier Data Integration</span>
            </div>
            <div className="branding-feature-item">
              <span className="branding-feature-dot" />
              <span>Daily Morning Diary Compilation for Districts</span>
            </div>
            <div className="branding-feature-item">
              <span className="branding-feature-dot" />
              <span>Interactive Crime Trend Filtering for Headquarters</span>
            </div>
            <div className="branding-feature-item">
              <span className="branding-feature-dot" />
              <span>Fortnightly Command Report Analytics</span>
            </div>
          </div>
        </div>

        <div className="branding-footer">
          <span className="text-sm font-semibold tracking-wide text-slate-400">Security Level: Command Authorization Required</span>
          <span className="branding-motto text-sm sm:text-base font-black">SHANTI · SEVA · NYAYA</span>
        </div>
      </div>

      {/* ── Right Panel: Full-height structured layout ── */}
      <div className="login-form-panel">

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="login-panel-header"
        >
          <div>
            <h1 className="login-card-title" style={{ textAlign: 'left', fontSize: '1.35rem', marginBottom: 0 }}>
              PRISM Authorization Console
            </h1>
            <p className="login-card-subtitle" style={{ textAlign: 'left', marginTop: '0.2rem' }}>
              Sign in with your official Police ID
            </p>
          </div>
        </motion.div>

        {/* Body: form + divider + quick profiles */}
        <div className="login-panel-body">

          {/* Form column */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.35 }}
            className="login-form-section"
          >
            <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4 w-full">

              <div className="login-form-group">
                <label htmlFor="login-email">Badge No / Official Email</label>
                <input
                  id="login-email"
                  type="text"
                  autoComplete="username"
                  placeholder="HC001 or officer@delhipolice.gov.in"
                  className="login-input-field"
                  {...register('email')}
                />
                {errors.email && <span className="text-xs text-red-400">{errors.email.message}</span>}
              </div>

              <div className="login-form-group">
                <label htmlFor="login-password">Security Key / Password</label>
                <div className="relative">
                  <input
                    id="login-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    placeholder="••••••••"
                    className="login-input-field pr-10"
                    {...register('password')}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors"
                  >
                    {showPassword ? <EyeOff size={14} aria-hidden="true" /> : <Eye size={14} aria-hidden="true" />}
                  </button>
                </div>
                {errors.password && <span className="text-xs text-red-400">{errors.password.message}</span>}
              </div>

              <div className="security-notice-box flex gap-2">
                <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" aria-hidden="true" />
                <span>
                  <strong>Warning:</strong> Authorized official access only. All sessions are monitored, audited, and logged under Section 66 of IT Act, 2000.
                </span>
              </div>

              <button
                id="login-submit"
                type="submit"
                disabled={loginMutation.isPending}
                className="login-btn-primary mt-2"
              >
                <Lock size={14} aria-hidden="true" />
                <span>{loginMutation.isPending ? 'Authorizing Session…' : 'Establish Secure Connection'}</span>
              </button>

            </form>
          </motion.div>

          {/* Vertical divider */}
          <div className="login-panel-divider" />

          {/* Quick profiles sidebar */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.18, duration: 0.35 }}
            className="login-profiles-sidebar"
          >
            <span className="quick-profiles-label">Quick Demo Access</span>
            <div className="login-profiles-list">
              {QUICK_PROFILES.map((p) => (
                <button
                  key={p.badge}
                  type="button"
                  onClick={() => handleQuickLogin(p.badge)}
                  className={`login-profile-row profile-btn-${p.theme}`}
                >
                  <div className="login-profile-avatar" aria-hidden="true">{p.abbr}</div>
                  <div className="login-profile-row-info">
                    <span className="quick-profile-role">{p.role}</span>
                    <span className="quick-profile-name">{p.name}</span>
                  </div>
                </button>
              ))}
            </div>
          </motion.div>

        </div>

        {/* Footer */}
        <footer className="login-panel-footer">
          <p>© {new Date().getFullYear()} Delhi Police (IT Division). NCT of Delhi, India.</p>
          <p className="mt-1 tracking-wide">
            Powered by PRISM (Police Reporting, Intelligence &amp; Statistics Management)
          </p>
        </footer>

      </div>
    </div>
  );
}