import { useState } from "react";
import { NavLink } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Shield,
  FileText,
  UserX,
  PhoneCall,
  Fingerprint,
  Search,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  BarChart3,
  FileSpreadsheet,
  Users,
  Network,
  Settings,
  Building,
  ShieldAlert,
  FileSignature,
  Layers,
  Upload,
} from "lucide-react";
import delhiPoliceLogo from "../../assets/delhi_police_logo.png";
import useAuthStore from "../../store/authStore.js";

export default function PoliceSidebar({ isCollapsed, setIsCollapsed }) {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const [expandedSubmenu, setExpandedSubmenu] = useState(null);

  const role = user?.role || 'PS';

  // Build navigation items based on active authorization role
  const getNavItems = () => {
    const items = [];

    // ── Head Constable (HC / PS) Desk ──────────────────────────────────────────
    if (role === 'PS' || role === 'HC') {
      items.push(
        { id: "records",      label: t('nav.records',         'My Records'),               icon: ClipboardList, to: "/records" },
        { id: "bulk-import",  label: t('nav.bulkImport',      'Bulk Import'),              icon: Upload,        to: "/admin/legacy" },
        { id: "new-case",     label: t('recordTypes.CASE',    'Cases (FIR) Master'),       icon: FileText,      to: "/records/new/CASE" },
        { id: "new-arrest",   label: t('recordTypes.ARREST',  'Arrest Person Master'),     icon: UserX,         to: "/records/new/ARREST" },
        { id: "new-pcr",      label: t('recordTypes.PCR_CALL','PCR'),      icon: PhoneCall,     to: "/records/new/PCR_CALL" },
        { id: "new-missing",  label: t('recordTypes.MISSING', 'Missing Persons Register'), icon: Search,        to: "/records/new/MISSING" },
        { id: "new-uidb",     label: t('recordTypes.UIDB',    'UIDB Unidentified Bodies'), icon: Fingerprint,   to: "/records/new/UIDB" },
        { id: "compile",      label: t('nav.compile',         'Compile Records'),          icon: FileSpreadsheet, to: "/compile" },
      );
    }

    // ── Reviewer / SHO Desk ───────────────────────────────────────────────────
    if (role === 'SHO') {
      items.push(
        { id: "analytics",     label: t('nav.analytics',    'Analytics Console'), icon: BarChart3,    to: "/analytics" },
        { id: "queue",         label: t('nav.queue',        'Approval Desk'),     icon: ClipboardList, to: "/queue" },
        { id: "compile",       label: t('nav.compile',      'Compile Records'),   icon: FileSpreadsheet, to: "/compile" },
        { id: "person-search", label: t('nav.personSearch', 'Person Search'),     icon: Search,       to: "/person-search" }
      );
    }

    // ── Assistant Commissioner of Police (ACP) Desk ──────────────────────────
    if (role === 'ACP') {
      items.push(
        { id: "queue",         label: t('nav.queue',        'Approval Desk'),     icon: ClipboardList, to: "/queue" },
        { id: "station-wise",  label: t('nav.stationWise',  'Station Wise View'), icon: Building,      to: "/district/stations" },
        { id: "analytics",     label: t('nav.analytics',    'Analytics Console'), icon: BarChart3,     to: "/analytics" },
        { id: "reports",       label: t('nav.reports',      'Excel Export Manager'), icon: FileSpreadsheet, to: "/reports" },
        { id: "person-search", label: t('nav.personSearch', 'Person Search'),     icon: Search,        to: "/person-search" }
      );
    }

    // ── District DCP Desk ─────────────────────────────────────────────────────
    if (role === 'DISTRICT' || role === 'DISTRICT_OFFICER') {
      items.push(
        { id: "district", label: t('nav.district', 'District View'), icon: Shield, to: "/district" },
        { id: "station-wise", label: t('nav.stationWise', 'Station Wise View'), icon: Building, to: "/district/stations" },
        { id: "queue", label: t('nav.queue', 'Approval Desk'), icon: ClipboardList, to: "/queue" },
        { id: "compile", label: t('nav.compile', 'Compile Records'), icon: FileSpreadsheet, to: "/compile" },
        { id: "analytics", label: t('nav.analytics', 'Analytics Console'), icon: BarChart3, to: "/analytics" },
        { id: "reports",        label: t('nav.reports',       'Excel Export Manager'),    icon: FileSpreadsheet, to: "/reports" },
        { id: "person-search",  label: t('nav.personSearch',  'Person Search'),            icon: Search,          to: "/person-search" },
        { id: "custom-fields",  label: t('nav.customFields',  'District Custom Fields'),   icon: Layers,          to: "/district/custom-fields" },
        { id: "bulk-import",    label: t('nav.bulkImport',    'Bulk Import'),             icon: Upload,          to: "/admin/legacy" }
      );
    }

    // ── HQ Analyst Desk ───────────────────────────────────────────────────────
    if (role === 'HQ' || role === 'HQ_ANALYST' || role === 'HQ_ADMIN') {
      items.push(
        { id: "hq", label: t('nav.hq', 'Command Center'), icon: Building, to: "/hq" },
        { id: "station-wise", label: t('nav.stationWise', 'Station Wise View'), icon: Building, to: "/hq/stations" },
        { id: "compile", label: t('nav.compile', 'Compile Records'), icon: FileSpreadsheet, to: "/compile" },
        { id: "analytics", label: t('nav.analytics', 'Analytics Console'), icon: BarChart3, to: "/analytics" },
        { id: "reports",       label: t('nav.reports',      'Excel Export Manager'), icon: FileSpreadsheet, to: "/reports" },
        { id: "person-search", label: t('nav.personSearch', 'Person Search'),         icon: Search,          to: "/person-search" },
        { id: "bulk-import",   label: t('nav.bulkImport',   'Bulk Import'),           icon: Upload,          to: "/admin/legacy" }
      );
    }

    // ── Platform System Administrator ─────────────────────────────────────────
    if (role === 'SYSTEM_ADMIN') {
      items.push(
        { id: "admin-users",           label: t('nav.adminUsers',         'Users Register'),    icon: Users,         to: "/admin/users" },
        { id: "admin-hierarchy",       label: t('nav.adminHierarchy',     'Hierarchy Config'),  icon: Network,       to: "/admin/hierarchy" },
        { id: "admin-fields",          label: t('nav.adminFields',        'Field Registry'),    icon: Settings,      to: "/admin/fields" },
        { id: "admin-audit",           label: t('nav.adminAudit',         'Audit Ledger'),      icon: ShieldAlert,   to: "/admin/audit" },
        { id: "admin-level-contracts", label: t('nav.levelContracts',     'Level Contracts'),   icon: FileSignature, to: "/admin/level-contracts" },
        { id: "bulk-import",          label: t('nav.bulkImport',         'Bulk Import'),       icon: Upload,        to: "/admin/legacy" }
      );
    }

    return items;
  };

  const navItems = getNavItems();

  const handleNavClick = (itemId, hasSubItems) => {
    if (isCollapsed) {
      setIsCollapsed(false);
    }
    if (hasSubItems) {
      setExpandedSubmenu(expandedSubmenu === itemId ? null : itemId);
    }
  };

  const toggleSidebar = () => {
    setIsCollapsed(!isCollapsed);
    if (!isCollapsed) {
      setExpandedSubmenu(null);
    }
  };

  const getRoleThemeClass = () => {
    switch (role) {
      case 'PS':
      case 'HC':
        return 'theme-hc';
      case 'SHO':
        return 'theme-sho';
      case 'ACP':
        return 'theme-acp';
      case 'DISTRICT':
      case 'DISTRICT_OFFICER':
        return 'theme-district';
      case 'HQ':
      case 'HQ_ANALYST':
      case 'HQ_ADMIN':
        return 'theme-hq';
      case 'SYSTEM_ADMIN':
        return 'theme-admin';
      default:
        return 'theme-hq';
    }
  };

  return (
    <aside 
      className={`sidebar-nav ${isCollapsed ? "collapsed" : "expanded"} ${getRoleThemeClass()}`}
      aria-label="Primary Navigation"
      onMouseEnter={() => setIsCollapsed(false)}
      onMouseLeave={() => {
        setIsCollapsed(true);
        setExpandedSubmenu(null);
      }}
    >
      <div className="sidebar-header">
        <div className="emblem-container">
          <img 
            src={delhiPoliceLogo} 
            alt="Delhi Police emblem" 
            className="w-8 h-8 object-contain flex-shrink-0" 
            style={{ filter: "drop-shadow(0px 2px 4px rgba(0, 0, 0, 0.15))" }}
          />
          {!isCollapsed && (
            <div className="brand-text">
              <span className="brand-main">PRISM</span>
              <span className="brand-sub" style={{ fontSize: "0.6rem" }}>DELHI POLICE</span>
            </div>
          )}
        </div>
      </div>

      <nav className="sidebar-menu">
        {navItems.map((item) => {
          const Icon = item.icon;
          const hasSubItems = !!item.subItems;
          const isSubmenuExpanded = expandedSubmenu === item.id && !isCollapsed;

          return (
            <div key={item.id} className="menu-item-group">
              {hasSubItems ? (
                <button
                  type="button"
                  className="menu-link"
                  onClick={() => handleNavClick(item.id, hasSubItems)}
                  aria-expanded={isSubmenuExpanded}
                  aria-label={`${item.label} navigation`}
                >
                  <div className="menu-link-left">
                    <Icon className="menu-icon" size={20} aria-hidden="true" />
                    {!isCollapsed && <span className="menu-text">{item.label}</span>}
                  </div>
                  {!isCollapsed && (
                    <span className={`submenu-indicator ${isSubmenuExpanded ? "open" : ""}`} aria-hidden="true">
                      ▼
                    </span>
                  )}
                </button>
              ) : (
                <NavLink
                  to={item.to}
                  end
                  className={({ isActive }) => `menu-link ${isActive ? "active" : ""}`}
                  aria-label={`${item.label} navigation`}
                >
                  <div className="menu-link-left">
                    <Icon className="menu-icon" size={20} aria-hidden="true" />
                    {!isCollapsed && <span className="menu-text">{item.label}</span>}
                  </div>
                </NavLink>
              )}

              {hasSubItems && isSubmenuExpanded && (
                <div className="submenu-list" role="menu">
                  {item.subItems.map((subItem) => {
                    return (
                      <NavLink
                        key={subItem.id}
                        to={subItem.to}
                        role="menuitem"
                        className={({ isActive }) => `submenu-link ${isActive ? "active" : ""}`}
                        aria-label={subItem.label}
                      >
                        <span className="submenu-text">{subItem.label}</span>
                      </NavLink>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      <div className="sidebar-footer">
        <button
          type="button"
          className="collapse-btn"
          onClick={toggleSidebar}
          aria-label={isCollapsed ? "Expand sidebar navigation" : "Collapse sidebar navigation"}
        >
          {isCollapsed ? (
            <ChevronRight size={18} aria-hidden="true" />
          ) : (
            <div className="collapse-btn-content">
              <ChevronLeft size={18} aria-hidden="true" />
              <span>Collapse Sidebar</span>
            </div>
          )}
        </button>
      </div>
    </aside>
  );
}
