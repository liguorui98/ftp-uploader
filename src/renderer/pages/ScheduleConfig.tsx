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
  List,
  Tag,
  Modal,
  App,
  Typography,
  TimePicker,
  Tooltip,
  Popconfirm,
  Tabs,
} from 'antd'
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  ClockCircleOutlined,
  PlayCircleOutlined,
  PauseCircleOutlined,
} from '@ant-design/icons'
import { nanoid } from 'nanoid'
import dayjs from 'dayjs'

const { Title, Text } = Typography
const { Option } = Select

interface ScheduleConfig {
  id: string
  name: string
  enabled: boolean
  serverId: string
  sourcePaths: string[]
  remotePath: string
  filePattern?: string
  deleteAfterUpload: boolean
  mode: 'interval' | 'cron' | 'daily' | 'weekly'
  intervalMinutes?: number
  cronExpression?: string
  dailyTime?: string
  weeklyDay?: number
  weeklyTime?: string
}

interface ServerConfig {
  id: string
  name: string
  type: string
}

const ScheduleConfig: React.FC = () => {
  const { message } = App.useApp()
  const [schedules, setSchedules] = useState<ScheduleConfig[]>([])
  const [servers, setServers] = useState<ServerConfig[]>([])
  const [editingSchedule, setEditingSchedule] = useState<ScheduleConfig | null>(null)
  const [isModalVisible, setIsModalVisible] = useState(false)
  const [form] = Form.useForm()
  const [activeMode, setActiveMode] = useState<string>('interval')

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      if (window.electronAPI) {
        const [schedulesData, serversData] = await Promise.all([
          window.electronAPI.getSchedules(),
          window.electronAPI.getServers(),
        ])
        setSchedules(schedulesData)
        setServers(serversData)
      }
    } catch (error) {
      console.error('加载数据失败:', error)
    }
  }

  const handleAdd = () => {
    setEditingSchedule(null)
    form.resetFields()
    setActiveMode('interval')
    form.setFieldsValue({
      mode: 'interval',
      intervalMinutes: 5,
      deleteAfterUpload: false,
    })
    setIsModalVisible(true)
  }

  const handleEdit = (schedule: ScheduleConfig) => {
    setEditingSchedule(schedule)
    setActiveMode(schedule.mode || 'interval')
    form.setFieldsValue({
      ...schedule,
      sourcePaths: Array.isArray(schedule.sourcePaths) ? schedule.sourcePaths.join('\n') : schedule.sourcePaths,
      dailyTime: schedule.dailyTime ? dayjs(schedule.dailyTime, 'HH:mm') : undefined,
      weeklyTime: schedule.weeklyTime ? dayjs(schedule.weeklyTime, 'HH:mm') : undefined,
    })
    setIsModalVisible(true)
  }

  const handleDelete = async (id: string) => {
    try {
      if (window.electronAPI) {
        await window.electronAPI.deleteSchedule(id)
        setSchedules((prev) => prev.filter((s) => s.id !== id))
        message.success('定时任务已删除')
      }
    } catch (error) {
      message.error('删除失败')
    }
  }

  const handleToggle = async (id: string, enabled: boolean) => {
    try {
      if (window.electronAPI) {
        await window.electronAPI.toggleSchedule(id, enabled)
        setSchedules((prev) =>
          prev.map((s) => (s.id === id ? { ...s, enabled } : s))
        )
        message.success(enabled ? '定时任务已启用' : '定时任务已禁用')
      }
    } catch (error) {
      message.error('操作失败')
    }
  }

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()

      const schedule: ScheduleConfig = {
        id: editingSchedule?.id || nanoid(),
        name: values.name,
        enabled: editingSchedule?.enabled ?? true,
        serverId: values.serverId,
        sourcePaths: values.sourcePaths ? values.sourcePaths.split('\n').filter(Boolean) : [],
        remotePath: values.remotePath,
        filePattern: values.filePattern,
        deleteAfterUpload: values.deleteAfterUpload,
        mode: activeMode as ScheduleConfig['mode'],
        intervalMinutes: values.intervalMinutes,
        cronExpression: values.cronExpression,
        dailyTime: values.dailyTime?.format('HH:mm'),
        weeklyDay: values.weeklyDay,
        weeklyTime: values.weeklyTime?.format('HH:mm'),
      }

      if (window.electronAPI) {
        await window.electronAPI.saveSchedule(schedule)

        if (editingSchedule) {
          setSchedules((prev) =>
            prev.map((s) => (s.id === schedule.id ? schedule : s))
          )
          message.success('定时任务已更新')
        } else {
          setSchedules((prev) => [...prev, schedule])
          message.success('定时任务已添加')
        }
      }

      setIsModalVisible(false)
      form.resetFields()
    } catch (error) {
      console.error('表单验证失败:', error)
      message.error('保存失败: ' + (error instanceof Error ? error.message : String(error)))
    }
  }

  const handleSelectFolder = async () => {
    try {
      if (window.electronAPI) {
        const folder = await window.electronAPI.selectFolder?.()
        if (folder) {
          const currentPaths = form.getFieldValue('sourcePaths') || ''
          form.setFieldsValue({
            sourcePaths: currentPaths ? `${currentPaths}\n${folder}` : folder,
          })
        }
      }
    } catch (error) {
      console.error('选择文件夹失败:', error)
    }
  }

  const handleSelectFiles = async () => {
    try {
      if (window.electronAPI) {
        const files = await window.electronAPI.selectFiles()
        if (files && files.length > 0) {
          const currentPaths = form.getFieldValue('sourcePaths') || ''
          const newPaths = files.join('\n')
          form.setFieldsValue({
            sourcePaths: currentPaths ? `${currentPaths}\n${newPaths}` : newPaths,
          })
        }
      }
    } catch (error) {
      console.error('选择文件失败:', error)
    }
  }

  const getModeLabel = (mode: string) => {
    switch (mode) {
      case 'interval': return '间隔模式'
      case 'cron': return 'Cron模式'
      case 'daily': return '每日模式'
      case 'weekly': return '每周模式'
      default: return mode
    }
  }

  const getScheduleDescription = (schedule: ScheduleConfig) => {
    switch (schedule.mode) {
      case 'interval':
        return `每 ${schedule.intervalMinutes} 分钟执行一次`
      case 'cron':
        return `Cron: ${schedule.cronExpression}`
      case 'daily':
        return `每天 ${schedule.dailyTime} 执行`
      case 'weekly': {
        const days = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
        return `每${days[schedule.weeklyDay || 0]} ${schedule.weeklyTime} 执行`
      }
      default:
        return '未配置'
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <Title level={4}>
          <ClockCircleOutlined /> 定时任务
        </Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
          添加定时任务
        </Button>
      </div>

      {/* 定时任务列表 */}
      <List
        dataSource={schedules}
        locale={{ emptyText: '暂无定时任务' }}
        renderItem={(schedule) => (
          <Card style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ flex: 1 }}>
                <Space>
                  <Switch
                    checked={schedule.enabled}
                    onChange={(checked) => handleToggle(schedule.id, checked)}
                  />
                  <Text strong>{schedule.name}</Text>
                  <Tag color={schedule.enabled ? 'green' : 'default'}>
                    {schedule.enabled ? '已启用' : '已禁用'}
                  </Tag>
                </Space>

                <div style={{ marginTop: 8 }}>
                  <Space size={16}>
                    <Text type="secondary">
                      服务器: {servers.find((s) => s.id === schedule.serverId)?.name || '未知'}
                    </Text>
                    <Text type="secondary">
                      模式: {getModeLabel(schedule.mode)}
                    </Text>
                    <Text type="secondary">
                      {getScheduleDescription(schedule)}
                    </Text>
                  </Space>
                </div>

                <div style={{ marginTop: 8 }}>
                  <Text type="secondary">
                    源路径: {schedule.sourcePaths?.join(', ')}
                  </Text>
                </div>

                <div style={{ marginTop: 4 }}>
                  <Text type="secondary">
                    远程路径: {schedule.remotePath}
                  </Text>
                  {schedule.filePattern && (
                    <Text type="secondary" style={{ marginLeft: 16 }}>
                      文件模式: {schedule.filePattern}
                    </Text>
                  )}
                </div>
              </div>

              <Space>
                <Tooltip title="编辑">
                  <Button
                    type="text"
                    icon={<EditOutlined />}
                    onClick={() => handleEdit(schedule)}
                  />
                </Tooltip>
                <Popconfirm
                  title="确定要删除这个定时任务吗？"
                  onConfirm={() => handleDelete(schedule.id)}
                >
                  <Tooltip title="删除">
                    <Button type="text" danger icon={<DeleteOutlined />} />
                  </Tooltip>
                </Popconfirm>
              </Space>
            </div>
          </Card>
        )}
      />

      {/* 添加/编辑模态框 */}
      <Modal
        title={editingSchedule ? '编辑定时任务' : '添加定时任务'}
        open={isModalVisible}
        onOk={handleSubmit}
        onCancel={() => setIsModalVisible(false)}
        width={700}
        okText="保存"
        cancelText="取消"
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="name"
            label="任务名称"
            rules={[{ required: true, message: '请输入任务名称' }]}
          >
            <Input placeholder="例如：每日备份" />
          </Form.Item>

          <Form.Item
            name="serverId"
            label="目标服务器"
            rules={[{ required: true, message: '请选择服务器' }]}
          >
            <Select placeholder="选择服务器">
              {servers.map((server) => (
                <Option key={server.id} value={server.id}>
                  {server.name || '未知服务器'} ({server.type?.toUpperCase() || 'FTP'})
                </Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            name="sourcePaths"
            label="源文件/文件夹路径"
            rules={[{ required: true, message: '请输入源路径' }]}
            extra="每行一个路径，支持文件和文件夹"
          >
            <Input.TextArea
              rows={3}
              placeholder="/path/to/folder&#10;/path/to/file.csv"
            />
          </Form.Item>

          <Space style={{ marginBottom: 16, width: '100%' }}>
            <Button
              type="dashed"
              onClick={handleSelectFolder}
              style={{ flex: 1 }}
              block
            >
              选择文件夹
            </Button>
            <Button
              type="dashed"
              onClick={handleSelectFiles}
              style={{ flex: 1 }}
              block
            >
              选择文件
            </Button>
          </Space>

          <Form.Item
            name="remotePath"
            label="远程目标路径"
            rules={[{ required: true, message: '请输入远程路径' }]}
          >
            <Input placeholder="/uploads/backup" />
          </Form.Item>

          <Form.Item name="filePattern" label="文件匹配模式">
            <Input placeholder="例如：*.csv, data_*.txt（可选）" />
          </Form.Item>

          <Form.Item
            label="调度模式"
            required
          >
            <Tabs
              activeKey={activeMode}
              items={[
                {
                  key: 'interval',
                  label: '间隔模式',
                  children: (
                    <Space.Compact style={{ width: '100%' }}>
                      <Form.Item name="intervalMinutes" noStyle>
                        <InputNumber
                          min={1}
                          max={1440}
                          placeholder="分钟"
                          style={{ flex: 1 }}
                        />
                      </Form.Item>
                      <span style={{ padding: '0 11px', lineHeight: '30px', background: '#fafafa', border: '1px solid #d9d9d9', borderLeft: 0, borderRadius: '0 6px 6px 0' }}>分钟</span>
                    </Space.Compact>
                  ),
                },
                {
                  key: 'daily',
                  label: '每日模式',
                  children: (
                    <Form.Item name="dailyTime" noStyle>
                      <TimePicker format="HH:mm" style={{ width: '100%' }} />
                    </Form.Item>
                  ),
                },
                {
                  key: 'weekly',
                  label: '每周模式',
                  children: (
                    <Space style={{ width: '100%' }}>
                      <Form.Item name="weeklyDay" noStyle>
                        <Select style={{ width: 120 }} placeholder="选择星期">
                          <Option value={0}>周日</Option>
                          <Option value={1}>周一</Option>
                          <Option value={2}>周二</Option>
                          <Option value={3}>周三</Option>
                          <Option value={4}>周四</Option>
                          <Option value={5}>周五</Option>
                          <Option value={6}>周六</Option>
                        </Select>
                      </Form.Item>
                      <Form.Item name="weeklyTime" noStyle>
                        <TimePicker format="HH:mm" />
                      </Form.Item>
                    </Space>
                  ),
                },
                {
                  key: 'cron',
                  label: 'Cron模式',
                  children: (
                    <Form.Item name="cronExpression" noStyle>
                      <Input placeholder="例如：0 2 * * *（每天凌晨2点）" />
                    </Form.Item>
                  ),
                },
              ]}
              onChange={(key) => { setActiveMode(key); form.setFieldsValue({ mode: key }) }}
            />
          </Form.Item>

          <Form.Item
            name="deleteAfterUpload"
            label="上传后操作"
            valuePropName="checked"
          >
            <Switch checkedChildren="删除本地文件" unCheckedChildren="保留本地文件" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default ScheduleConfig
