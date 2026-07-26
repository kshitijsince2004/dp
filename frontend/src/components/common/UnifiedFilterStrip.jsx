import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, Filter, ListFilter, Shield } from 'lucide-react';
import { DatePicker, Input, Select } from 'antd';
import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import api from '../../utils/api.js';

dayjs.extend(customParseFormat);

const { RangePicker } = DatePicker;
const { Option } = Select;

export default function UnifiedFilterStrip({ filters, onFilterChange, allowedStatuses = [] }) {
  const { t } = useTranslation();
  
  const [localHeads, setLocalHeads] = useState([]);

  useEffect(() => {
    api.get('/fields/lookup/local-heads')
      .then(res => {
        if (res.data?.success) {
          setLocalHeads(res.data.data || []);
        }
      })
      .catch(err => console.error('Failed to fetch local heads', err));
  }, []);

  // Local state for debounced search
  const [localSearch, setLocalSearch] = useState(filters.search || '');

  useEffect(() => {
    const timer = setTimeout(() => {
      if (localSearch !== filters.search) {
        onFilterChange({ ...filters, search: localSearch });
      }
    }, 500); // 500ms debounce
    return () => clearTimeout(timer);
  }, [localSearch, filters, onFilterChange]);

  // "Kalandra" and "Arrest (Against FIR)" are NOT record types — they are derived
  // sub-filters of ARREST, decided by the backend (record.record_type CHECK only allows
  // CASE/ARREST/PCR_CALL/MISSING/UIDB). The dropdown just offers two convenience entries
  // that resolve to { type: 'ARREST', arrestKind: 'KALANDRA' | 'AGAINST_FIR' } — the actual
  // OR-of-signals classification (is_dd_based / no CASE_ARREST link / no fir_no) happens
  // server-side via GET /records?record_type=ARREST&arrest_kind=... (P4 — never classify here).
  const ARREST_KALANDRA = 'ARREST_KALANDRA';
  const ARREST_AGAINST_FIR = 'ARREST_AGAINST_FIR';

  const handleTypeChange = (value) => {
    if (value === ARREST_KALANDRA) {
      onFilterChange({ ...filters, type: 'ARREST', arrestKind: 'KALANDRA' });
    } else if (value === ARREST_AGAINST_FIR) {
      onFilterChange({ ...filters, type: 'ARREST', arrestKind: 'AGAINST_FIR' });
    } else {
      onFilterChange({ ...filters, type: value, arrestKind: undefined });
    }
  };

  // Derive the option key the Select should show as selected: plain filters.type for
  // everything except the two ARREST sub-filters, which fold type+arrestKind back into
  // their single dropdown entry.
  const selectedTypeValue =
    filters.type === 'ARREST' && filters.arrestKind === 'KALANDRA'
      ? ARREST_KALANDRA
      : filters.type === 'ARREST' && filters.arrestKind === 'AGAINST_FIR'
      ? ARREST_AGAINST_FIR
      : (filters.type || 'ALL');

  const handleStatusChange = (value) => {
    onFilterChange({ ...filters, status: value });
  };

  const handleLocalHeadChange = (value) => {
    onFilterChange({ ...filters, localHead: value === 'ALL' ? '' : value });
  };

  const handleDateRangeChange = (dates) => {
    if (dates && dates.length === 2) {
      onFilterChange({
        ...filters,
        dateFrom: dates[0].format('DD/MM/YYYY'),
        dateTo: dates[1].format('DD/MM/YYYY')
      });
    } else {
      onFilterChange({ ...filters, dateFrom: null, dateTo: null });
    }
  };

  const recordTypes = [
    { value: 'ALL', label: t('common.allCategories', 'All Categories') },
    { value: 'CASE', label: t('recordTypes.CASE', 'Cases (FIR)') },
    { value: 'ARREST', label: t('recordTypes.ARREST', 'Arrests') },
    { value: ARREST_KALANDRA, label: t('recordTypes.KALANDRA', 'Kalandra (Non-FIR Arrest)') },
    { value: ARREST_AGAINST_FIR, label: t('recordTypes.ARREST_AGAINST_FIR', 'Arrest (Against FIR)') },
    { value: 'PCR_CALL', label: t('recordTypes.PCR_CALL', 'PCR Calls') },
    { value: 'MISSING', label: t('recordTypes.MISSING', 'Missing Persons') },
    { value: 'UIDB', label: t('recordTypes.UIDB', 'UIDB') }
  ];

  return (
    <div className="bg-white border border-slate-200/80 shadow-sm rounded-xl p-3 flex flex-wrap items-center gap-4 transition-all hover:shadow-md mb-6">
      {/* Category Filter */}
      <div className="flex items-center gap-2">
        <ListFilter size={16} className="text-[var(--accent-color)]" />
        <Select
          value={selectedTypeValue}
          onChange={handleTypeChange}
          style={{ width: 200 }}
          variant="borderless"
          className="bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors font-semibold text-slate-700"
          popupMatchSelectWidth={false}
        >
          {recordTypes.map(rt => (
            <Option key={rt.value} value={rt.value}>{rt.label}</Option>
          ))}
        </Select>
      </div>

      <div className="h-6 w-px bg-slate-200 hidden md:block"></div>

      {/* Status Filter */}
      {allowedStatuses.length > 0 && (
        <div className="flex items-center gap-2">
          <Filter size={16} className="text-[var(--accent-color)]" />
          <Select 
            value={filters.status || 'ALL'} 
            onChange={handleStatusChange}
            style={{ minWidth: 160 }}
            variant="borderless"
            className="bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors font-semibold text-slate-700"
            popupMatchSelectWidth={false}
          >
            <Option value="ALL">{t('common.allStatuses', 'All Statuses')}</Option>
            {allowedStatuses.filter(s => s !== 'ALL').map(st => (
              <Option key={st} value={st}>{t(`status.${st}`, st)}</Option>
            ))}
          </Select>
        </div>
      )}

      {allowedStatuses.length > 0 && <div className="h-6 w-px bg-slate-200 hidden md:block"></div>}

      {/* Local Head Filter */}
      <div className="flex items-center gap-2">
        <Shield size={16} className="text-[var(--accent-color)]" />
        <Select 
          value={filters.localHead || 'ALL'} 
          onChange={handleLocalHeadChange}
          style={{ minWidth: 170, maxWidth: 240 }}
          variant="borderless"
          className="bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors font-semibold text-slate-700"
          popupMatchSelectWidth={false}
          showSearch
          optionFilterProp="children"
        >
          <Option value="ALL">{t('common.allLocalHeads', 'All Local Heads')}</Option>
          {localHeads.map(lh => (
            <Option key={lh.value} value={lh.label}>{lh.label}</Option>
          ))}
        </Select>
      </div>

      <div className="h-6 w-px bg-slate-200 hidden md:block"></div>

      {/* Date Range Filter */}
      <div className="flex items-center gap-2 flex-grow sm:flex-grow-0">
        <RangePicker 
          onChange={handleDateRangeChange}
          value={filters.dateFrom && filters.dateTo ? [dayjs(filters.dateFrom, 'DD/MM/YYYY'), dayjs(filters.dateTo, 'DD/MM/YYYY')] : null}
          className="bg-slate-50 border-transparent hover:bg-slate-100 hover:border-[var(--accent-color)] transition-colors shadow-none rounded-lg w-full sm:w-auto font-medium"
          format="DD/MM/YYYY"
        />
      </div>

      <div className="h-6 w-px bg-slate-200 hidden lg:block"></div>

      {/* Search Input */}
      <div className="flex items-center gap-2 flex-grow">
        <Input 
          placeholder={t('common.searchPlaceholder', 'Search by case number, name, or keyword...')}
          value={localSearch}
          onChange={e => setLocalSearch(e.target.value)}
          prefix={<Search size={16} className="text-slate-400" />}
          className="bg-slate-50 border-transparent hover:bg-slate-100 hover:border-[var(--accent-color)] focus:bg-white focus:border-[var(--accent-color)] transition-colors shadow-none rounded-lg py-1.5 px-3 font-medium"
          allowClear
        />
      </div>
    </div>
  );
}
