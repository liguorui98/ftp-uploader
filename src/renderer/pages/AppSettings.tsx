import React, { useState, useEffect } from 'react'
import {
  Card,
  Form,
  Input,
  InputNumber,
  Select,
  Switch,
  Button,
  Space,
  Typography,
  Divider,
  App,
  Tabs,
  Upload,
  Row,
  Col,
  Descriptions,
} from 'antd'
import {
  SettingOutlined,
  SaveOutlined,
  UploadOutlined,
  DownloadOutlined,
} from '@ant-design/icons'
import iconPng from '../assets/icon.png'

const { Title, Text, Paragraph } = Typography
const { Option } = Select

interface AppSettings {
  maxConcurrency: number
  maxRetries: number
  retryDelayMs: number
  autoStart: boolean
  minimizeToTray: boolean
  defaultRemotePath: string
  logLevel: 'debug' | 'info' | 'warn' | 'error'
  notifications: boolean
  language: 'zh-CN' | 'en-US'
  theme: 'light' | 'dark' | 'system'
}

interface AppInfo {
  appVersion: string
  appName: string
  author: string
  description: string
  electronVersion: string
  nodeVersion: string
  chromeVersion: string
  platform: string
}

const AppSettings: React.FC = () => {
  const { message } = App.useApp()
  const [settings, setSettings] = useState<AppSettings>({
    maxConcurrency: 3,
    maxRetries: 3,
    retryDelayMs: 1000,
    autoStart: false,
    minimizeToTray: true,
    defaultRemotePath: '/uploads',
    logLevel: 'info',
    notifications: true,
    language: 'zh-CN',
    theme: 'system',
  })
  const [loading, setLoading] = useState(false)
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null)
  const [form] = Form.useForm()

  useEffect(() => {
    loadSettings()
    loadAppInfo()
  }, [])

  const loadSettings = async () => {
    try {
      if (window.electronAPI) {
        const data = await window.electronAPI.getSettings?.()
        if (data) {
          setSettings(data)
          form.setFieldsValue(data)
        }
      }
    } catch (error) {
      console.error('加载设置失败:', error)
    }
  }

  const loadAppInfo = async () => {
    try {
      if (window.electronAPI) {
        const info = await window.electronAPI.getAppInfo()
        setAppInfo(info)
      }
    } catch (error) {
      console.error('加载应用信息失败:', error)
    }
  }

  const handleSave = async () => {
    setLoading(true)
    try {
      const values = await form.validateFields()

      if (window.electronAPI) {
        await window.electronAPI.updateSettings?.(values)
        setSettings(values)
        message.success('设置已保存')
      }
    } catch (error) {
      console.error('保存设置失败:', error)
      message.error('保存失败')
    } finally {
      setLoading(false)
    }
  }

  const handleExportConfig = async () => {
    try {
      if (window.electronAPI) {
        const config = await window.electronAPI.exportConfig?.()
        if (config) {
          const blob = new Blob([config], { type: 'application/json' })
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url
          a.download = 'ftp-uploader-config.json'
          a.click()
          URL.revokeObjectURL(url)
          message.success('配置已导出')
        }
      }
    } catch (error) {
      message.error('导出失败')
    }
  }

  const handleImportConfig = async (file: File) => {
    try {
      const text = await file.text()
      if (window.electronAPI) {
        const success = await window.electronAPI.importConfig?.(text)
        if (success) {
          message.success('配置已导入')
          loadSettings()
        } else {
          message.error('导入失败：配置格式错误')
        }
      }
    } catch (error) {
      message.error('导入失败')
    }
    return false
  }

  const items = [
    {
      key: 'general',
      label: '通用设置',
      children: (
        <div>
          <Form.Item name="language" label="语言">
            <Select>
              <Option value="zh-CN">简体中文</Option>
              <Option value="en-US">English</Option>
            </Select>
          </Form.Item>

          <Form.Item name="theme" label="主题">
            <Select>
              <Option value="light">浅色</Option>
              <Option value="dark">深色</Option>
              <Option value="system">跟随系统</Option>
            </Select>
          </Form.Item>

          <Form.Item name="autoStart" label="开机自启" valuePropName="checked">
            <Switch />
          </Form.Item>

          <Form.Item name="minimizeToTray" label="最小化到托盘" valuePropName="checked">
            <Switch />
          </Form.Item>

          <Form.Item name="notifications" label="系统通知" valuePropName="checked">
            <Switch />
          </Form.Item>
        </div>
      ),
    },
    {
      key: 'transfer',
      label: '传输设置',
      children: (
        <div>
          <Form.Item name="maxConcurrency" label="最大并发传输数" rules={[{ required: true, message: '请输入并发数' }]}>
            <InputNumber min={1} max={10} style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item name="maxRetries" label="最大重试次数" rules={[{ required: true, message: '请输入重试次数' }]}>
            <InputNumber min={0} max={10} style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item name="retryDelayMs" label="重试间隔（毫秒）" rules={[{ required: true, message: '请输入重试间隔' }]}>
            <InputNumber min={500} max={60000} step={500} style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item name="defaultRemotePath" label="默认远程路径">
            <Input placeholder="/uploads" />
          </Form.Item>
        </div>
      ),
    },
    {
      key: 'advanced',
      label: '高级设置',
      children: (
        <div>
          <Form.Item name="logLevel" label="日志级别">
            <Select>
              <Option value="debug">Debug</Option>
              <Option value="info">Info</Option>
              <Option value="warn">Warning</Option>
              <Option value="error">Error</Option>
            </Select>
          </Form.Item>

          <Divider />

          <Title level={5}>配置管理</Title>
          <Paragraph type="secondary">
            导出或导入应用配置，方便在不同设备间同步设置。
          </Paragraph>

          <Space>
            <Button icon={<DownloadOutlined />} onClick={handleExportConfig}>
              导出配置
            </Button>
            <Upload
              accept=".json"
              showUploadList={false}
              beforeUpload={handleImportConfig}
            >
              <Button icon={<UploadOutlined />}>导入配置</Button>
            </Upload>
          </Space>
        </div>
      ),
    },
    {
      key: 'about',
      label: '关于',
      children: (
        <div>
          <Row align="middle" gutter={24} style={{ marginBottom: 24 }}>
            <Col>
              <img
                src={iconPng}
                alt="App Icon"
                style={{ width: 80, height: 80, borderRadius: 16 }}
              />
            </Col>
            <Col>
              <Title level={4} style={{ marginBottom: 4 }}>FTP Uploader</Title>
              <Paragraph style={{ marginBottom: 4 }}>
                版本: {appInfo?.appVersion || '加载中...'}
              </Paragraph>
              {appInfo?.author && (
                <Text type="secondary">作者: {appInfo.author}</Text>
              )}
            </Col>
          </Row>

          <Paragraph type="secondary">
            {appInfo?.description || '一个跨平台的FTP/SFTP文件自动上传桌面应用，支持定时上传、文件监控和手动上传。'}
          </Paragraph>

          <Divider />

          <Title level={5}>运行环境</Title>
          <Descriptions column={1} size="small" style={{ marginBottom: 16 }}>
            <Descriptions.Item label="Electron">
              {appInfo?.electronVersion || '-'}
            </Descriptions.Item>
            <Descriptions.Item label="Node.js">
              {appInfo?.nodeVersion || '-'}
            </Descriptions.Item>
            <Descriptions.Item label="Chrome">
              {appInfo?.chromeVersion || '-'}
            </Descriptions.Item>
            <Descriptions.Item label="平台">
              {appInfo?.platform || '-'}
            </Descriptions.Item>
          </Descriptions>

          <Divider />

          <Title level={5}>技术栈</Title>
          <ul>
            <li>Electron + React + TypeScript</li>
            <li>Ant Design UI组件库</li>
            <li>basic-ftp (FTP客户端)</li>
            <li>ssh2-sftp-client (SFTP客户端)</li>
            <li>chokidar (文件监控)</li>
            <li>node-cron (定时调度)</li>
          </ul>

          <Divider />

          <Title level={5}>功能特性</Title>
          <ul>
            <li>支持FTP和SFTP协议</li>
            <li>定时上传（间隔、每日、每周、Cron）</li>
            <li>文件夹监控自动上传</li>
            <li>手动选择文件/文件夹上传</li>
            <li>传输队列和并发控制</li>
            <li>失败自动重试</li>
            <li>跨平台支持（macOS和Windows）</li>
          </ul>
        </div>
      ),
    },
  ]

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <Title level={4}>
          <SettingOutlined /> 应用设置
        </Title>
        <Button
          type="primary"
          icon={<SaveOutlined />}
          loading={loading}
          onClick={handleSave}
        >
          保存设置
        </Button>
      </div>

      <Card>
        <Form form={form} initialValues={settings}>
          <Tabs items={items} />
        </Form>
      </Card>
    </div>
  )
}

export default AppSettings
