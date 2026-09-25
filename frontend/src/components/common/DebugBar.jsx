import React, { useState, useEffect } from 'react';
import { ShieldAlert, Database, Wifi, AlertTriangle } from 'lucide-react';

export default function DebugBar() {
  const [mode, setMode] = useState(() => localStorage.getItem('prism_debug_api_mode') || 'production');

  const handleModeChange = (newMode) => {
    const currentMode = localStorage.getItem('prism_debug_api_mode') || 'mock';
    // When switching between mock ↔ live, clear session so user re-authenticates
    // with the correct token type for the new mode
    if (currentMode !== newMode) {
      localStorage.removeItem('access_token');
      localStorage.removeItem('refresh_token');
      // Clear Zustand persisted auth state
      const stored = JSON.parse(localStorage.getItem('crime-diaries-auth') || '{}');
      if (stored?.state) {
        stored.state.user = null;
        stored.state.isAuthenticated = false;
        localStorage.setItem('crime-diaries-auth', JSON.stringify(stored));
      }
    }
    localStorage.setItem('prism_debug_api_mode', newMode);
    setMode(newMode);
    window.location.reload();
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-zinc-950/90 border-t border-zinc-800 backdrop-blur-md px-4 py-2 flex items-center justify-between text-xs text-zinc-300 font-sans shadow-2xl">
      <div className="flex items-center gap-2">
        <ShieldAlert size={14} className="text-amber-500 animate-pulse" />
        <span className="font-bold tracking-wide text-zinc-100 uppercase" translate="no">
          PRISM Visual Testing Console
        </span>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5 bg-zinc-900 border border-zinc-800 rounded px-2 py-1">
          <Database size={10} className="text-[#cca43b]" />
          <span>Active State DB: <strong className="text-zinc-100">Local Storage</strong></span>
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-zinc-400">API Gateway Simulation:</span>
          <div className="flex rounded overflow-hidden border border-zinc-800">
            <button
              onClick={() => handleModeChange('mock')}
              className={`px-3 py-1 font-semibold transition-colors cursor-pointer ${
                mode === 'mock'
                  ? 'bg-[#cca43b] text-zinc-950'
                  : 'bg-zinc-900 hover:bg-zinc-800 text-zinc-300'
              }`}
            >
              Mock Mode
            </button>
            <button
              onClick={() => handleModeChange('production')}
              className={`px-3 py-1 font-semibold transition-colors cursor-pointer ${
                mode === 'production'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-zinc-900 hover:bg-zinc-800 text-zinc-300'
              }`}
            >
              Live API
            </button>
            <button
              onClick={() => handleModeChange('error_400')}
              className={`px-2 py-1 font-semibold transition-colors cursor-pointer ${
                mode === 'error_400'
                  ? 'bg-red-700 text-white'
                  : 'bg-zinc-900 hover:bg-zinc-800 text-zinc-400'
              }`}
              title="Force Bad Request (400)"
            >
              Err 400
            </button>
            <button
              onClick={() => handleModeChange('error_401')}
              className={`px-2 py-1 font-semibold transition-colors cursor-pointer ${
                mode === 'error_401'
                  ? 'bg-red-700 text-white'
                  : 'bg-zinc-900 hover:bg-zinc-800 text-zinc-400'
              }`}
              title="Force Unauthorized (401)"
            >
              Err 401
            </button>
            <button
              onClick={() => handleModeChange('error_403')}
              className={`px-2 py-1 font-semibold transition-colors cursor-pointer ${
                mode === 'error_403'
                  ? 'bg-red-700 text-white'
                  : 'bg-zinc-900 hover:bg-zinc-800 text-zinc-400'
              }`}
              title="Force Forbidden (403)"
            >
              Err 403
            </button>
            <button
              onClick={() => handleModeChange('error_500')}
              className={`px-2 py-1 font-semibold transition-colors cursor-pointer ${
                mode === 'error_500'
                  ? 'bg-red-700 text-white'
                  : 'bg-zinc-900 hover:bg-zinc-800 text-zinc-400'
              }`}
              title="Force Server Failure (500)"
            >
              Err 500
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
