import React, { useEffect, useState } from 'react';
import { Form, Input, InputNumber, DatePicker, Select, Switch, Button, Card, Spin, Space, Alert } from 'antd';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat';

dayjs.extend(customParseFormat);

const { Option } = Select;

const ConditionalFormItem = ({ field, children, form, currentLanguage }) => {
  const label = currentLanguage === 'hi' ? field.label_hi : field.label_en;
  const triggerValue = Form.useWatch(field.show_when?.field, form);

  if (field.show_when) {
    const { value: targetValue } = field.show_when;
    const current = String(triggerValue || '').toLowerCase();
    const allowed = Array.isArray(targetValue)
      ? targetValue.map(v => String(v).toLowerCase())
      : [String(targetValue || '').toLowerCase()];
    if (!allowed.includes(current)) return null;
  }

  return children;
};

export const DynamicForm = ({ recordType, initialValues, onSubmit, onCancel, loadingSubmit }) => {
  const { t, i18n } = useTranslation();
  const [form] = Form.useForm();
  const [sections, setSections] = useState([]);
  const [loadingSchema, setLoadingSchema] = useState(true);
  const [error, setError] = useState(null);

  const currentLanguage = i18n.language || 'en';

  useEffect(() => {
    const fetchSchema = async () => {
      setLoadingSchema(true);
      setError(null);
      try {
        const res = await axios.get(`/api/v1/fields/form/${recordType}`);
        setSections(res.data.data.sections || []);
        
        // Prepare initial values if editing
        if (initialValues) {
          const formattedValues = { ...initialValues };
          
          // Dates in Ant Design Form need to be dayjs objects. Values arrive
          // as dd/mm/yyyy (DATE) or 'dd/mm/yyyy HH:mm' (DATETIME) — parse
          // with an explicit format, since bare dayjs(str) misparses slashes.
          res.data.data.sections.forEach(sec => {
            sec.fields.forEach(field => {
              if (field.field_type === 'DATE' && initialValues[field.field_key]) {
                formattedValues[field.field_key] = dayjs(initialValues[field.field_key], 'DD/MM/YYYY');
              } else if (field.field_type === 'DATETIME' && initialValues[field.field_key]) {
                formattedValues[field.field_key] = dayjs(initialValues[field.field_key], 'DD/MM/YYYY HH:mm');
              }
            });
          });
          form.setFieldsValue(formattedValues);
        } else {
          form.resetFields();
        }
      } catch (err) {
        console.error('Failed to load form schema:', err);
        setError(t('common.error') + ': ' + (err.response?.data?.message || err.message));
      } finally {
        setLoadingSchema(false);
      }
    };

    fetchSchema();
  }, [recordType, initialValues, form, t]);

  const handleFinish = (values) => {
    // Format values back before submitting (DatePicker -> dd/mm/yyyy string)
    const formattedValues = { ...values };
    sections.forEach(sec => {
      sec.fields.forEach(field => {
        if (formattedValues[field.field_key]) {
          if (field.field_type === 'DATE') {
            formattedValues[field.field_key] = dayjs(formattedValues[field.field_key]).format('DD/MM/YYYY');
          } else if (field.field_type === 'DATETIME') {
            formattedValues[field.field_key] = dayjs(formattedValues[field.field_key]).format('DD/MM/YYYY HH:mm');
          }
        }
      });
    });
    onSubmit(formattedValues);
  };

  if (loadingSchema) {
    return (
      <div style={{ textAlign: 'center', padding: '50px 0' }}>
        <Spin size="large" tip={t('common.loading')} />
      </div>
    );
  }

  if (error) {
    return <Alert type="error" message={error} style={{ marginBottom: 20 }} />;
  }

  const renderFieldInput = (field) => {
    const label = currentLanguage === 'hi' ? field.label_hi : field.label_en;
    
    switch (field.field_type.toUpperCase()) {
      case 'TEXTAREA':
        return <Input.TextArea placeholder={label} rows={4} />;
      case 'NUMBER':
        return <InputNumber style={{ width: '100%' }} placeholder={label} />;
      case 'DATE':
        return <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />;
      case 'DATETIME':
        return <DatePicker style={{ width: '100%' }} showTime={{ format: 'HH:mm' }} format="DD/MM/YYYY HH:mm" />;
      case 'SELECT':
      case 'DROPDOWN':
        const options = field.options || [];
        return (
          <Select placeholder={label} allowClear>
            {options.map((opt) => (
              <Option key={opt.value} value={opt.value}>
                {currentLanguage === 'hi' ? opt.label_hi : opt.label_en}
              </Option>
            ))}
          </Select>
        );
      case 'BOOLEAN':
        return <Switch checkedChildren="Yes" unCheckedChildren="No" />;
      case 'TEXT':
      default:
        return <Input placeholder={label} />;
    }
  };

  return (
    <Form
      form={form}
      layout="vertical"
      onFinish={handleFinish}
      requiredMark="optional"
    >
      {sections.map((sec) => (
        <Card
          key={sec.section}
          title={sec.section}
          style={{ marginBottom: 20, background: '#141923', border: '1px solid #232d3f' }}
          headStyle={{ color: '#fff', borderBottom: '1px solid #232d3f' }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' }}>
            {sec.fields.map((field) => {
              const label = currentLanguage === 'hi' ? field.label_hi : field.label_en;
              const rules = [];
              
              if (field.validation?.required) {
                rules.push({ required: true, message: `${label} is required` });
              }

              // Special styles for full width items like textarea
              const isFullWidth = field.field_type.toUpperCase() === 'TEXTAREA' || field.field_key === 'brief_facts';

              if (field.show_when && field.show_when.field) {
                const targetField = field.show_when.field;
                const targetValue = field.show_when.value;

                return (
                  <Form.Item
                    noStyle
                    key={field.id}
                    dependencies={[targetField]}
                  >
                    {({ getFieldValue }) => {
                      const val = getFieldValue(targetField);
                      const isMatch = Array.isArray(targetValue)
                        ? targetValue.map(v => String(v || '').toLowerCase()).includes(String(val || '').toLowerCase())
                        : String(val || '').toLowerCase() === String(targetValue || '').toLowerCase();

                      if (!isMatch) {
                        return null;
                      }

                      return (
                        <div style={{ gridColumn: isFullWidth ? '1 / -1' : 'auto' }}>
                          <Form.Item
                            name={field.field_key}
                            label={<span style={{ color: '#c3cbd6' }}>{label}</span>}
                            rules={rules}
                            valuePropName={field.field_type.toUpperCase() === 'BOOLEAN' ? 'checked' : 'value'}
                            preserve={false}
                          >
                            {renderFieldInput(field)}
                          </Form.Item>
                        </div>
                      );
                    }}
                  </Form.Item>
                );
              }

              return (
                <ConditionalFormItem key={field.id} field={field} form={form} currentLanguage={currentLanguage}>
                  <div style={{ gridColumn: isFullWidth ? '1 / -1' : 'auto' }}>
                    <Form.Item
                      name={field.field_key}
                      label={<span style={{ color: '#c3cbd6' }}>{label}</span>}
                      rules={rules}
                      valuePropName={field.field_type.toUpperCase() === 'BOOLEAN' ? 'checked' : 'value'}
                    >
                      {renderFieldInput(field)}
                    </Form.Item>
                  </div>
                </ConditionalFormItem>
              );
            })}
          </div>
        </Card>
      ))}

      <Form.Item style={{ marginTop: 30 }}>
        <Space size="middle">
          <Button type="primary" htmlType="submit" loading={loadingSubmit}>
            {initialValues ? t('common.save') : t('common.submit')}
          </Button>
          {onCancel && (
            <Button onClick={onCancel} style={{ background: '#1a202c', color: '#a0aec0', border: '1px solid #2d3748' }}>
              {t('common.cancel')}
            </Button>
          )}
        </Space>
      </Form.Item>
    </Form>
  );
};

export default DynamicForm;
