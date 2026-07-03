import React, { useState } from 'react';
import { Card, Select, Divider, Alert, message, Space, Typography, Row, Col } from 'antd';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { FileText, UserPlus, PhoneCall, ShieldAlert } from 'lucide-react';
import DynamicForm from '../../components/DynamicForm/DynamicForm';
import { formatDMY } from '../../utils/dateFormat.js';

const { Title, Paragraph, Text } = Typography;
const { Option } = Select;

export const RegistrationPage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [recordType, setRecordType] = useState('CASES');
  const [loading, setLoading] = useState(false);

  const handleFormSubmit = async (formData) => {
    setLoading(true);
    try {
      // Set record_date to current date, or pick occurrence_date/record_date if configured
      const recordDate = formData.fir_date || formData.occurrence_date || formatDMY(new Date());
      
      const payload = {
        record_type: recordType,
        record_date: recordDate,
        data: formData
      };

      await axios.post('/api/v1/records', payload);
      message.success(t('common.success'));
      navigate('/queue');
    } catch (err) {
      console.error('Record creation failed:', err);
      message.error(err.response?.data?.message || t('common.error'));
    } finally {
      setLoading(false);
    }
  };

  const getRecordTypeIcon = () => {
    switch (recordType) {
      case 'ARREST':
        return <UserPlus size={24} style={{ color: '#f43f5e' }} />;
      case 'PCR':
        return <PhoneCall size={24} style={{ color: '#10b981' }} />;
      case 'CASES':
      default:
        return <FileText size={24} style={{ color: '#38bdf8' }} />;
    }
  };

  return (
    <div className="fade-in-up">
      <div style={{ marginBottom: 24 }}>
        <Title level={3} style={{ color: '#fff', margin: 0 }}>
          {t('nav.register')}
        </Title>
        <Paragraph style={{ color: '#a0aec0', marginTop: 4 }}>
          Initialize a new record entry in the system. Dynamic forms are loaded based on current district guidelines.
        </Paragraph>
      </div>

      <Row gutter={[24, 24]}>
        <Col xs={24} lg={16}>
          <Card
            title={
              <Space size="middle">
                {getRecordTypeIcon()}
                <span>Entry Specification</span>
              </Space>
            }
            extra={
              <Space>
                <span style={{ color: '#a0aec0' }}>{t('fields.record_type')}:</span>
                <Select
                  value={recordType}
                  onChange={(val) => setRecordType(val)}
                  style={{ width: 180 }}
                >
                  <Option value="CASES">{t('dashboard.cases')}</Option>
                  <Option value="ARREST">{t('dashboard.arrests')}</Option>
                  <Option value="PCR">{t('dashboard.pcr')}</Option>
                </Select>
              </Space>
            }
            style={{ background: '#10141d', border: '1px solid #1c2430' }}
          >
            <DynamicForm
              key={recordType}
              recordType={recordType}
              onSubmit={handleFormSubmit}
              loadingSubmit={loading}
              onCancel={() => navigate('/dashboard')}
            />
          </Card>
        </Col>

        <Col xs={24} lg={8}>
          <Card
            title="Operator Instructions"
            style={{ background: '#10141d', border: '1px solid #1c2430' }}
          >
            <Space direction="vertical" size="middle" style={{ width: '100%' }}>
              <Alert
                message="Mandatory Information"
                description="Please fill all marked operational details. Entries submitted with empty GD number or Date values will require send-back correction by the review desk."
                type="warning"
                showIcon
                icon={<ShieldAlert size={18} />}
                style={{ background: '#2d2217', border: '1px solid #634717', color: '#fbd38d' }}
              />

              <Text strong style={{ color: '#fff' }}>Registration Lifecycle:</Text>
              <ul style={{ color: '#a0aec0', paddingLeft: 20, margin: 0 }}>
                <li style={{ marginBottom: 8 }}>
                  <strong>Draft:</strong> Save progress anytime. The record remains local and editable by the operator.
                </li>
                <li style={{ marginBottom: 8 }}>
                  <strong>Submission:</strong> Once submitted, the record gets locked. The SHO of the local Police Station will be notified for review.
                </li>
                <li>
                  <strong>Corrections:</strong> If returned, edit actions are unlocked and highlighted comments will specify required adjustments.
                </li>
              </ul>
            </Space>
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default RegistrationPage;
