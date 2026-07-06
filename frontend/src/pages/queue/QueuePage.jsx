import React, { useEffect, useState } from 'react';
import { Table, Card, Button, Modal, Space, Tag, Input, Form, Checkbox, Row, Col, Timeline, Divider, message, Badge, Select, Alert, Typography } from 'antd';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import {
  Search,
  Eye,
  Check,
  RotateCcw,
  AlertOctagon,
  History,
  FileEdit,
  ArrowRight,
  ClipboardList
} from 'lucide-react';
import UnifiedFilterStrip from '../../components/common/UnifiedFilterStrip';

const { Title, Paragraph } = Typography;

export const QueuePage = () => {
  const { user } = useAuth();
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [queue, setQueue] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    type: 'ALL',
    status: 'ALL',
    dateFrom: null,
    dateTo: null,
    search: ''
  });
  const [selectedRecordId, setSelectedRecordId] = useState(null);
  const [recordDetail, setRecordDetail] = useState(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  
  // Transition actions state
  const [comment, setComment] = useState('');
  const [selectedFields, setSelectedFields] = useState([]); // for send-back check
  const [overrideHead, setOverrideHead] = useState('');
  const [overrideReason, setOverrideReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const currentLng = i18n.language || 'en';

  const fetchQueue = async () => {
    setLoading(true);
    try {
      const params = {};
      if (filters.type && filters.type !== 'ALL') params.type = filters.type;
      if (filters.status && filters.status !== 'ALL') {
        if (filters.status === 'SENT_BACK_HC') {
          // Both SENT_BACK_HC and SENT_BACK statuses are used to represent returned records in different components
          params.status = ['SENT_BACK_HC', 'SENT_BACK'];
        } else {
          params.status = filters.status;
        }
      }
      if (filters.dateFrom) params.dateFrom = filters.dateFrom;
      if (filters.dateTo) params.dateTo = filters.dateTo;
      if (filters.search) params.search = filters.search;

      const res = await axios.get('/api/v1/workflow/queue', { params });
      setQueue(res.data.data.queue || []);
    } catch (err) {
      console.error('Failed to load queue:', err);
      message.error(t('common.error'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQueue();
  }, [filters]);

  const handleOpenDetail = async (id) => {
    setSelectedRecordId(id);
    try {
      const res = await axios.get(`/api/v1/records/${id}`);
      setRecordDetail(res.data.data);
      setDetailModalOpen(true);
      // Reset action forms
      setComment('');
      setSelectedFields([]);
      setOverrideHead('');
      setOverrideReason('');
    } catch (err) {
      console.error('Failed to fetch details:', err);
      message.error('Could not load record details');
    }
  };

  const handleApprove = async () => {
    if (!selectedRecordId) return;
    setActionLoading(true);
    try {
      await axios.post(`/api/v1/records/${selectedRecordId}/approve`, { comment });
      message.success('Record approved successfully');
      setDetailModalOpen(false);
      fetchQueue();
    } catch (err) {
      console.error('Approval failed:', err);
      message.error(err.response?.data?.message || 'Approval action failed');
    } finally {
      setActionLoading(false);
    }
  };

  const handleSendBack = async () => {
    if (!selectedRecordId) return;
    if (!comment.trim()) {
      message.warning('A comment describing the corrections is required.');
      return;
    }
    setActionLoading(true);
    try {
      await axios.post(`/api/v1/records/${selectedRecordId}/send-back`, {
        comment,
        target_fields: selectedFields
      });
      message.success('Record returned to operator');
      setDetailModalOpen(false);
      fetchQueue();
    } catch (err) {
      console.error('Sendback failed:', err);
      message.error(err.response?.data?.message || 'Send-back action failed');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDcpOverride = async () => {
    if (!selectedRecordId) return;
    if (!overrideHead) {
      message.warning('Please select a new Crime Head classification.');
      return;
    }
    if (overrideReason.trim().length < 10) {
      message.warning('Override reason justification must be at least 10 characters.');
      return;
    }
    setActionLoading(true);
    try {
      await axios.patch(`/api/v1/records/${selectedRecordId}/override`, {
        caseHeadId: overrideHead,
        reason: overrideReason
      });
      message.success('Case head overridden successfully');
      // Reload details to show update
      const res = await axios.get(`/api/v1/records/${selectedRecordId}`);
      setRecordDetail(res.data.data);
      setOverrideHead('');
      setOverrideReason('');
      fetchQueue();
    } catch (err) {
      console.error('Override failed:', err);
      message.error(err.response?.data?.message || 'DCP override action failed');
    } finally {
      setActionLoading(false);
    }
  };

  const handleSubmitDraft = async (id) => {
    try {
      await axios.put(`/api/v1/records/${id}/submit`);
      message.success('Record submitted for approval');
      fetchQueue();
    } catch (err) {
      console.error('Submit failed:', err);
      message.error(err.response?.data?.message || 'Failed to submit record');
    }
  };

  const getStatusTagColor = (status) => {
    switch (status) {
      case 'DRAFT':
        return 'default';
      case 'SENT_BACK':
        return 'warning';
      case 'PENDING_SHO':
        return 'processing';
      case 'DISTRICT_REVIEW':
        return 'volcano';
      case 'HQ_RECEIVED':
        return 'success';
      case 'CLOSED':
        return 'success';
      default:
        return 'blue';
    }
  };

  const columns = [
    {
      title: 'UID',
      dataIndex: 'uid',
      key: 'uid',
      render: (text) => <span style={{ fontWeight: 600, color: '#38bdf8' }}>{text || 'N/A'}</span>
    },
    {
      title: t('fields.record_type'),
      dataIndex: 'record_type',
      key: 'record_type',
      render: (type) => <Tag color="geekblue">{type}</Tag>
    },
    {
      title: t('fields.record_date'),
      dataIndex: 'record_date',
      key: 'record_date',
      render: (date) => date || 'N/A'
    },
    {
      title: t('common.status'),
      dataIndex: 'current_status',
      key: 'current_status',
      render: (status) => (
        <Tag color={getStatusTagColor(status)}>
          {t(`status.${status}`) || status}
        </Tag>
      )
    },
    {
      title: t('common.actionsColumn'),
      key: 'actions',
      render: (_, record) => (
        <Space size="middle">
          <Button
            type="text"
            icon={<Eye size={16} />}
            onClick={() => handleOpenDetail(record.id)}
            style={{ color: '#38bdf8', display: 'flex', alignItems: 'center', gap: 4 }}
          >
            {t('common.details')}
          </Button>

          {user?.role === 'HC' && (record.current_status === 'DRAFT' || record.current_status === 'SENT_BACK') && (
            <Button
              type="text"
              icon={<FileEdit size={16} />}
              onClick={() => {
                navigate(`/records/new/${record.record_type}?edit=${record.id}`);
              }}
              style={{ color: '#fbbf24', display: 'flex', alignItems: 'center', gap: 4 }}
            >
              Edit
            </Button>
          )}

          {user?.role === 'HC' && (record.current_status === 'DRAFT' || record.current_status === 'SENT_BACK') && (
            <Button
              type="text"
              icon={<Check size={16} />}
              onClick={() => handleSubmitDraft(record.id)}
              style={{ color: '#10b981', display: 'flex', alignItems: 'center', gap: 4 }}
            >
              Submit
            </Button>
          )}
        </Space>
      )
    }
  ];

  // Helper to extract fields for checklist
  const getFieldKeysForChecklist = () => {
    if (!recordDetail?.record?.data) return [];
    return Object.keys(recordDetail.record.data).filter(key => key !== 'uid');
  };

  return (
    <div className="fade-in-up">
      <div style={{ marginBottom: 24 }}>
        <Title level={3} style={{ color: '#fff', margin: 0 }}>
          {t('nav.queue')}
        </Title>
        <Paragraph style={{ color: '#a0aec0', marginTop: 4 }}>
          Monitor record submittals, revise logs, inspect transaction state revisions, and approve or redirect corrections.
        </Paragraph>
      </div>

      <UnifiedFilterStrip 
        filters={filters}
        onFilterChange={setFilters}
        allowedStatuses={['ALL', 'DRAFT', 'PENDING_SHO', 'ACP_REVIEW', 'DISTRICT_REVIEW', 'SENT_BACK_HC', 'COMPILED']}
      />

      <Card style={{ background: '#10141d', border: '1px solid #1c2430' }}>
        <Table
          dataSource={queue}
          columns={columns}
          loading={loading}
          rowKey="id"
          pagination={{ pageSize: 10 }}
          style={{ background: 'transparent' }}
        />
      </Card>

      {/* Details Modal */}
      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#fff' }}>
            <ClipboardList size={20} style={{ color: '#38bdf8' }} />
            <span>Record Details & Operations Ledger</span>
          </div>
        }
        open={detailModalOpen}
        onCancel={() => setDetailModalOpen(false)}
        footer={null}
        width={1000}
      >
        {recordDetail && (
          <Row gutter={[24, 24]} style={{ marginTop: 20 }}>
            {/* Left Column: Data Grid */}
            <Col xs={24} lg={12}>
              <Card
                title="Structured Record Data"
                style={{ background: '#141923', borderColor: '#232d3f' }}
                headStyle={{ color: '#fff', borderBottom: '1px solid #232d3f' }}
              >
                <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr', gap: '12px' }}>
                  <span style={{ color: '#718096', fontWeight: 600 }}>Record Category:</span>
                  <Tag color="blue" style={{ width: 'fit-content' }}>{recordDetail.record.record_type}</Tag>

                  <span style={{ color: '#718096', fontWeight: 600 }}>UID:</span>
                  <span style={{ color: '#fff', fontWeight: 700 }}>{recordDetail.record.data.uid || 'N/A'}</span>

                  <span style={{ color: '#718096', fontWeight: 600 }}>Current Status:</span>
                  <Tag color={getStatusTagColor(recordDetail.record.current_status)}>
                    {t(`status.${recordDetail.record.current_status}`)}
                  </Tag>

                  <span style={{ color: '#718096', fontWeight: 600 }}>Police Station:</span>
                  <span style={{ color: '#e2e8f0' }}>{recordDetail.record.ps_name}</span>

                  <span style={{ color: '#718096', fontWeight: 600 }}>District:</span>
                  <span style={{ color: '#e2e8f0' }}>{recordDetail.record.district_name}</span>

                  <span style={{ color: '#718096', fontWeight: 600 }}>Record Date:</span>
                  <span style={{ color: '#e2e8f0' }}>{recordDetail.record.record_date}</span>
                </div>

                <Divider style={{ borderColor: '#232d3f' }} />

                <Title level={5} style={{ color: '#fff', marginBottom: 12 }}>Payload Values</Title>
                <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr', gap: '12px 8px' }}>
                  {Object.entries(recordDetail.record.data)
                    .filter(([key]) => key !== 'uid')
                    .map(([key, val]) => (
                      <React.Fragment key={key}>
                        <span style={{ color: '#718096', textTransform: 'capitalize', fontSize: 13 }}>
                          {t(`fields.${key}`) || key.replace('_', ' ')}:
                        </span>
                        <span style={{ color: '#e2e8f0', wordBreak: 'break-word', fontSize: 13 }}>
                          {typeof val === 'boolean' ? (val ? 'Yes' : 'No') : String(val)}
                        </span>
                      </React.Fragment>
                    ))}
                </div>
              </Card>
            </Col>

            {/* Right Column: Version Ledger Timeline & Auditing */}
            <Col xs={24} lg={12}>
              <Card
                title={
                  <Space>
                    <History size={16} />
                    <span>Audit revisions & workflow state</span>
                  </Space>
                }
                style={{ background: '#141923', borderColor: '#232d3f', height: '100%', maxHeight: 450, overflowY: 'auto' }}
                headStyle={{ color: '#fff', borderBottom: '1px solid #232d3f' }}
              >
                <Timeline mode="left">
                  {recordDetail.revisions.map((rev) => (
                    <Timeline.Item
                      key={rev.id}
                      label={<span style={{ color: '#718096', fontSize: 11 }}>{new Date(rev.changed_at).toLocaleString()}</span>}
                      color="blue"
                    >
                      <div style={{ color: '#e2e8f0' }}>
                        <strong>{rev.change_type}</strong> (v{rev.revision_number}) by <span style={{ color: '#38bdf8' }}>{rev.user_fullname}</span>
                        {rev.ip_address && <div style={{ fontSize: 10, color: '#4a5568' }}>IP: {rev.ip_address}</div>}
                        {rev.field_changes && rev.field_changes.length > 0 && (
                          <div style={{ background: '#0d1117', padding: '6px 10px', borderRadius: 4, marginTop: 4, fontSize: 12 }}>
                            {rev.field_changes.map((ch, idx) => (
                              <div key={idx} style={{ color: '#a0aec0' }}>
                                <span style={{ color: '#f56565' }}>- {ch.field_key}</span>: {String(ch.old_value)} <ArrowRight size={10} style={{ display: 'inline', margin: '0 4px' }} /> <span style={{ color: '#48bb78' }}>+ {String(ch.new_value)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                        {rev.reason && <div style={{ fontStyle: 'italic', fontSize: 11, color: '#fbbf24', marginTop: 4 }}>Reason: {rev.reason}</div>}
                      </div>
                    </Timeline.Item>
                  ))}
                  {recordDetail.transitions.map((tr) => (
                    <Timeline.Item
                      key={tr.id}
                      label={<span style={{ color: '#718096', fontSize: 11 }}>{new Date(tr.performed_at).toLocaleString()}</span>}
                      color="green"
                    >
                      <div style={{ color: '#e2e8f0' }}>
                        <strong>{tr.action}</strong> transition from <Tag color="default">{tr.from_status}</Tag> to <Tag color="blue">{tr.to_status}</Tag> by {tr.username}
                        {tr.comment && <div style={{ color: '#a0aec0', fontSize: 12, marginTop: 4 }}>Comment: "{tr.comment}"</div>}
                        {tr.target_fields && tr.target_fields.length > 0 && (
                          <div style={{ fontSize: 11, color: '#f56565', marginTop: 4 }}>
                            Correction Checklist: {tr.target_fields.join(', ')}
                          </div>
                        )}
                      </div>
                    </Timeline.Item>
                  ))}
                </Timeline>
              </Card>
            </Col>

            {/* Bottom Actions Drawer Panel */}
            <Col xs={24}>
              {/* Operator Action Info */}
              {user?.role === 'HC' && recordDetail.record.current_status === 'SENT_BACK' && (
                <Alert
                  type="warning"
                  showIcon
                  icon={<AlertOctagon size={18} />}
                  message="Revision required"
                  description={`Please review comments and update fields. Feedback remark: "${recordDetail.transitions[recordDetail.transitions.length - 1]?.comment || 'Correction needed.'}"`}
                  style={{ background: '#2d2217', borderColor: '#634717', color: '#fbd38d' }}
                />
              )}

              {/* SHO Reviewer Desk Actions */}
              {user?.role === 'SHO' && recordDetail.record.current_status === 'PENDING_SHO' && (
                <Card title="Review Actions Panel" style={{ background: '#121824', borderColor: '#232d3f', marginTop: 16 }}>
                  <Form layout="vertical">
                    <Form.Item label={<span style={{ color: '#a0aec0' }}>Comment/Instructions (Mandatory for returning corrections)</span>}>
                      <Input.TextArea
                        value={comment}
                        onChange={(e) => setComment(e.target.value)}
                        placeholder="Add review remarks..."
                        rows={3}
                      />
                    </Form.Item>

                    {/* Correction checklist selection */}
                    <div style={{ marginBottom: 16 }}>
                      <span style={{ color: '#a0aec0', display: 'block', marginBottom: 8 }}>Select correction fields checklist (optional):</span>
                      <Checkbox.Group
                        options={getFieldKeysForChecklist()}
                        value={selectedFields}
                        onChange={(checkedValues) => setSelectedFields(checkedValues)}
                      />
                    </div>

                    <Space size="middle">
                      <Button
                        type="primary"
                        onClick={handleApprove}
                        loading={actionLoading}
                        style={{ background: '#48bb78', borderColor: '#48bb78' }}
                      >
                        Approve & Forward to District
                      </Button>
                      <Button
                        type="primary"
                        danger
                        onClick={handleSendBack}
                        loading={actionLoading}
                      >
                        Send Back for Corrections
                      </Button>
                    </Space>
                  </Form>
                </Card>
              )}

              {/* District Officer Actions Panel */}
              {user?.role === 'DISTRICT_OFFICER' && recordDetail.record.current_status === 'DISTRICT_REVIEW' && (
                <Card title="District Review & DCP Crime Head Classification Override" style={{ background: '#121824', borderColor: '#232d3f', marginTop: 16 }}>
                  <Row gutter={[24, 16]}>
                    <Col xs={24} md={12}>
                      <Form layout="vertical">
                        <Title level={5} style={{ color: '#fff', marginBottom: 16 }}>Advance Status</Title>
                        <Form.Item label={<span style={{ color: '#a0aec0' }}>Transition remarks (optional)</span>}>
                          <Input.TextArea
                            value={comment}
                            onChange={(e) => setComment(e.target.value)}
                            placeholder="Enter review comments..."
                            rows={3}
                          />
                        </Form.Item>
                        <Space>
                          <Button
                            type="primary"
                            onClick={handleApprove}
                            loading={actionLoading}
                            style={{ background: '#48bb78', borderColor: '#48bb78' }}
                          >
                            Approve & Publish to HQ
                          </Button>
                          <Button
                            type="primary"
                            danger
                            onClick={handleSendBack}
                            loading={actionLoading}
                          >
                            Send Back to Operator
                          </Button>
                        </Space>
                      </Form>
                    </Col>

                    <Col xs={24} md={12}>
                      <Form layout="vertical">
                        <Title level={5} style={{ color: '#fff', marginBottom: 16 }}>Reclassify Crime Head (DCP Override)</Title>
                        
                        <Form.Item label={<span style={{ color: '#a0aec0' }}>New Crime Head Classification</span>}>
                          <Select
                            value={overrideHead}
                            onChange={(val) => setOverrideHead(val)}
                            placeholder="Select classification..."
                          >
                            <Select.Option value="THEFT">THEFT</Select.Option>
                            <Select.Option value="ROBBERY">ROBBERY</Select.Option>
                            <Select.Option value="BURGLARY">BURGLARY</Select.Option>
                            <Select.Option value="MURDER">MURDER</Select.Option>
                            <Select.Option value="SNATCHING">SNATCHING</Select.Option>
                            <Select.Option value="MOTOR_VEHICLE_THEFT">MOTOR VEHICLE THEFT</Select.Option>
                            <Select.Option value="ASSAULT">ASSAULT</Select.Option>
                          </Select>
                        </Form.Item>

                        <Form.Item label={<span style={{ color: '#a0aec0' }}>Override Justification Reason (Min 10 characters)</span>}>
                          <Input.TextArea
                            value={overrideReason}
                            onChange={(e) => setOverrideReason(e.target.value)}
                            placeholder="State evidence justifying crime head change..."
                            rows={3}
                          />
                        </Form.Item>

                        <Button
                          type="primary"
                          onClick={handleDcpOverride}
                          loading={actionLoading}
                          style={{ background: '#fbbf24', borderColor: '#fbbf24', color: '#1a202c', fontWeight: 600 }}
                        >
                          Execute Classification Override
                        </Button>
                      </Form>
                    </Col>
                  </Row>
                </Card>
              )}
            </Col>
          </Row>
        )}
      </Modal>
    </div>
  );
};

export default QueuePage;
