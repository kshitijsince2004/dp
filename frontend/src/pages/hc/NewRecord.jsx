import React from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, BookOpen, AlertTriangle, ChevronRight, FileText, ClipboardCheck } from 'lucide-react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import DynamicForm from '../../components/forms/DynamicForm.jsx';
import api from '../../utils/api.js';
import { useCreateRecord } from '../../hooks/useCreateRecord.js';
import { useUpdateRecord } from '../../hooks/useUpdateRecord.js';

const pageVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05
    }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 12, filter: "blur(3px)" },
  show: { opacity: 1, y: 0, filter: "blur(0px)", transition: { type: "spring", stiffness: 95, damping: 14 } }
};

export default function NewRecord() {
  const { t } = useTranslation();
  const { type } = useParams();
  const [searchParams] = useSearchParams();
  const editId = searchParams.get('edit');
  const [caseType, setCaseType] = React.useState(null);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: recordPayload, isLoading } = useQuery({
    queryKey: ['records', editId],
    queryFn: async () => {
      const res = await api.get(`/records/${editId}`);
      return res.data.data;
    },
    enabled: !!editId,
  });

  const record = recordPayload?.record;
  const transitions = recordPayload?.transitions || [];

  const createMutation = useCreateRecord(type);
  const updateMutation = useUpdateRecord(type || record?.record_type);

  const submitMutation = useMutation({
    mutationFn: async (id) => {
      const res = await api.post(`/records/${id}/submit`);
      return res.data.data;
    },
    onSuccess: () => {
      toast.success(t('actions.submitSuccess', 'Record submitted to SHO successfully'));
      queryClient.invalidateQueries({ queryKey: ['records'] });
      navigate('/records');
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'Failed to submit record');
    },
  });

  const handleFormSubmit = async (formData, persons, properties, activeId) => {
    try {
      let savedRecord;
      if (activeId || editId) {
        savedRecord = await updateMutation.mutateAsync({ id: activeId || editId, data: formData, persons, properties });
      } else {
        savedRecord = await createMutation.mutateAsync({ data: formData, persons, properties });
      }
      const finalId = activeId || editId || savedRecord?.id;
      if (!finalId) throw new Error('No valid record ID found for submission.');
      await submitMutation.mutateAsync(finalId);
    } catch (e) {
      console.error('Failed to submit form', e);
      toast.error(e?.response?.data?.message || 'Failed to save or submit record.');
    }
  };

  const getSendBackDetails = () => {
    if (!record || record.current_status !== 'SENT_BACK_HC') return null;
    return transitions.find((tr) => tr.action === 'SEND_BACK') || null;
  };

  const sbDetails = getSendBackDetails();

  if (editId && isLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-20 text-slate-500 theme-hc-page">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--accent-color)] mb-4" />
        <p>{t('common.loading', 'Loading record...')}</p>
      </div>
    );
  }

  if (type === 'ARREST' && !editId && !caseType) {
    return (
      <div className="min-h-screen theme-hc-page page-bg py-3 px-2">
        <motion.div 
          variants={pageVariants}
          initial="hidden"
          animate="show"
          className="space-y-3 w-full police-watermark pb-3"
        >
          {/* Breadcrumb */}
          <motion.nav 
            variants={itemVariants}
            className="flex items-center gap-1.5 text-xs font-semibold text-slate-500"
          >
            <button onClick={() => navigate('/dashboard')} className="hover:text-[var(--accent-color)] transition-colors cursor-pointer border-none bg-transparent">
              {t('nav.dashboard', 'Dashboard')}
            </button>
            <ChevronRight size={12} />
            <button onClick={() => navigate('/records')} className="hover:text-[var(--accent-color)] transition-colors cursor-pointer border-none bg-transparent">
              {t('nav.records', 'Records')}
            </button>
            <ChevronRight size={12} />
            <span className="text-slate-800">
              New Arrest Entry
            </span>
          </motion.nav>

          {/* Page Header */}
          <motion.div 
            variants={itemVariants}
            className="premium-glass-card p-5 flex items-center gap-3"
          >
            <button
              onClick={() => navigate('/records')}
              className="hover:bg-slate-50 text-slate-500 hover:text-slate-700 p-2 rounded-xl transition-all duration-200 cursor-pointer border border-slate-200 active:scale-95"
            >
              <ArrowLeft size={16} />
            </button>
            <div>
              <h1 className="text-lg font-bold text-slate-800 flex items-center gap-2 tracking-wide font-display">
                <BookOpen className="text-[var(--accent-color)]" size={18} />
                <span>New Arrest Entry Case Type</span>
              </h1>
              <p className="text-xs text-slate-500 mt-0.5 font-semibold">
                Select whether this arrest is associated with an existing FIR or is a non-FIR Kalandra case.
              </p>
            </div>
          </motion.div>

          {/* Selection Cards */}
          <motion.div 
            variants={itemVariants}
            className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto pt-4"
          >
            {/* Against FIR Card */}
            <div 
              onClick={() => setCaseType('against_fir')}
              className="group cursor-pointer bg-white border border-slate-200 hover:border-[var(--accent-color)] rounded-3xl p-8 shadow-sm hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1.5 flex flex-col justify-between h-72"
            >
              <div className="space-y-4">
                <div className="w-14 h-14 rounded-2xl bg-[var(--accent-glow)] border border-[var(--accent-color)]/15 flex items-center justify-center text-[var(--accent-color)] group-hover:bg-[var(--accent-color)] group-hover:text-white transition-all duration-300">
                  <FileText size={28} />
                </div>
                <div className="space-y-1.5">
                  <h3 className="text-xl font-bold text-slate-800 group-hover:text-[var(--accent-color)] transition-colors font-display">
                    Against FIR
                  </h3>
                  <p className="text-xs text-slate-500 leading-relaxed font-semibold">
                    The arrest is executed under an established First Information Report (FIR). This selection adds an initial step to search and reference the target FIR.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 text-xs font-bold text-[var(--accent-color)] mt-4">
                <span>Select &amp; Proceed</span>
                <ChevronRight size={14} className="group-hover:translate-x-1 transition-transform" />
              </div>
            </div>

            {/* Kalandra Card */}
            <div 
              onClick={() => setCaseType('kalandra')}
              className="group cursor-pointer bg-white border border-slate-200 hover:border-[var(--accent-color)] rounded-3xl p-8 shadow-sm hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1.5 flex flex-col justify-between h-72"
            >
              <div className="space-y-4">
                <div className="w-14 h-14 rounded-2xl bg-amber-50 border border-amber-200/50 flex items-center justify-center text-amber-600 group-hover:bg-amber-500 group-hover:text-white transition-all duration-300">
                  <ClipboardCheck size={28} />
                </div>
                <div className="space-y-1.5">
                  <h3 className="text-xl font-bold text-slate-800 group-hover:text-amber-600 transition-colors font-display">
                    Kalandra / Preventive
                  </h3>
                  <p className="text-xs text-slate-500 leading-relaxed font-semibold">
                    Arrest under Section 151 CrPC, localized police security proceedings, or other non-FIR matters. Bypasses FIR query directly to the standard registry.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 text-xs font-bold text-amber-600 mt-4">
                <span>Select &amp; Proceed</span>
                <ChevronRight size={14} className="group-hover:translate-x-1 transition-transform" />
              </div>
            </div>
          </motion.div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen theme-hc-page page-bg py-3 px-2">
      <motion.div 
        variants={pageVariants}
        initial="hidden"
        animate="show"
        className="space-y-3 w-full police-watermark pb-3"
      >
        {/* Simple Page Header with Breadcrumbs */}
        <motion.div 
          variants={itemVariants}
          className="flex items-center justify-between pb-1.5 border-b border-slate-200"
        >
          <div>
            <div className="text-xs font-semibold text-slate-500 flex items-center gap-1.5">
              <button onClick={() => navigate('/dashboard')} className="hover:text-[var(--accent-color)] transition-colors cursor-pointer border-none bg-transparent font-semibold p-0">
                Home
              </button>
              <span>&gt;</span>
              <button onClick={() => navigate('/records')} className="hover:text-[var(--accent-color)] transition-colors cursor-pointer border-none bg-transparent font-semibold p-0">
                Registration
              </button>
              <span>&gt;</span>
              <span className="text-slate-800 font-semibold">Record</span>
            </div>
            <h1 className="text-lg font-bold text-[#0d2a4a] mt-0.5 tracking-wide font-display uppercase">
              {type === 'CASE' || record?.record_type === 'CASE' 
                ? 'FIR Registration' 
                : `${editId ? 'Edit' : 'New'} ${type || record?.record_type || ''} Registration`}
            </h1>
          </div>
          <button
            onClick={() => {
              if (caseType) {
                setCaseType(null);
              } else {
                navigate('/records');
              }
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 hover:bg-slate-100 text-[#0d2a4a] hover:text-[#0f52ba] rounded-xl transition-all duration-200 cursor-pointer border border-slate-200 active:scale-95 text-xs font-bold bg-white"
          >
            <ArrowLeft size={14} />
            <span>Back</span>
          </button>
        </motion.div>

        {/* Send-back feedback banner */}
        {sbDetails && (
          <motion.div 
            variants={itemVariants}
            className="bg-rose-50 border border-rose-200 rounded-2xl p-4.5 flex gap-3 text-xs text-slate-700 shadow-sm"
          >
            <AlertTriangle className="text-rose-500 flex-shrink-0 mt-0.5" size={16} />
            <div className="space-y-1 w-full">
              <h4 className="font-extrabold text-rose-700 uppercase tracking-wide">
                {t('actions.correctionRequired', 'Reviewer Correction Requested')}
              </h4>
              <p className="font-semibold text-slate-600"><strong>Reviewer Officer:</strong> {sbDetails.performed_by}</p>
              <p className="bg-white p-3 rounded-xl border border-rose-200 text-rose-700 italic mt-1.5 font-medium shadow-sm">
                "{sbDetails.comment}"
              </p>
              {sbDetails.target_fields?.length > 0 && (
                <p className="text-[11px] text-slate-500 mt-1.5 font-semibold">
                  Fields to correct:{' '}
                  <span className="font-mono text-rose-600 bg-rose-100/60 px-2 py-0.5 rounded border border-rose-200/50">
                    {sbDetails.target_fields.join(', ')}
                  </span>
                </p>
              )}
            </div>
          </motion.div>
        )}

        {/* Dynamic Form Engine */}
        <motion.div variants={itemVariants}>
          <DynamicForm
            recordType={type || record?.record_type}
            initialValues={record}
            initialPersons={recordPayload?.persons || []}
            initialProperties={recordPayload?.properties || []}
            onSubmit={handleFormSubmit}
            targetFields={sbDetails?.target_fields || []}
            readOnly={record && record.current_status !== 'DRAFT' && record.current_status !== 'SENT_BACK_HC'}
            caseType={caseType}
            onBack={caseType ? () => setCaseType(null) : () => navigate(-1)}
          />
        </motion.div>
      </motion.div>
    </div>
  );
}
