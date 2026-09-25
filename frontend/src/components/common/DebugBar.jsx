import React, { useState, useEffect } from 'react';
import { ShieldAlert, Database, AlertTriangle } from 'lucide-react';

const MODE_KEY = 'prism_debug_api_mode';
const PREV_MODE_KEY = 'prism_debug_api_mode_prev';

/** Must match api.js — Err buttons are hidden unless this env flag is set. */
const ERROR_SIM_ENABLED = import.meta.env.VITE_ENABLE_API_ERROR_SIMULATION === 'true';

const isErrorMode = (mode) => typeof mode === 'string' && mode.startsWith('error_');

function readSanitizedMode() {
  const raw = localStorage.getItem(MODE_KEY) || 'production';
  if (isErrorMode(raw) && !ERROR_SIM_ENABLED) {
    const prev = localStorage.getItem(PREV_MODE_KEY);
    const restore = prev === 'mock' ? 'mock' : 'production';
    localStorage.setItem(MODE_KEY, restore);
    localStorage.removeItem(PREV_MODE_KEY);
    return restore;
  }
  return raw;
}

export default function DebugBar() {
  const [mode, setMode] = useState(() => readSanitizedMode());
  const inErrorMode = ERROR_SIM_ENABLED && isErrorMode(mode);

  // Keep UI in sync if api.js cleared a stuck error_* mode on import.
  useEffect(() => {
    const sanitized = readSanitizedMode();
    if (sanitized !== mode) setMode(sanitized);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only sync with localStorage
  }, []);

  const handleModeChange = (newMode) => {
    if (isErrorMode(newMode) && !ERROR_SIM_ENABLED) return;

    const currentMode = localStorage.getItem(MODE_KEY) || 'production';
    if (currentMode === newMode) return;

    // Only clear auth when crossing mock ↔ live — error simulation should not
    // wipe the session or leave the user stuck unable to re-login.
    const crossingMockLive =
      (currentMode === 'mock' || currentMode === 'production') &&
      (newMode === 'mock' || newMode === 'production') &&
      currentMode !== newMode;

    if (crossingMockLive) {
      localStorage.removeItem('access_token');
      localStorage.removeItem('refresh_token');
      const stored = JSON.parse(localStorage.getItem('crime-diaries-auth') || '{}');
      if (stored?.state) {
        stored.state.user = null;
        stored.state.isAuthenticated = false;
        localStorage.setItem('crime-diaries-auth', JSON.stringify(stored));
      }
    }

    // Remember last non-error mode so "Exit" can restore Mock/Live cleanly.
    if (isErrorMode(newMode) && !isErrorMode(currentMode)) {
      localStorage.setItem(PREV_MODE_KEY, currentMode);
    }

    localStorage.setItem(MODE_KEY, newMode);
    setMode(newMode);
    window.location.reload();
  };

  const exitErrorMode = () => {
    const previous = localStorage.getItem(PREV_MODE_KEY) || 'production';
    localStorage.removeItem(PREV_MODE_KEY);
    handleModeChange(previous === 'mock' ? 'mock' : 'production');
  };

  return (
    <>
      {inErrorMode && (
        <div className="fixed top-0 left-0 right-0 z-[60] flex items-center justify-between gap-3 bg-red-700 px-4 py-2 text-xs text-white shadow-lg">
          <div className="flex items-center gap-2 font-semibold">
            <AlertTriangle size={14} className="shrink-0" />
            <span>
              API error simulation active ({mode.replace('error_', 'HTTP ')}). Every request is
              forced to fail — this is not a real backend outage.
            </span>
          </div>
          <button
            type="button"
            onClick={exitErrorMode}
            className="shrink-0 rounded bg-white px-3 py-1 font-bold text-red-800 hover:bg-red-50 cursor-pointer"
          >
            Exit error mode
          </button>
        </div>
      )}

      <div className="fixed bottom-0 left-0 right-0 z-50 bg-zinc-950/90 border-t border-zinc-800 backdrop-blur-md px-4 py-2 flex items-center justify-between text-xs text-zinc-300 font-sans shadow-2xl">
        <div className="flex items-center gap-2">
          <ShieldAlert size={14} className={inErrorMode ? 'text-red-500 animate-pulse' : 'text-amber-500 animate-pulse'} />
          <span className="font-bold tracking-wide text-zinc-100 uppercase" translate="no">
            PRISM Visual Testing Console
          </span>
          {inErrorMode && (
            <span className="rounded bg-red-700 px-2 py-0.5 font-bold text-white">
              SIMULATING {mode.replace('error_', '')} ERRORS
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 bg-zinc-900 border border-zinc-800 rounded px-2 py-1">
            <Database size={10} className="text-[var(--accent-gold)]" />
            <span>Active State DB: <strong className="text-zinc-100">Local Storage</strong></span>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-zinc-400">API Gateway Simulation:</span>
            <div className="flex rounded overflow-hidden border border-zinc-800">
              <button
                type="button"
                onClick={() => handleModeChange('mock')}
                className={`px-3 py-1 font-semibold transition-colors cursor-pointer ${
                  mode === 'mock'
                    ? 'bg-[var(--accent-gold)] text-zinc-950'
                    : 'bg-zinc-900 hover:bg-zinc-800 text-zinc-300'
                }`}
              >
                Mock Mode
              </button>
              <button
                type="button"
                onClick={() => handleModeChange('production')}
                className={`px-3 py-1 font-semibold transition-colors cursor-pointer ${
                  mode === 'production'
                    ? 'bg-emerald-600 text-white'
                    : 'bg-zinc-900 hover:bg-zinc-800 text-zinc-300'
                }`}
              >
                Live API
              </button>
              {ERROR_SIM_ENABLED && (
                <>
                  <button
                    type="button"
                    onClick={() => handleModeChange('error_400')}
                    className={`px-2 py-1 font-semibold transition-colors cursor-pointer ${
                      mode === 'error_400'
                        ? 'bg-red-700 text-white'
                        : 'bg-zinc-900 hover:bg-zinc-800 text-zinc-400'
                    }`}
                    title="Force Bad Request (400) — testing only"
                  >
                    Err 400
                  </button>
                  <button
                    type="button"
                    onClick={() => handleModeChange('error_401')}
                    className={`px-2 py-1 font-semibold transition-colors cursor-pointer ${
                      mode === 'error_401'
                        ? 'bg-red-700 text-white'
                        : 'bg-zinc-900 hover:bg-zinc-800 text-zinc-400'
                    }`}
                    title="Force Unauthorized (401) — testing only"
                  >
                    Err 401
                  </button>
                  <button
                    type="button"
                    onClick={() => handleModeChange('error_403')}
                    className={`px-2 py-1 font-semibold transition-colors cursor-pointer ${
                      mode === 'error_403'
                        ? 'bg-red-700 text-white'
                        : 'bg-zinc-900 hover:bg-zinc-800 text-zinc-400'
                    }`}
                    title="Force Forbidden (403) — testing only"
                  >
                    Err 403
                  </button>
                  <button
                    type="button"
                    onClick={() => handleModeChange('error_500')}
                    className={`px-2 py-1 font-semibold transition-colors cursor-pointer ${
                      mode === 'error_500'
                        ? 'bg-red-700 text-white'
                        : 'bg-zinc-900 hover:bg-zinc-800 text-zinc-400'
                    }`}
                    title="Force Server Failure (500) — testing only"
                  >
                    Err 500
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
