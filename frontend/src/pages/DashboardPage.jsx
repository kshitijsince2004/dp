import React, { useEffect, useState } from 'react';
import { Card, Col, Row, Statistic, Button, List, Space, Alert, Typography, Spin, Badge, Divider } from 'antd';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import {
  FileText,
  UserCheck,
  PhoneCall,
  ArrowRight,
  PlusCircle,
  ClipboardList,
  Bell,
  CheckCircle,
  FileBarChart
} from 'lucide-react';

const { Title, Paragraph, Text } = Typography;

export const DashboardPage = () => {
  const { user } = useAuth();
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();

  const getNotificationDestination = () => {
    const roleUpper = user?.role?.toUpperCase();
    const routeMap = {
      PS: '/records?scrollTo=table',
      HC: '/records?scrollTo=table',
      SHO: '/queue',
      ACP: '/queue',
      DISTRICT: '/queue',
      DISTRICT_OFFICER: '/queue',
    };
    return routeMap[roleUpper] || null;
  };

  const targetPath = getNotificationDestination();

  const [summary, setSummary] = useState({ CASES: 0, ARREST: 0, PCR: 0, MISSING: 0 });
  const [notifications, setNotifications] = useState([]);
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [loadingNotifications, setLoadingNotifications] = useState(true);

  const currentLng = i18n.language || 'en';

  const fetchData = async () => {
    try {
      const summaryRes = await axios.get('/api/v1/analytics/summary');
      setSummary(summaryRes.data?.data?.summary || { CASES: 0, ARREST: 0, PCR: 0, MISSING: 0 });
    } catch (err) {
      console.error('Failed to fetch summary counts:', err);
    } finally {
      setLoadingSummary(false);
    }

    try {
      // Correct endpoint: /api/v1/notifications (was wrongly /api/v1/auth/notifications)
      const notificationsRes = await axios.get('/api/v1/notifications?limit=20');
      const data = notificationsRes.data?.data;
      setNotifications(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to fetch notifications:', err);
    } finally {
      setLoadingNotifications(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleMarkRead = async (id) => {
    try {
      // Correct method: PATCH (was PUT), correct path /:id/read
      await axios.patch(`/api/v1/notifications/${id}/read`);
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
    } catch (err) {
      console.error('Failed to mark notification as read:', err);
    }
  };

  const getUnreadCount = () => {
    return notifications.filter(n => !n.is_read).length;
  };

  const getRoleWelcome = () => {
    const name = currentLng === 'hi' ? user?.name_hi : user?.name_en;
    return `${t('dashboard.welcome')}, ${name}`;
  };

  return (
    <div className="fade-in-up">
      {/* Welcome Hero Area */}
      <div style={{
        background: 'linear-gradient(135deg, #1d4ed8 0%, #090a0f 100%)',
        padding: '32px',
        borderRadius: '10px',
        marginBottom: '24px',
        border: '1px solid #1f2735',
        boxShadow: '0 4px 25px rgba(0, 0, 0, 0.3)'
      }}>
        <Row align="middle" justify="space-between">
          <Col xs={24} md={18}>
            <Title level={2} style={{ margin: 0, color: '#fff', fontWeight: 700 }}>
              {getRoleWelcome()}
            </Title>
            <Paragraph style={{ margin: '8px 0 0 0', color: '#94a3b8', fontSize: '15px' }}>
              {t('app.subtitle')} — {t('app.district')}. Check your queue and updates below.
            </Paragraph>
          </Col>
          <Col xs={24} md={6} style={{ textAlign: 'right', marginTop: '16px', md: { marginTop: 0 } }}>
            <Space>
              {user?.role === 'HC' && (
                <Button
                  type="primary"
                  icon={<PlusCircle size={16} />}
                  onClick={() => navigate('/register')}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 500 }}
                >
                  {t('nav.register')}
                </Button>
              )}
              {targetPath && (
                <Button
                  icon={<ClipboardList size={16} />}
                  onClick={() => navigate(targetPath)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    background: '#1e293b',
                    color: '#fff',
                    border: '1px solid #334155'
                  }}
                >
                  {targetPath.startsWith('/records') ? t('nav.records') : t('nav.queue')}
                </Button>
              )}
            </Space>
          </Col>
        </Row>
      </div>

      {/* Summary Cards */}
      <Spin spinning={loadingSummary}>
        <Row gutter={[16, 16]} style={{ marginBottom: '24px' }}>
          <Col xs={24} sm={12} lg={6}>
            <Card className="hover-scale" style={{ background: '#121824', border: '1px solid #1e293b' }}>
              <Statistic
                title={<span style={{ color: '#94a3b8', fontSize: '13px' }}>{t('dashboard.cases')}</span>}
                value={summary.CASES}
                valueStyle={{ color: '#38bdf8', fontWeight: 700, fontSize: '28px' }}
                prefix={<FileText size={22} style={{ color: '#38bdf8', marginRight: 8 }} />}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card className="hover-scale" style={{ background: '#121824', border: '1px solid #1e293b' }}>
              <Statistic
                title={<span style={{ color: '#94a3b8', fontSize: '13px' }}>{t('dashboard.arrests')}</span>}
                value={summary.ARREST}
                valueStyle={{ color: '#f43f5e', fontWeight: 700, fontSize: '28px' }}
                prefix={<UserCheck size={22} style={{ color: '#f43f5e', marginRight: 8 }} />}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card className="hover-scale" style={{ background: '#121824', border: '1px solid #1e293b' }}>
              <Statistic
                title={<span style={{ color: '#94a3b8', fontSize: '13px' }}>{t('dashboard.pcr')}</span>}
                value={summary.PCR}
                valueStyle={{ color: '#10b981', fontWeight: 700, fontSize: '28px' }}
                prefix={<PhoneCall size={22} style={{ color: '#10b981', marginRight: 8 }} />}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card className="hover-scale" style={{ background: '#121824', border: '1px solid #1e293b' }}>
              <Statistic
                title={<span style={{ color: '#94a3b8', fontSize: '13px' }}>Missing Persons</span>}
                value={summary.MISSING || 0}
                valueStyle={{ color: '#fbbf24', fontWeight: 700, fontSize: '28px' }}
                prefix={<FileBarChart size={22} style={{ color: '#fbbf24', marginRight: 8 }} />}
              />
            </Card>
          </Col>
        </Row>
      </Spin>

      <Row gutter={[24, 24]}>
        {/* Alerts & Notifications Feed */}
        <Col xs={24} lg={16}>
          <Card
            title={
              <Space>
                <Bell size={18} style={{ color: '#38bdf8' }} />
                <span>Notifications & Actions</span>
                <Badge count={getUnreadCount()} style={{ backgroundColor: '#f43f5e' }} />
              </Space>
            }
            extra={<Button type="text" onClick={fetchData} style={{ color: '#38bdf8' }}>Refresh</Button>}
            style={{ background: '#10141d', border: '1px solid #1c2430' }}
          >
            <Spin spinning={loadingNotifications}>
              <List
                itemLayout="horizontal"
                dataSource={notifications}
                locale={{ emptyText: <Text style={{ color: '#4b5563' }}>No active notifications</Text> }}
                renderItem={(item) => (
                  <List.Item
                    actions={[
                      !item.is_read && (
                        <Button
                          key="read"
                          type="text"
                          icon={<CheckCircle size={16} />}
                          onClick={() => handleMarkRead(item.id)}
                          style={{ color: '#10b981', display: 'flex', alignItems: 'center', gap: 4 }}
                        >
                          Mark Read
                        </Button>
                      ),
                      item.record_id && targetPath && (
                        <Button
                          key="view"
                          type="link"
                          onClick={() => navigate(targetPath)}
                          style={{ display: 'flex', alignItems: 'center', gap: 4 }}
                        >
                          {targetPath.startsWith('/records') ? t('nav.records') : t('nav.queue')} <ArrowRight size={14} />
                        </Button>
                      )
                    ]}
                    style={{
                      borderBottom: '1px solid #1e293b',
                      padding: '12px 8px',
                      opacity: item.is_read ? 0.6 : 1
                    }}
                  >
                    <List.Item.Meta
                      title={
                        <Text style={{ color: '#fff', fontWeight: item.is_read ? 500 : 700 }}>
                          {currentLng === 'hi' ? item.title_hi : item.title_en}
                        </Text>
                      }
                      description={
                        <Text style={{ color: '#94a3b8', fontSize: '13px' }}>
                          {currentLng === 'hi' ? item.message_hi : item.message_en}
                        </Text>
                      }
                    />
                  </List.Item>
                )}
              />
            </Spin>
          </Card>
        </Col>

        {/* System Overview info card */}
        <Col xs={24} lg={8}>
          <Card
            title="Operational Guidelines"
            style={{ background: '#10141d', border: '1px solid #1c2430' }}
          >
            <Space direction="vertical" size="middle" style={{ width: '100%' }}>
              <Alert
                message="Role scoping enforced"
                description="Your workspace access and operations are tightly bound to your node jurisdiction."
                type="info"
                showIcon
                style={{ background: '#0c1a30', border: '1px solid #1c3d5a', color: '#93c5fd' }}
              />
              <Text style={{ color: '#a0aec0' }}>
                For technical issues or role modification requests, please contact the North West District IT cell.
              </Text>
              <Divider style={{ margin: '12px 0', borderColor: '#232d3f' }} />
              <div>
                <Text strong style={{ color: '#fff' }}>Current User Context:</Text>
                <div style={{ marginTop: 8 }}>
                  <Text block style={{ color: '#a0aec0' }}>Badge: {user?.badge_no}</Text>
                  <Text block style={{ color: '#a0aec0' }}>Role: {user?.role}</Text>
                  {user?.ps_id && <Text block style={{ color: '#a0aec0' }}>Station ID: {user.ps_id}</Text>}
                </div>
              </div>
            </Space>
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default DashboardPage;
