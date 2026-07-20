import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Shield, FileText, Database, ShieldAlert, Cpu, ArrowRight, ClipboardCheck } from 'lucide-react';
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
      {/* Animated digital canvas background */}
      <div className="home-grid-overlay" />
      <div className="home-glow-orb-1" />
      <div className="home-glow-orb-2" />
      <div className="home-glow-orb-3" />
      <div className="tech-scanline" />

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
      <section className="relative overflow-hidden border-b border-slate-200/60 z-10 min-h-[600px]">
        <div className="relative max-w-full mx-0 grid grid-cols-1 lg:grid-cols-12 gap-0 items-stretch min-h-[600px]">

          {/* Left: Commissioner Portrait Panel - elegant curved floating card */}
          <div className="lg:col-span-4 flex flex-col relative z-20 p-6 lg:p-8 lg:pr-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
              className="relative bg-[#cca43b] shadow-2xl shadow-[#cca43b] w-full h-full rounded-[2rem] border border-slate-200/50 overflow-hidden flex flex-col"
            >
              <img
                src={commissionerPhoto}
                alt="Sardar Vallabhbhai Patel"
                className="w-full flex-1 object-cover object-center"
                style={{ minHeight: '450px' }}
              />
              <div className="py-4 px-3 text-center bg-[#cca43b] border-t border-slate-100 flex-shrink-0">
                {/* <span className="text-xs font-black uppercase text-[#cca43b] tracking-wider block">MESSAGE FROM</span> */}
                <h3 className="text-base font-extrabold text-white mt-0.5 font-display">Sardar Vallabhbhai Patel</h3>
                <p className="text-[10px] text-white font-bold tracking-wide uppercase mt-0.5">First Home Minister of India</p>
              </div>
            </motion.div>
          </div>

          {/* Right: Redesigned Copy Details */}
          <div className="lg:col-span-8 flex flex-col items-center lg:items-start text-center lg:text-left relative z-20 py-10 lg:py-16 px-8 lg:pl-10 lg:pr-16">
            <motion.div
              initial={{ opacity: 0, y: 25 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
              className="flex flex-col items-center lg:items-start w-full"
            >
              {/* Header Container: Delhi Police Badge & Login Button Parallel */}
              <div className="w-full flex flex-col sm:flex-row sm:items-center justify-between gap-6 mb-8 mt-2">
                <div className="prism-hologram flex-shrink-0">
                  <img
                    src={delhiPoliceLogo}
                    alt="Delhi Police emblem"
                    className="hologram-crest"
                  />
                  <div className="hologram-text-block">
                    <span className="hologram-title glow-text">PRISM</span>
                    <div className="hologram-line" />
                    <span className="text-sm font-bold">Police Report Intelligence & Statistic Management System</span>
                  </div>
                </div>

                <div className="flex-shrink-0">
                  <Button
                    size="lg"
                    as={Link}
                    to={ROUTES.LOGIN}
                    className="w-full sm:w-auto shadow-xl shadow-[#cca43b]/10 hover:shadow-[#cca43b]/20 hover:scale-[1.02] transition-all duration-200 font-semibold"
                  >
                    Login Securely
                    <ArrowRight className="w-5 h-5 ml-1" />
                  </Button>
                </div>
              </div>

              {/* Operational Capabilities Section inside Right Panel */}
              <div className="w-full mt-4 text-left">
                <div className="mb-6">
                  <h2 className="text-2xl md:text-3xl font-extrabold mb-1 tracking-tight font-display text-[#0d2a4a] home-section-title">
                    Operational Capabilities
                  </h2>
                  <p className="text-slate-600 text-xs md:text-sm font-light">
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
                      <Card className="home-card-premium p-5 flex gap-4 h-full items-start">
                        <div className="p-2.5 rounded-xl bg-[#cca43b]/10 border border-[#cca43b]/20 text-[#cca43b] h-fit flex-shrink-0 shadow-lg shadow-[#cca43b]/5">
                          <Icon className="w-5 h-5 animate-pulse" style={{ animationDuration: '4s' }} />
                        </div>
                        <div>
                          <h3 className="text-sm font-bold text-slate-900 mb-1 font-display tracking-wide">{title}</h3>
                          <p className="text-xs text-slate-600 leading-relaxed font-light">{desc}</p>
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
