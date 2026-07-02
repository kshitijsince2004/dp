import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, Filter, ListFilter } from 'lucide-react';
import { DatePicker, Input, Select } from 'antd';
import dayjs from 'dayjs';

const { RangePicker } = DatePicker;
const { Option } = Select;

export default function UnifiedFilterStrip({ filters, onFilterChange, allowedStatuses = [] }) {
  const { t } = useTranslation();
  
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

  const handleTypeChange = (value) => {
    onFilterChange({ ...filters, type: value });
  };

  const handleStatusChange = (value) => {
    onFilterChange({ ...filters, status: value });
  };

  const handleDateRangeChange = (dates) => {
    if (dates && dates.length === 2) {
      onFilterChange({ 
        ...filters, 
        dateFrom: dates[0].format('YYYY-MM-DD'), 
        dateTo: dates[1].format('YYYY-MM-DD') 
      });
    } else {
      onFilterChange({ ...filters, dateFrom: null, dateTo: null });
    }
  };

  const recordTypes = [
    { value: 'ALL', label: t('common.allCategories', 'All Categories') },
    { value: 'CASE', label: t('recordTypes.CASE', 'Cases (FIR)') },
    { value: 'ARREST', label: t('recordTypes.ARREST', 'Arrests') },
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
          value={filters.type || 'ALL'} 
          onChange={handleTypeChange}
          style={{ width: 160 }}
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

      {/* Date Range Filter */}
      <div className="flex items-center gap-2 flex-grow sm:flex-grow-0">
        <RangePicker 
          onChange={handleDateRangeChange}
          value={filters.dateFrom && filters.dateTo ? [dayjs(filters.dateFrom), dayjs(filters.dateTo)] : null}
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
