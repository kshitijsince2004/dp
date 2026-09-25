import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FileText, Database, ShieldAlert, ArrowRight, ClipboardCheck } from 'lucide-react';
import { Button } from '../../components/ui/Button.jsx';
import { Card } from '../../components/ui/Card.jsx';
import { ROUTES } from '../../utils/constants.js';
import delhiPoliceLogo from '../../assets/delhi_police_logo.png';
import useAuthStore from '../../store/authStore.js';
import commissionerPhoto from '../../assets/commissioner.png';

const features = [
  {
    icon: FileText,
    title: 'Single-Point Data Entry',
    desc: 'Register cases, arrests, PCR dispatches, unidentified bodies, and missing persons under locked, pre-filled local PS configurations.'
  },
  {
    icon: ClipboardCheck,
    title: 'District Morning Diary',
    desc: 'Compile comprehensive summaries of the previous day\'s events, crime tallies, and local dispatches automatically at the DCP tier.'
  },
  {
    icon: Database,
    title: 'Interactive Command Filters',
    desc: 'Query global NCT data logs at the Headquarters tier by crime categories, jurisdictional ranges, status, and custom timeframes.'
  },
  {
    icon: ShieldAlert,
    title: 'Secure Archival Control',
    desc: 'Apply secure legal seals to compiled logs, establishing immutable audit trails compliance under Section 66 of IT Act, 2000.'
  },
];

export default function HomePage() {
  const { isAuthenticated } = useAuthStore();
  const navigate = useNavigate();

  useEffect(() => {
    if (isAuthenticated) {
      navigate(ROUTES.DASHBOARD, { replace: true });
    }
  }, [isAuthenticated, navigate]);
  return (
      <div className="home-page-container">
      {/* Soft atmospheric background */}
      <div className="home-grid-overlay" />
      <div className="home-glow-orb-1" />
      <div className="home-glow-orb-2" />

      {/* Ticker Marquee Banner (Top scrolling ribbon) */}
      <div className="ticker-banner">
        <div className="ticker-text-wrapper">
          <span className="ticker-text">
            <span className="inline-flex items-center gap-3">
              <span className="moto-badge">PRISM Motto</span>
              <span className="font-serif italic font-medium">Create · Compare · Monitor &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; The record of every crime in Delhi</span>
            </span>
            <span className="inline-flex items-center gap-3">
              <span className="moto-badge">PRISM Motto</span>
              <span className="font-serif italic font-medium">Create · Compare · Monitor &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; The record of every crime in Delhi</span>
            </span>
            <span className="inline-flex items-center gap-3">
              <span className="moto-badge">PRISM Motto</span>
              <span className="font-serif italic font-medium">Create · Compare · Monitor &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; The record of every crime in Delhi</span>
            </span>
          </span>
        </div>
      </div>

      {/* Hero Section */}
      <section className="relative overflow-hidden border-b border-slate-200/60 z-10 min-h-[640px]">
        <div className="relative max-w-full mx-0 grid grid-cols-1 lg:grid-cols-12 gap-0 items-stretch min-h-[640px]">

          {/* Left: Commissioner Portrait Panel */}
          <div className="lg:col-span-4 flex flex-col relative z-20 p-6 lg:p-8 lg:pr-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
              className="relative bg-white shadow-2xl shadow-slate-900/15 w-full h-full rounded-[2.5rem] border-2 border-slate-200 overflow-hidden flex flex-col justify-between"
            >
              <div className="w-full flex-1 relative overflow-hidden bg-slate-100 flex items-center justify-center min-h-[420px]">
                <img
                  src={commissionerPhoto}
                  alt="Sardar Vallabhbhai Patel"
                  className="w-full h-full object-cover object-top"
                />
              </div>
              <div className="py-5 px-4 text-center bg-white border-t-2 border-slate-100 flex-shrink-0">
                <h3 className="text-heading-s font-bold text-[var(--primary)] font-display tracking-tight">Sardar Vallabhbhai Patel</h3>
                <p className="text-xs sm:text-sm text-[var(--accent-gold)] font-bold tracking-widest uppercase mt-1">First Home Minister of India</p>
              </div>
            </motion.div>
          </div>

          {/* Right: Redesigned Copy Details */}
          <div className="lg:col-span-8 flex flex-col items-center lg:items-start text-center lg:text-left relative z-20 py-8 lg:py-12 px-8 lg:pl-10 lg:pr-14 justify-center">
            <motion.div
              initial={{ opacity: 0, y: 25 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
              className="flex flex-col items-center lg:items-start w-full"
            >
              {/* Header Container: Delhi Police Badge & Login Button Parallel */}
              <div className="w-full flex flex-col sm:flex-row sm:items-center justify-between gap-6 mb-8">
                <div className="prism-brand flex-shrink-0 py-3 px-6 flex items-center gap-4">
                  <img
                    src={delhiPoliceLogo}
                    alt="Delhi Police emblem"
                    className="w-14 h-14 object-contain"
                  />
                  <div className="hologram-text-block">
                    <span className="hologram-title text-3xl font-bold tracking-wide">PRISM</span>
                    <div className="hologram-line" />
                    <span className="text-sm font-bold text-slate-800 leading-snug uppercase tracking-wider">
                      Police Reporting, Intelligence &amp; Statistics Management
                    </span>
                  </div>
                </div>

                <div className="flex-shrink-0">
                  <Button
                    size="lg"
                    as={Link}
                    to={ROUTES.LOGIN}
                    className="w-full sm:w-auto text-lg px-10 py-4 shadow-md hover:shadow-lg transition-all duration-200 font-bold rounded-2xl"
                  >
                    Login Securely
                    <ArrowRight className="w-6 h-6 ml-2.5" />
                  </Button>
                </div>
              </div>

              {/* Operational Capabilities Section inside Right Panel */}
              <div className="w-full text-left">
                <div className="mb-5">
                  <h2 className="text-heading-m sm:text-3xl font-bold mb-1.5 tracking-tight font-display text-[var(--primary)] home-section-title">
                    Operational Capabilities
                  </h2>
                  <p className="text-slate-600 text-body-m sm:text-body-l font-normal">
                    Key integrated modules of the PRISM secure enterprise ecosystem
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 w-full">
                  {features.map(({ icon: Icon, title, desc }, i) => (
                    <motion.div
                      key={title}
                      initial={{ opacity: 0, y: 15 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.1, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                    >
                      <Card className="home-card-premium p-6 sm:p-7 flex gap-5 h-full items-start rounded-3xl border-2 border-slate-200 shadow-md hover:shadow-xl transition-all">
                        <div className="p-4 rounded-2xl bg-[var(--accent-gold)]/15 border border-[var(--accent-gold)]/30 text-[var(--accent-gold)] h-fit flex-shrink-0 shadow-sm">
                          <Icon className="w-8 h-8 animate-pulse" style={{ animationDuration: '4s' }} />
                        </div>
                        <div>
                          <h3 className="text-body-l sm:text-heading-s font-bold text-[var(--primary)] mb-1.5 font-display tracking-tight leading-snug">{title}</h3>
                          <p className="text-sm sm:text-body-m text-slate-600 leading-relaxed font-normal">{desc}</p>
                        </div>
                      </Card>
                    </motion.div>
                  ))}
                </div>
              </div>

            </motion.div>
          </div>

        </div>
      </section>


    </div>
  );
}
