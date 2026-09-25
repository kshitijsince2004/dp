import React, { useEffect } from 'react';
import { Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { log } from '../../utils/logger.js';

export default function FormAutosave({ status, lang = 'en' }) {
  // Reflects the autosave lifecycle already logged step-by-step in useAutosave.js
  // (autosave:trigger_scheduled/save/save:success/save:error) — this logs only the
  // status badge's own transitions, so a tester can see what the UI showed at any point
  // in the log without needing to correlate against React state directly.
  useEffect(() => {
    log.debug('autosave:status_render', { status });
  }, [status]);

  if (status === 'idle') return null;
  return (
    <div className={`flex items-center gap-1.5 text-[11px] font-semibold transition-all ${
      status === 'saving'   ? 'text-amber-600' :
      status === 'saved'    ? 'text-emerald-600' :
      status === 'unsaved'  ? 'text-red-500' : 'text-slate-400'
    }`}>
      {status === 'saving'  && <Loader2 size={12} className="animate-spin" />}
      {status === 'saved'   && <CheckCircle2 size={12} />}
      {status === 'unsaved' && <AlertCircle size={12} />}
      {status === 'saving'  && (lang === 'hi' ? 'ड्राफ्ट सहेजा जा रहा है...' : 'Saving...')}
      {status === 'saved'   && (lang === 'hi' ? 'स्वतः सहेजा गया' : 'Saved')}
      {status === 'unsaved' && (lang === 'hi' ? 'सहेजा नहीं गया — परिवर्तन लंबित' : 'Unsaved Changes')}
    </div>
  );
}
