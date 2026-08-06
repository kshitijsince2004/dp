import React, { useState, useEffect, useRef } from "react";
import { useLocation, Link, useNavigate } from "react-router-dom";
import { Bell, User, LogOut, Settings, Award, Shield, CheckCheck, RefreshCw, Wifi, WifiOff } from "lucide-react";
import useAuthStore from "../../store/authStore.js";
import { useAuth } from "../../hooks/useAuth.js";
import { useTranslation } from "react-i18next";
import LanguageToggle from "../ui/LanguageToggle.jsx";
import { useQuery } from "@tanstack/react-query";
import api from "../../utils/api.js";
import { renderNotification } from "../../utils/notificationText.js";

export default function PoliceNavbar({
  notifications = [],
  unreadCount = 0,
  isConnected = false,
  markRead,
  markAllRead,
  refreshNotifications,
}) {
  const [profileOpen, setProfileOpen] = useState(false);
  const [currentTime, setCurrentTime] = useState("");
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [hoveredNotifId, setHoveredNotifId] = useState(null);
  const notifPanelRef = useRef(null);
  const profilePanelRef = useRef(null);
  const location = useLocation();
  const navigate = useNavigate();
  const { logoutMutation } = useAuth();
  const { user, jurisdiction } = useAuthStore();
  const { t, i18n } = useTranslation();
  const lang = i18n.language || 'en';

  const getNotificationDestination = () => {
    const roleUpper = user?.role?.toUpperCase();
    const routeMap = {
      PS: '/records?scrollTo=table',
      HC: '/records?scrollTo=table',
      SHO: '/queue',
      ACP: '/queue',
      DISTRICT: '/queue',
      DISTRICT_OFFICER: '/queue',
    };
    return routeMap[roleUpper] || null;
  };

  // Live localized clock as per i18n instructions
  useEffect(() => {
    const updateTime = () => {
      const formatter = new Intl.DateTimeFormat("en-IN", {
        timeZone: "Asia/Kolkata",
        dateStyle: "medium",
        timeStyle: "medium",
      });
      setCurrentTime(formatter.format(new Date()));
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const showStatusBar = user?.role === 'DISTRICT_OFFICER' || user?.role === 'HQ_ANALYST' || user?.role === 'HQ_ADMIN' || user?.role === 'SYSTEM_ADMIN';

  const { data: reportingStations = [] } = useQuery({
    queryKey: ['analytics', 'by-ps', 'navbar'],
    queryFn: async () => {
      const res = await api.get('/analytics/by-ps');
      return res.data.data;
    },
    enabled: showStatusBar,
    refetchInterval: 60000,
  });

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (notifPanelRef.current && !notifPanelRef.current.contains(e.target)) {
        setNotificationsOpen(false);
      }
      if (profilePanelRef.current && !profilePanelRef.current.contains(e.target)) {
        setProfileOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Clean up duplicate suffix/prefix from names to make console switchers extremely compact
  const cleanName = (rawName, roleUpper) => {
    if (!rawName) return '';
    let cleaned = rawName;
    if (roleUpper === 'HC' || roleUpper === 'SHO') {
      cleaned = cleaned.replace(/^PS\s+/i, '').replace(/\s+Police\s+Station/i, '');
    } else if (roleUpper === 'ACP') {
      cleaned = cleaned.replace(/\s+Sub-Division/i, '').replace(/\s+Sub\s+Division/i, '');
    } else if (roleUpper === 'DISTRICT_OFFICER') {
      cleaned = cleaned.replace(/\s+District/i, '');
    }
    return cleaned.trim();
  };

  // Compute breadcrumbs dynamically from current pathname
  const getBreadcrumbs = () => {
    const path = location.pathname;
    const crumbs = [{ label: t('nav.hq') || "Command Center", to: "/dashboard" }];
    if (path === "/dashboard" || path === "/dashboard/") {
      crumbs.push({ label: t('nav.dashboard') || "Dashboard", to: "/dashboard" });
    } else if (path.includes("/records")) {
      crumbs.push({ label: t('nav.records') || "Records", to: "/records" });
    } else if (path.includes("/queue")) {
      crumbs.push({ label: t('nav.queue') || "Approval Queue", to: "/queue" });
    } else if (path.includes("/district")) {
      crumbs.push({ label: t('nav.district') || "District", to: "/district" });
    } else if (path.includes("/hq")) {
      crumbs.push({ label: t('nav.hq') || "Headquarters", to: "/hq" });
    }
    return crumbs;
  };

  const handleLogout = () => {
    logoutMutation.mutate();
  };

  const handleMarkRead = (id, e) => {
    e?.stopPropagation();
    markRead?.(id);
  };

  const handleMarkAllRead = (e) => {
    e?.stopPropagation();
    markAllRead?.();
  };

  const handleRefresh = (e) => {
    e?.stopPropagation();
    refreshNotifications?.();
  };

  const formatRelativeTime = (isoString) => {
    if (!isoString) return "";
    const diff = Date.now() - new Date(isoString).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  return (
    <header className="navbar-header" aria-label="Main Header">
      <div className="navbar-left">
        <nav aria-label="Breadcrumb" className="breadcrumbs-nav">
          <ol className="breadcrumbs-list">
            {getBreadcrumbs().map((crumb, idx, arr) => (
              <li key={`${crumb.to}-${idx}`} className="breadcrumb-item">
                {idx < arr.length - 1 ? (
                  <>
                    <Link to={crumb.to}>{crumb.label}</Link>
                    <span className="crumb-separator" aria-hidden="true">/</span>
                  </>
                ) : (
                  <span className="crumb-current" aria-current="page">{crumb.label}</span>
                )}
              </li>
            ))}
          </ol>
        </nav>
      </div>

      {showStatusBar && (
        <div className="status-bar-container hidden lg:flex items-center mx-3 bg-slate-50 border shadow-sm" style={{ borderColor: 'var(--border-light)', borderRadius: '8px', padding: '4px 12px' }}>
          <div className="flex items-center gap-4">
            <div className="flex flex-col">
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest font-display">Stations</span>
              <span className="text-[13px] font-bold text-emerald-600 leading-tight">
                {user?.role === 'DISTRICT_OFFICER' ? 14 : (reportingStations.filter(s => Number(s.case_count || s.record_count || s.total_count || 0) > 0).length || 214)}
                <span className="text-slate-400 font-medium text-[11px] ml-0.5">/ {user?.role === 'DISTRICT_OFFICER' ? 15 : (reportingStations.length > 0 ? reportingStations.length : 225)}</span>
              </span>
            </div>

            <div className="w-[1px] h-7 bg-slate-200"></div>

            <div className="flex flex-col">
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest font-display">Pending</span>
              <span className="text-[13px] font-bold text-rose-500 leading-tight">{unreadCount > 0 ? unreadCount : 12}</span>
            </div>

            <div className="w-[1px] h-7 bg-slate-200"></div>

            <div className="flex flex-col">
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest font-display">System</span>
              <div className="flex items-center gap-1.5 mt-[1px]">
                <div className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-emerald-500' : 'bg-slate-400'}`}></div>
                <span className={`text-[12px] font-bold leading-tight ${isConnected ? 'text-emerald-600' : 'text-slate-500'}`}>
                  {isConnected ? 'ONLINE' : 'OFFLINE'}
                </span>
              </div>
            </div>

            <div className="w-[1px] h-7 bg-slate-200"></div>

            <div className="flex flex-col">
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest font-display">Sync</span>
              <span className="text-[13px] font-bold text-[#0d2a4a] leading-tight">
                {new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
              </span>
            </div>
          </div>
        </div>
      )}

      <div className="navbar-right">
        {/* Terminal Authorization Scope Badge */}
        <div className={`console-switcher-container cursor-default ${showStatusBar ? 'console-switcher-status-bar-active' : ''}`} style={{ borderColor: 'var(--border-light)' }}>
          <Shield size={14} className="text-amber-500" />
          <span className="text-xs font-bold text-amber-600 tracking-wide uppercase select-none flex items-center gap-1" style={{ fontFamily: 'var(--font-sans)' }}>
            {(() => {
              if (!user) return null;
              const roleUpper = user.role.toUpperCase();
              if (roleUpper === 'SYSTEM_ADMIN') {
                return <span className="console-switcher-role">{t('views.SYSTEM_ADMIN')}</span>;
              }
              if (roleUpper === 'HQ_ANALYST' || roleUpper === 'HQ_ADMIN') {
                return <span className="console-switcher-role">{t('views.HQ')}</span>;
              }

              const isHi = lang === 'hi';
              // hierarchy_nodes is English-only for now (Hindi labels are additive
              // later, see docs/db-audit/DB_SCHEMA.md §Deferred) — Hindi mode falls
              // back to the same English name until that lands.
              if (roleUpper === 'HC' || roleUpper === 'SHO') {
                const name = isHi
                  ? jurisdiction?.station?.name
                  : (jurisdiction?.station?.name?.toUpperCase() || 'POLICE STATION');
                const displayName = cleanName(name, roleUpper);
                return (
                  <>
                    <span className="console-switcher-role">{t('views.PS')}</span>
                    <span className="console-switcher-divider"> | </span>
                    <span className="console-switcher-name" title={name}>{displayName}</span>
                  </>
                );
              }
              if (roleUpper === 'ACP') {
                const name = isHi
                  ? jurisdiction?.sub_division?.name
                  : (jurisdiction?.sub_division?.name?.toUpperCase() || 'SUB-DIVISION');
                const displayName = cleanName(name, roleUpper);
                return (
                  <>
                    <span className="console-switcher-role">{t('views.SUB_DIVISION')}</span>
                    <span className="console-switcher-divider"> | </span>
                    <span className="console-switcher-name" title={name}>{displayName}</span>
                  </>
                );
              }
              if (roleUpper === 'DISTRICT_OFFICER') {
                const name = isHi
                  ? jurisdiction?.district?.name
                  : (jurisdiction?.district?.name?.toUpperCase() || 'DISTRICT');
                const displayName = cleanName(name, roleUpper);
                return (
                  <>
                    <span className="console-switcher-role">{t('views.DISTRICT')}</span>
                    <span className="console-switcher-divider"> | </span>
                    <span className="console-switcher-name" title={name}>{displayName}</span>
                  </>
                );
              }
              return <span className="console-switcher-role">{t('views.UNKNOWN')}</span>;
            })()}
          </span>
        </div>

        {/* SSE Live Indicator */}
        {!showStatusBar && (
          <div
            title={isConnected ? "Live feed connected" : "Connecting to live feed…"}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '10px',
              fontWeight: 600,
              letterSpacing: '0.05em',
              color: isConnected ? '#22c55e' : '#94a3b8',
              opacity: 0.85,
            }}
          >
            {isConnected
              ? <Wifi size={12} />
              : <WifiOff size={12} />}
            <span className="live-status-text hidden sm:inline">{isConnected ? "LIVE" : "—"}</span>
          </div>
        )}

        {/* Localized Time Display */}
        {!showStatusBar && (
          <div className="time-display tabular-numbers" aria-live="off" translate="no">
            {currentTime}
          </div>
        )}

        {/* Global Language Toggle */}
        <LanguageToggle variant="pill" />

        {/* Notifications Dropdown */}
        <div className="nav-dropdown-wrapper" ref={notifPanelRef}>
          <button
            type="button"
            id="notifications-btn"
            className="nav-icon-btn"
            onClick={() => {
              setNotificationsOpen(!notificationsOpen);
              setProfileOpen(false);
            }}
            aria-label={`View ${unreadCount} unread alerts`}
            aria-expanded={notificationsOpen}
          >
            <Bell size={20} aria-hidden="true" />
            {unreadCount > 0 && (
              <span className="badge-count tabular-numbers">{unreadCount > 99 ? '99+' : unreadCount}</span>
            )}
          </button>

          {notificationsOpen && (
            <div
              className="dropdown-panel notifications-panel"
              role="region"
              aria-label="Notifications Panel"
              style={{ minWidth: '340px', maxWidth: '400px' }}
            >
              {/* Panel Header */}
              <div className="dropdown-panel-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                <h3 style={{ margin: 0 }}>Notifications {unreadCount > 0 && <span style={{ fontSize: '11px', color: '#f59e0b', fontWeight: 700 }}>({unreadCount} unread)</span>}</h3>
                <div style={{ display: 'flex', gap: '6px' }}>
                  {unreadCount > 0 && (
                    <button
                      type="button"
                      onClick={handleMarkAllRead}
                      title="Mark all as read"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#60a5fa', padding: '2px 4px', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px' }}
                    >
                      <CheckCheck size={13} /> All read
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleRefresh}
                    title="Refresh"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: '2px 4px', borderRadius: '4px' }}
                  >
                    <RefreshCw size={12} />
                  </button>
                </div>
              </div>

              {/* Panel Body */}
              <div className="dropdown-panel-body" style={{ maxHeight: '360px', overflowY: 'auto' }}>
                {notifications.length === 0 ? (
                  <div className="empty-state" style={{ padding: '24px', textAlign: 'center', color: '#64748b' }}>
                    <Bell size={24} style={{ marginBottom: '8px', opacity: 0.4 }} />
                    <p style={{ margin: 0, fontSize: '13px' }}>No notifications</p>
                  </div>
                ) : (
                  notifications.map((notif) => {
                    const destination = getNotificationDestination();
                    const isClickable = !!destination;
                    const { title: notifTitle, message: notifMessage } = renderNotification(t, notif);
                    return (
                      <div
                        key={notif.id}
                        className="notification-item"
                        style={{
                          padding: '12px 14px',
                          borderBottom: '1px solid rgba(255,255,255,0.06)',
                          background: hoveredNotifId === notif.id
                            ? (notif.is_read ? 'rgba(0, 0, 0, 0.04)' : 'rgba(96, 165, 250, 0.12)')
                            : (notif.is_read ? 'transparent' : 'rgba(96, 165, 250, 0.05)'),
                          borderLeft: notif.is_read ? 'none' : '3px solid #60a5fa',
                          transition: 'background 0.2s',
                          cursor: isClickable ? 'pointer' : 'default',
                        }}
                        onMouseEnter={() => setHoveredNotifId(notif.id)}
                        onMouseLeave={() => setHoveredNotifId(null)}
                        onClick={() => {
                          if (!isClickable) return;
                          navigate(destination);
                          setNotificationsOpen(false);
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{
                              margin: '0 0 4px 0',
                              fontSize: '13px',
                              fontWeight: notif.is_read ? 400 : 600,
                              color: notif.is_read ? '#94a3b8' : '#0f172a',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}>
                              {notifTitle}
                            </p>
                            {notifMessage && (
                              <p style={{
                                margin: '0 0 6px 0',
                                fontSize: '11px',
                                color: '#64748b',
                                lineHeight: '1.4',
                              }}>
                                {notifMessage}
                              </p>
                            )}
                            <span style={{ fontSize: '10px', color: '#475569' }}>
                              {formatRelativeTime(notif.created_at)}
                            </span>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flexShrink: 0 }}>
                            {!notif.is_read && (
                              <button
                                type="button"
                                onClick={(e) => handleMarkRead(notif.id, e)}
                                title="Mark as read"
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#60a5fa', padding: '2px', borderRadius: '3px' }}
                              >
                                <CheckCheck size={14} />
                              </button>
                            )}
                            {notif.record_id && isClickable && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  navigate(destination);
                                  setNotificationsOpen(false);
                                }}
                                title="Go to page"
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: '2px', fontSize: '10px', borderRadius: '3px' }}
                              >
                                →
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>

        {/* Officer Profile Dropdown */}
        <div className="nav-dropdown-wrapper" ref={profilePanelRef}>
          <button
            type="button"
            className="officer-profile-btn"
            onClick={() => {
              setProfileOpen(!profileOpen);
              setNotificationsOpen(false);
            }}
            aria-expanded={profileOpen}
            aria-label="Officer Profile menu"
          >
            <div className="officer-avatar" aria-hidden="true">
              <User size={16} />
            </div>
            <div className="officer-details text-left font-sans flex flex-col justify-center leading-tight">
              <span className="officer-name block text-sm font-semibold truncate max-w-[150px] whitespace-nowrap">
                {lang === 'hi'
                  ? (user?.name || user?.username || "हैंड कांस्टेबल रमेश कुमार")
                  : (user?.name || user?.username || "HC Ramesh Kumar")}
              </span>
              <span className="officer-rank block text-[11px] text-slate-400 font-medium truncate max-w-[150px] whitespace-nowrap">
                {user?.role ? t(`roles.${user.role}`) : (user?.rank || "Station Operator")}
              </span>
              <span className="officer-jurisdiction block text-[10px] text-amber-500 font-bold uppercase tracking-wider mt-0.5 truncate max-w-[150px] whitespace-nowrap">
                {(() => {
                  const isHi = lang === 'hi';
                  if (user?.role === 'SYSTEM_ADMIN') {
                    return isHi ? "केंद्रीय प्रशासन" : "Central Administration";
                  }
                  if (user?.role === 'HQ_ANALYST' || user?.role === 'HQ_ADMIN') {
                    return isHi ? "दिल्ली पुलिस मुख्यालय" : "Delhi Police HQ";
                  }
                  if (user?.role === 'DISTRICT_OFFICER') {
                    return jurisdiction?.district?.name;
                  }
                  if (user?.role === 'ACP') {
                    return jurisdiction?.sub_division?.name;
                  }
                  return jurisdiction?.station?.name;
                })()}
              </span>
            </div>
          </button>

          {profileOpen && (
            <div className="dropdown-panel profile-panel" role="menu">
              <div className="profile-panel-header">
                <Award size={24} className="badge-icon text-amber-500" aria-hidden="true" />
                <div>
                  <h4 translate="no">{user?.pis || "PIS-28160942"}</h4>
                  <p>{user?.role ? t(`roles.${user.role}`) : (user?.rank || "Station Operator")}</p>
                </div>
              </div>
              <ul className="profile-menu-list">
                <li role="menuitem">
                  <button type="button" onClick={() => alert("Settings panel simulation…")}>
                    <Settings size={16} aria-hidden="true" />
                    <span>{t('common.settings')}</span>
                  </button>
                </li>
                <li role="menuitem">
                  <button type="button" className="btn-danger-link" onClick={handleLogout}>
                    <LogOut size={16} aria-hidden="true" />
                    <span>{t('common.signOut')}</span>
                  </button>
                </li>
              </ul>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}