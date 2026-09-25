import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { motion } from 'framer-motion';
import {
  AlertTriangle,
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
      {/* ── Left: Branding + photography ── */}
      <div className="login-branding-panel">
        <div className="branding-header">
          <img src={delhiPoliceLogo} alt="Delhi Police Crest" className="branding-crest-img" />
          <div className="branding-org">
            <span className="branding-org-name">Delhi Police</span>
            <h2 className="branding-title-sub">PRISM</h2>
          </div>
        </div>

        <div className="branding-hero-center">
          <p className="branding-eyebrow">
            Police Reporting, Intelligence &amp; Statistics Management
          </p>
          <h1 className="branding-headline">
            Operational Intelligence<br />for a Safer Delhi
          </h1>
          <p className="branding-desc">
            PRISM enables single-point data entry, automated report generation, hierarchical approvals, and district-wide analytics.
          </p>
        </div>

        <div className="branding-footer">
          <span className="branding-motto">SHANTI · SEVA · NYAYA</span>
        </div>
      </div>

      {/* ── Right: Authorization panel ── */}
      <div className="login-form-panel">
        <div className="login-form-panel-inner">
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="login-panel-header"
          >
            <h1 className="login-card-title">PRISM Authorization Console</h1>
            <p className="login-card-subtitle">Sign in with your official Police ID</p>
          </motion.div>

          <div className="login-panel-body">
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.08, duration: 0.3 }}
              className="login-form-section"
            >
              <form onSubmit={handleSubmit(onSubmit)} className="login-form">
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
                  {errors.email && <span className="login-field-error">{errors.email.message}</span>}
                </div>

                <div className="login-form-group">
                  <label htmlFor="login-password">Security Key / Password</label>
                  <div className="login-password-wrap">
                    <input
                      id="login-password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      placeholder="••••••••"
                      className="login-input-field login-input-with-icon"
                      {...register('password')}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      className="login-password-toggle"
                    >
                      {showPassword ? <EyeOff size={14} aria-hidden="true" /> : <Eye size={14} aria-hidden="true" />}
                    </button>
                  </div>
                  {errors.password && <span className="login-field-error">{errors.password.message}</span>}
                </div>

                <div className="security-notice-box">
                  <AlertTriangle size={12} className="security-notice-icon" aria-hidden="true" />
                  <span>
                    <strong>Warning:</strong> Authorized official access only. All sessions are monitored, audited, and logged under Section 66 of IT Act, 2000.
                  </span>
                </div>

                <button
                  id="login-submit"
                  type="submit"
                  disabled={loginMutation.isPending}
                  className="login-btn-primary"
                >
                  {loginMutation.isPending ? 'Authorizing Session…' : 'Establish Secure Connection'}
                </button>
              </form>
            </motion.div>

            <div className="login-or-separator" aria-hidden="true">
              <span>or</span>
            </div>

            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.14, duration: 0.3 }}
              className="login-profiles-sidebar"
            >
              <span className="quick-profiles-label">Quick Demo Access</span>
              <div className="login-profiles-list">
                {QUICK_PROFILES.map((p) => (
                  <button
                    key={p.badge}
                    type="button"
                    onClick={() => handleQuickLogin(p.badge)}
                    className="login-profile-row"
                  >
                    <span className="quick-profile-role">{p.role}</span>
                    <span className="quick-profile-name">{p.name}</span>
                  </button>
                ))}
              </div>
            </motion.div>
          </div>

          <footer className="login-panel-footer">
            <p>© {new Date().getFullYear()} Delhi Police (IT Division). NCT of Delhi, India.</p>
            <p className="login-panel-footer-sub">
              Powered by PRISM (Police Reporting, Intelligence &amp; Statistics Management)
            </p>
          </footer>
        </div>
      </div>
    </div>
  );
}
