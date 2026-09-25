import { Link } from 'react-router-dom';
import { Shield } from 'lucide-react';
import { APP_NAME } from '../../utils/constants.js';
import delhiPoliceLogo from '../../assets/delhi_police_logo.png';

export const Footer = () => (
  <footer className="public-footer-container py-12">
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-8">

        {/* Brand */}
        <div className="col-span-1 md:col-span-2 flex flex-col gap-3">
          <div className="flex items-center gap-2 mb-1">
            <img src={delhiPoliceLogo} alt="Delhi Police Logo" className="w-7 h-7 object-contain" />
            <span className="font-bold text-lg public-footer-title tracking-wider">{APP_NAME}</span>
          </div>
          <p className="text-sm public-footer-text max-w-sm leading-relaxed">
            Police Reporting, Intelligence & Statistics Management (PRISM) is an internal secure command portal operated by the IT Division, Delhi Police.
          </p>
          <div id="security" className="text-xs text-red-700 border border-red-200 bg-red-50 p-3 rounded-lg max-w-sm mt-2">
            <strong>Security Alert:</strong> Access is restricted strictly to authorized personnel of the Delhi Police. All session activities are monitored under Section 66 of IT Act, 2000.
          </div>
        </div>

        {/* Column 1: Helplines */}
        <div id="helplines">
          <h3 className="text-sm font-semibold public-footer-title mb-3 uppercase tracking-wider">Emergency Helplines</h3>
          <ul className="space-y-1.5 text-sm public-footer-text">
            <li>National Emergency Support: <strong className="text-[#cca43b]">112</strong></li>
            <li>Police Control Room: <strong className="text-[#cca43b]">100</strong></li>
            <li>Women Helpline: <strong className="text-[#cca43b]">1091</strong></li>
            <li>Special Anti-Harassment: <strong className="text-[#cca43b]">1096</strong></li>
          </ul>
        </div>

        {/* Column 2: Government Links */}
        <div>
          <h3 className="text-sm font-semibold public-footer-title mb-3 uppercase tracking-wider">Agency Portals</h3>
          <ul className="space-y-2 text-sm">
            <li>
              <a href="https://delhipolice.gov.in" target="_blank" rel="noreferrer" className="public-footer-link hover:text-[#cca43b] transition-colors">
                Delhi Police Official
              </a>
            </li>
            <li>
              <a href="https://mha.gov.in" target="_blank" rel="noreferrer" className="public-footer-link hover:text-[#cca43b] transition-colors">
                Ministry of Home Affairs
              </a>
            </li>
            <li>
              <a href="https://ncrb.gov.in" target="_blank" rel="noreferrer" className="public-footer-link hover:text-[#cca43b] transition-colors">
                NCRB India Portal
              </a>
            </li>
          </ul>
        </div>
      </div>

      <div className="mt-8 pt-8 border-t border-slate-200 text-center text-sm md:text-base public-footer-text font-semibold">
        <p>© {new Date().getFullYear()} Delhi Police, IT Division. Government of NCT of Delhi.</p>
        <p className="mt-1.5 text-slate-600 font-medium">Protected by national cyber law regulations. Unauthorized intrusion is subject to prosecution.</p>
      </div>
    </div>
  </footer>
);
