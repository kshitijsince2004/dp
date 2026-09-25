import React, { useState, useMemo, useEffect } from 'react';
import { Card, Button, Input, Select, DatePicker, message, Progress, Spin, Space, Typography, Form, Row, Col, Alert } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { Plus, Trash, Download, Layers, Calendar, Table as TableIcon, CheckCircle2, ShieldAlert } from 'lucide-react';
import dayjs from 'dayjs';
import api from '../../utils/api.js';
import useAuthStore from '../../store/authStore.js';
import { log } from '../../utils/logger.js';
import { asArray } from '../../utils/dataShape.js';

const { Title, Text } = Typography;
const { Option } = Select;
const { RangePicker } = DatePicker;

export const MultiSheetReportBuilder = () => {
  const { user } = useAuthStore();
  const [form] = Form.useForm();
  
  // Custom definitions state
  const [reportTitle, setReportTitle] = useState('Custom Multi-Sheet Report');
  const [dateRange, setDateRange] = useState([]);
  const [selectedPs, setSelectedPs] = useState(user?.ps_id || null);
  const [sheets, setSheets] = useState([
    { id: Date.now().toString(), record_type: 'CASE', field_keys: [] }
  ]);

  useEffect(() => {
    log.debug('page:mount', { route: '/multi-sheet-report-builder', userId: user?.id, role: user?.role });
    return () => log.debug('page:unmount', { route: '/multi-sheet-report-builder' });
  }, []);

  // Export Progress State
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportJobId, setExportJobId] = useState(null);

  // Queries
  const { data: metadataRes, isLoading: loadingMetadata, error: metadataError } = useQuery({
    queryKey: ['report-builder', 'metadata'],
    queryFn: () => api.get('/reports/builder/metadata').then(res => res.data.data)
  });

  const { data: stationsList = [] } = useQuery({
    queryKey: ['report-builder', 'lookups', 'police-stations'],
    queryFn: () => api.get('/reports/builder/lookups/police-stations').then(res => asArray(res.data.data)),
    staleTime: 600000
  });

  // Derived metadata
  const metadataTables = metadataRes?.tables || {};
  
  const getFieldsForType = (recordType) => {
    if (!metadataTables[recordType]) return [];
    const fields = asArray(metadataTables[recordType].fields);
    const system = asArray(metadataTables[recordType].system_fields);
    return [...system.map(f => ({ ...f, isSystem: true })), ...fields];
  };

  const handleAddSheet = () => {
    setSheets([...sheets, { id: Date.now().toString(), record_type: 'CASE', field_keys: [] }]);
  };

  const handleRemoveSheet = (id) => {
    if (sheets.length === 1) {
      message.warning('At least one sheet is required.');
      return;
    }
    setSheets(sheets.filter(s => s.id !== id));
  };

  const updateSheet = (id, updates) => {
    setSheets(sheets.map(s => s.id === id ? { ...s, ...updates } : s));
  };

  const handleExport = async () => {
    // Validate
    if (sheets.some(s => s.field_keys.length === 0)) {
      message.error('All sheets must have at least one field selected.');
      return;
    }

    setExporting(true);
    setExportProgress(10);
    setExportJobId(null);
    log.info('action:generate_report_start', { reportTitle, sheetCount: sheets.length, psId: selectedPs });

    try {
      const filters = {};
      if (dateRange && dateRange.length === 2) {
        filters.date_from = dateRange[0].format('DD/MM/YYYY');
        filters.date_to = dateRange[1].format('DD/MM/YYYY');
      }
      if (selectedPs) {
        filters.ps_id = selectedPs;
      }

      const payload = {
        custom_definition: {
          title_en: reportTitle,
          sheets: sheets.map(s => ({
            record_type: s.record_type,
            field_keys: s.field_keys
          }))
        },
        filters: filters,
        format: 'EXCEL'
      };

      const initRes = await api.post('/reports/generate', payload);
      const jobId = initRes.data.data?.job?.id || initRes.data.data?.job_id;

      if (!jobId) throw new Error('Job ID missing from server response');
      log.info('action:generate_report_queued', { jobId });

      setExportJobId(jobId);
      setExportProgress(30);

      // Start polling
      let attempts = 0;
      const interval = setInterval(async () => {
        attempts += 1;
        setExportProgress(prev => Math.min(prev + 10, 95));

        if (attempts > 40) {
          clearInterval(interval);
          setExporting(false);
          log.error('action:generate_report_timeout', { jobId, attempts });
          message.error('Report compilation timed out.');
          return;
        }

        try {
          const checkRes = await api.get(`/reports/status/${jobId}`);
          const job = checkRes.data.data.job;
          log.debug('action:generate_report_poll_step', { jobId, attempt: attempts, status: job.status });

          if (job.status === 'FAILED') {
            clearInterval(interval);
            setExporting(false);
            log.error('action:generate_report_failed', { jobId, attempts });
            message.error('Report generation failed on server.');
          } else if (job.status === 'READY') {
            clearInterval(interval);
            setExportProgress(100);
            log.info('action:generate_report_ready', { jobId, attempts });

            // Download using authenticated blob download
            try {
              const res = await api.get(`/reports/download/${jobId}`, { responseType: 'blob' });
              const url = URL.createObjectURL(new Blob([res.data], {
                type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
              }));
              const link = document.createElement('a');
              link.href = url;
              link.setAttribute('download', `PHAROS_Report_${jobId}.xlsx`);
              document.body.appendChild(link);
              link.click();
              setTimeout(() => { link.remove(); URL.revokeObjectURL(url); }, 500);
              message.success('Excel Workbook compiled and downloaded successfully!');
            } catch (dlErr) {
              message.error('File download failed: ' + (dlErr.message || 'Error fetching file'));
            }

            setTimeout(() => {
              setExporting(false);
              setExportJobId(null);
              setExportProgress(0);
            }, 1000);
          }
        } catch (pollErr) {
          console.error(pollErr);
          log.error('action:generate_report_poll_error', { jobId, err: pollErr });
        }
      }, 500);

    } catch (err) {
      console.error(err);
      setExporting(false);
      log.error('action:generate_report_start_failed', { err });
      message.error(err.response?.data?.message || 'Failed to trigger report compile');
    }
  };

  if (loadingMetadata) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[300px] space-y-4">
        <Spin size="large" />
        <Text className="text-zinc-400">Loading reporting metadata...</Text>
      </div>
    );
  }

  if (metadataError) {
    return (
      <Alert
        message="Failed to connect to Report Builder"
        description="Ensure your backend instance is running."
        type="error"
        showIcon
        icon={<ShieldAlert />}
      />
    );
  }

  return (
    <div className="space-y-6 fade-in-up mt-4">
      <Card
        title={
          <Space>
            <Calendar size={18} className="text-[var(--accent-gold)]" />
            <span className="text-zinc-100">Global Filters & Metadata</span>
          </Space>
        }
        style={{ background: '#10141d', border: '1px solid #1c2430' }}
        headStyle={{ borderBottom: '1px solid #1c2430', color: '#fff' }}
      >
        <Row gutter={[24, 24]}>
          <Col xs={24} md={8}>
            <div className="space-y-1.5">
              <label className="text-zinc-400 font-semibold text-xs uppercase">Report Title</label>
              <Input 
                value={reportTitle}
                onChange={e => setReportTitle(e.target.value)}
                placeholder="Enter report title..."
                style={{ background: '#181f2a', borderColor: '#2d3748', color: '#fff' }}
              />
            </div>
          </Col>
          <Col xs={24} md={8}>
            <div className="space-y-1.5">
              <label className="text-zinc-400 font-semibold text-xs uppercase">Date Range</label>
              <RangePicker
                value={dateRange}
                onChange={val => setDateRange(val)}
                format="DD/MM/YYYY"
                disabledDate={(current) => current && current > dayjs().endOf('day')}
                style={{ width: '100%', background: '#181f2a', borderColor: '#2d3748' }}
              />
            </div>
          </Col>
          <Col xs={24} md={8}>
            <div className="space-y-1.5">
              <label className="text-zinc-400 font-semibold text-xs uppercase">Police Station (Optional)</label>
              <Select
                value={selectedPs}
                onChange={val => setSelectedPs(val)}
                allowClear
                placeholder="All Stations"
                style={{ width: '100%' }}
                dropdownStyle={{ background: '#181f2a', color: '#fff' }}
                disabled={user?.role === 'HC'}
              >
                {stationsList?.map(ps => (
                  <Option key={ps.id} value={ps.id}>{ps.name_en} ({ps.code})</Option>
                ))}
              </Select>
            </div>
          </Col>
        </Row>
      </Card>

      <Card
        title={
          <Space className="w-full justify-between flex">
            <Space>
              <Layers size={18} className="text-[var(--accent-gold)]" />
              <span className="text-zinc-100">Worksheet Configurations</span>
            </Space>
            <Button 
              type="dashed" 
              onClick={handleAddSheet}
              icon={<Plus size={14} />}
              style={{ borderColor: 'var(--accent-gold)', color: 'var(--accent-gold)', background: 'transparent' }}
            >
              Add Sheet
            </Button>
          </Space>
        }
        style={{ background: '#10141d', border: '1px solid #1c2430' }}
        headStyle={{ borderBottom: '1px solid #1c2430', color: '#fff' }}
      >
        <div className="space-y-4">
          {sheets.map((sheet, index) => {
            const availableFields = getFieldsForType(sheet.record_type);
            
            return (
              <div key={sheet.id} className="p-4 bg-[#181f2a] border border-[#2d3748] rounded-xl relative group transition-all hover:border-[#4a5568]">
                <div className="absolute right-4 top-4 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button 
                    type="text" 
                    danger 
                    icon={<Trash size={16} />} 
                    onClick={() => handleRemoveSheet(sheet.id)}
                  />
                </div>
                
                <Space direction="vertical" className="w-full" size="middle">
                  <div className="flex items-center gap-2 border-b border-[#2d3748] pb-3">
                    <TableIcon size={16} className="text-zinc-400" />
                    <Text strong className="text-zinc-200">Sheet {index + 1}</Text>
                  </div>
                  
                  <Row gutter={[24, 24]}>
                    <Col xs={24} md={8}>
                      <div className="space-y-1.5">
                        <label className="text-zinc-400 font-semibold text-xs uppercase">Record Type</label>
                        <Select
                          value={sheet.record_type}
                          onChange={val => updateSheet(sheet.id, { record_type: val, field_keys: [] })}
                          style={{ width: '100%' }}
                        >
                          <Option value="CASE">FIR Master (CASE)</Option>
                          <Option value="ARREST">Arrest Master (ARREST)</Option>
                          <Option value="PCR_CALL">PCR Calls (PCR_CALL)</Option>
                        </Select>
                      </div>
                    </Col>
                    <Col xs={24} md={16}>
                      <div className="space-y-1.5">
                        <label className="text-zinc-400 font-semibold text-xs uppercase">Columns / Fields</label>
                        <Select
                          mode="multiple"
                          allowClear
                          placeholder="Select fields to include in this sheet..."
                          value={sheet.field_keys}
                          onChange={val => updateSheet(sheet.id, { field_keys: val })}
                          style={{ width: '100%' }}
                          maxTagCount="responsive"
                          optionFilterProp="children"
                        >
                          {availableFields.map(f => (
                            <Option key={f.key} value={f.key}>
                              {f.label_en} {f.is_pii ? '(PII)' : ''}
                            </Option>
                          ))}
                        </Select>
                      </div>
                    </Col>
                  </Row>
                </Space>
              </div>
            );
          })}
        </div>

        <div className="mt-6 pt-4 border-t border-[#2d3748] flex justify-end">
          <Space>
            {exporting && (
              <div style={{ width: 200, marginRight: 16 }}>
                <Progress percent={exportProgress} size="small" strokeColor="#10b981" />
              </div>
            )}
            <Button
              type="primary"
              onClick={handleExport}
              loading={exporting}
              icon={<Download size={16} />}
              style={{
                background: '#10b981',
                borderColor: '#10b981',
                height: 40,
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: 8
              }}
            >
              Generate Excel Workbook
            </Button>
          </Space>
        </div>
      </Card>
    </div>
  );
};

export default MultiSheetReportBuilder;
