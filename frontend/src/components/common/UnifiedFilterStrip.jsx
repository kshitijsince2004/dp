import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Search } from 'lucide-react';
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

  const handleTypeChange = (value) => {
    onFilterChange({ ...filters, type: value });
  };

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
    { value: 'PCR_CALL', label: t('recordTypes.PCR_CALL', 'PCR Calls') },
    { value: 'MISSING', label: t('recordTypes.MISSING', 'Missing Persons') },
    { value: 'UIDB', label: t('recordTypes.UIDB', 'UIDB') }
  ];

  return (
    <div className="bg-white border border-slate-300 rounded-card p-3 flex flex-wrap items-center gap-3 mb-4">
      {/* Category Filter */}
      <Select
        value={filters.type || 'ALL'}
        onChange={handleTypeChange}
        style={{ width: 160 }}
        variant="outlined"
        className="rounded-control"
        popupMatchSelectWidth={false}
      >
        {recordTypes.map(rt => (
          <Option key={rt.value} value={rt.value}>{rt.label}</Option>
        ))}
      </Select>

      {/* Status Filter */}
      {allowedStatuses.length > 0 && (
        <Select
          value={filters.status || 'ALL'}
          onChange={handleStatusChange}
          style={{ minWidth: 160 }}
          variant="outlined"
          className="rounded-control"
          popupMatchSelectWidth={false}
        >
          <Option value="ALL">{t('common.allStatuses', 'All Statuses')}</Option>
          {allowedStatuses.filter(s => s !== 'ALL').map(st => (
            <Option key={st} value={st}>{t(`status.${st}`, st)}</Option>
          ))}
        </Select>
      )}

      {/* Local Head Filter */}
      <Select
        value={filters.localHead || 'ALL'}
        onChange={handleLocalHeadChange}
        style={{ minWidth: 170, maxWidth: 240 }}
        variant="outlined"
        className="rounded-control"
        popupMatchSelectWidth={false}
        showSearch
        optionFilterProp="children"
      >
        <Option value="ALL">{t('common.allLocalHeads', 'All Local Heads')}</Option>
        {localHeads.map(lh => (
          <Option key={lh.value} value={lh.label}>{lh.label}</Option>
        ))}
      </Select>

      {/* Date Range Filter */}
      <div className="flex items-center flex-grow sm:flex-grow-0">
        <RangePicker
          onChange={handleDateRangeChange}
          value={filters.dateFrom && filters.dateTo ? [dayjs(filters.dateFrom, 'DD/MM/YYYY'), dayjs(filters.dateTo, 'DD/MM/YYYY')] : null}
          className="rounded-control w-full sm:w-auto"
          format="DD/MM/YYYY"
        />
      </div>

      {/* Search Input */}
      <div className="flex items-center flex-grow">
        <Input
          placeholder={t('common.searchPlaceholder', 'Search by case number, name, or keyword...')}
          value={localSearch}
          onChange={e => setLocalSearch(e.target.value)}
          prefix={<Search size={16} className="text-slate-400" />}
          className="rounded-control py-1.5 px-3"
          allowClear
        />
      </div>
    </div>
  );
}
