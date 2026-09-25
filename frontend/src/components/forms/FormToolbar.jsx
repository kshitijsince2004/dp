import React from 'react';
import { ArrowLeft, Save, ArrowRight, ChevronRight, SendHorizonal } from 'lucide-react';
import { log } from '../../utils/logger.js';

export default function FormToolbar({
  currentStep,
  totalSteps,
  readOnly,
  onBack,
  onPrevious,
  onSaveDraft,
  onNext,
  onSubmit,
  isLastStep,
  lang = 'en'
}) {
  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-6 pb-6 border-t border-slate-100 mt-2">
      {/* Left: Back to desk */}
      <button
        type="button"
        onClick={() => { log.debug('form:toolbar_click', { action: 'back_to_desk' }); onBack(); }}
        className="flex items-center gap-2 px-6 py-3 bg-white border-2 border-slate-200 hover:border-slate-400
          text-slate-600 hover:text-slate-800 rounded-xl text-base font-bold transition-all shadow-sm cursor-pointer hover:shadow-md"
      >
        <ArrowLeft size={18} />
        <span>{lang === 'hi' ? 'डेस्क पर वापस' : 'Back to Desk'}</span>
      </button>

      {/* Right: Step controls */}
      <div className="flex items-center gap-3 flex-wrap justify-end">
        {/* Previous step */}
        {currentStep > 0 && (
          <button
            type="button"
            onClick={() => { log.debug('form:toolbar_click', { action: 'previous_step', currentStep }); onPrevious(); }}
            className="flex items-center gap-2 px-6 py-3 bg-white border-2 border-slate-200 hover:border-slate-400
              text-slate-600 hover:text-slate-800 rounded-xl text-base font-bold transition-all shadow-sm cursor-pointer hover:shadow-md"
          >
            <ArrowLeft size={18} />
            <span>{lang === 'hi' ? 'पिछला' : 'Previous'}</span>
          </button>
        )}

        {/* Manual save draft (only in edit mode) */}
        {!readOnly && onSaveDraft && (
          <button
            type="button"
            onClick={() => { log.debug('form:toolbar_click', { action: 'save_draft', currentStep }); onSaveDraft(); }}
            className="flex items-center gap-2 px-6 py-3 bg-amber-50 border-2 border-[var(--accent-gold)] hover:bg-[var(--accent-gold)] hover:text-white
              text-[var(--accent-gold)] rounded-xl text-base font-bold transition-all shadow-sm cursor-pointer hover:shadow-md hover:-translate-y-0.5"
          >
            <Save size={18} />
            <span>{lang === 'hi' ? 'ड्राफ्ट सहेजें' : 'Save Draft'}</span>
          </button>
        )}

        {/* Next step OR Submit */}
        {!isLastStep ? (
          <button
            type="button"
            onClick={() => { log.debug('form:toolbar_click', { action: 'next_step', currentStep }); onNext(); }}
            className="flex items-center gap-2.5 px-8 py-3 bg-[var(--accent-color)] hover:bg-[var(--accent-color-hover)]
              text-white rounded-xl text-base font-bold transition-all shadow-md shadow-[var(--accent-glow)] hover:-translate-y-0.5 cursor-pointer"
          >
            <span>{lang === 'hi' ? 'अगला' : 'Next Step'}</span>
            <ArrowRight size={18} />
          </button>
        ) : (
          !readOnly && (
            <button
              type="button"
              onClick={(e) => { log.debug('form:toolbar_click', { action: 'submit', currentStep }); onSubmit(e); }}
              className="flex items-center gap-2.5 px-10 py-3 bg-[var(--accent-color)] hover:bg-emerald-600 text-white
                font-bold rounded-control text-base transition-colors cursor-pointer
                focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
            >
              <SendHorizonal size={18} />
              <span>{lang === 'hi' ? 'रिकॉर्ड सबमिट करें' : 'Submit Record'}</span>
            </button>
          )
        )}
      </div>
    </div>
  );
}
