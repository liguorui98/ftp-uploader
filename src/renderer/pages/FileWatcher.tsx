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
  message,
  Typography,
  Tooltip,
  Popconfirm,
} from 'antd'
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  FolderOutlined,
  EyeOutlined,
} from '@ant-design/icons'
import { nanoid } from 'nanoid'

const { Title, Text } = Typography
const { Option } = Select

interface WatcherConfig {
  id: string
  name: string
  enabled: boolean
  watchPath: string
  serverId: string
  remotePath: string
  filePattern?: string
  autoUpload: boolean
  debounceMs: number
}

interface ServerConfig {
  id: string
  name: string
  type: string
}

const FileWatcher: React.FC = () => {
  const [watchers, setWatchers] = useState<WatcherConfig[]>([])
  const [servers, setServers] = useState<ServerConfig[]>([])
  const [editingWatcher, setEditingWatcher] = useState<WatcherConfig | null>(null)
  const [isModalVisible, setIsModalVisible] = useState(false)
  const [form] = Form.useForm()

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      if (window.electronAPI) {
        const [watchersData, serversData] = await Promise.all([
          window.electronAPI.getWatchers(),
          window.electronAPI.getServers(),
        ])
        setWatchers(watchersData)
        setServers(serversData)
      }
    } catch (error) {
      console.error('加载数据失败:', error)
    }
  }

  const handleAdd = () => {
    setEditingWatcher(null)
    form.resetFields()
    form.setFieldsValue({
      autoUpload: true,
      debounceMs: 2000,
    })
    setIsModalVisible(true)
  }

  const handleEdit = (watcher: WatcherConfig) => {
    setEditingWatcher(watcher)
    form.setFieldsValue(watcher)
    setIsModalVisible(true)
  }

  const handleDelete = async (id: string) => {
    try {
      if (window.electronAPI) {
        await window.electronAPI.removeWatcher(id)
        setWatchers((prev) => prev.filter((w) => w.id !== id))
        message.success('文件监控已删除')
      }
    } catch (error) {
      message.error('删除失败')
    }
  }

  const handleToggle = async (id: string, enabled: boolean) => {
    try {
      if (window.electronAPI) {
        await window.electronAPI.toggleWatcher(id, enabled)
        setWatchers((prev) =>
          prev.map((w) => (w.id === id ? { ...w, enabled } : w))
        )
        message.success(enabled ? '文件监控已启用' : '文件监控已禁用')
      }
    } catch (error) {
      message.error('操作失败')
    }
  }

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()

      const watcher: WatcherConfig = {
        id: editingWatcher?.id || nanoid(),
        name: values.name,
        enabled: editingWatcher?.enabled ?? true,
        watchPath: values.watchPath,
        serverId: values.serverId,
        remotePath: values.remotePath,
        filePattern: values.filePattern,
        autoUpload: values.autoUpload,
        debounceMs: values.debounceMs,
      }

      if (window.electronAPI) {
        if (editingWatcher) {
          await window.electronAPI.addWatcher(watcher)
          setWatchers((prev) =>
            prev.map((w) => (w.id === watcher.id ? watcher : w))
          )
          message.success('文件监控已更新')
        } else {
          await window.electronAPI.addWatcher(watcher)
          setWatchers((prev) => [...prev, watcher])
          message.success('文件监控已添加')
        }
      }

      setIsModalVisible(false)
      form.resetFields()
    } catch (error) {
      console.error('表单验证失败:', error)
    }
  }

  const handleSelectFolder = async (field: 'watchPath' | 'remotePath') => {
    try {
      if (window.electronAPI) {
        const folder = await window.electronAPI.selectFolder?.()
        if (folder) {
          form.setFieldsValue({ [field]: folder })
        }
      }
    } catch (error) {
      console.error('选择文件夹失败:', error)
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <Title level={4}>
          <FolderOutlined /> 文件监控
        </Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
          添加监控
        </Button>
      </div>

      {/* 监控列表 */}
      <List
        dataSource={watchers}
        locale={{ emptyText: '暂无文件监控' }}
        renderItem={(watcher) => (
          <Card style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ flex: 1 }}>
                <Space>
                  <Switch
                    checked={watcher.enabled}
                    onChange={(checked) => handleToggle(watcher.id, checked)}
                  />
                  <Text strong>{watcher.name}</Text>
                  <Tag color={watcher.enabled ? 'green' : 'default'}>
                    {watcher.enabled ? '监控中' : '已暂停'}
                  </Tag>
                  {watcher.autoUpload && (
                    <Tag color="blue">自动上传</Tag>
                  )}
                </Space>

                <div style={{ marginTop: 8 }}>
                  <Space size={16}>
                    <Text type="secondary">
                      <FolderOutlined /> 监控路径: {watcher.watchPath}
                    </Text>
                    <Text type="secondary">
                      服务器: {servers.find((s) => s.id === watcher.serverId)?.name || '未知'}
                    </Text>
                  </Space>
                </div>

                <div style={{ marginTop: 4 }}>
                  <Space size={16}>
                    <Text type="secondary">
                      远程路径: {watcher.remotePath}
                    </Text>
                    {watcher.filePattern && (
                      <Text type="secondary">
                        文件模式: {watcher.filePattern}
                      </Text>
                    )}
                    <Text type="secondary">
                      防抖时间: {watcher.debounceMs}ms
                    </Text>
                  </Space>
                </div>
              </div>

              <Space>
                <Tooltip title="编辑">
                  <Button
                    type="text"
                    icon={<EditOutlined />}
                    onClick={() => handleEdit(watcher)}
                  />
                </Tooltip>
                <Popconfirm
                  title="确定要删除这个文件监控吗？"
                  onConfirm={() => handleDelete(watcher.id)}
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
        title={editingWatcher ? '编辑文件监控' : '添加文件监控'}
        open={isModalVisible}
        onOk={handleSubmit}
        onCancel={() => setIsModalVisible(false)}
        width={600}
        okText="保存"
        cancelText="取消"
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="name"
            label="监控名称"
            rules={[{ required: true, message: '请输入监控名称' }]}
          >
            <Input placeholder="例如：数据文件监控" />
          </Form.Item>

          <Form.Item
            name="watchPath"
            label="监控文件夹路径"
            rules={[{ required: true, message: '请选择监控路径' }]}
          >
            <Space.Compact style={{ width: '100%' }}>
              <Input placeholder="选择要监控的文件夹" />
              <Button onClick={() => handleSelectFolder('watchPath')}>选择</Button>
            </Space.Compact>
          </Form.Item>

          <Form.Item
            name="serverId"
            label="目标服务器"
            rules={[{ required: true, message: '请选择服务器' }]}
          >
            <Select placeholder="选择服务器">
              {servers.map((server) => (
                <Option key={server.id} value={server.id}>
                  {server.name} ({server.type.toUpperCase()})
                </Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            name="remotePath"
            label="远程目标路径"
            rules={[{ required: true, message: '请输入远程路径' }]}
          >
            <Space.Compact style={{ width: '100%' }}>
              <Input placeholder="/uploads/watched" />
              <Button onClick={() => handleSelectFolder('remotePath')}>选择</Button>
            </Space.Compact>
          </Form.Item>

          <Form.Item name="filePattern" label="文件匹配模式">
            <Input placeholder="例如：*.csv, data_*.txt（可选，留空则监控所有文件）" />
          </Form.Item>

          <Form.Item
            name="autoUpload"
            label="自动上传"
            valuePropName="checked"
          >
            <Switch checkedChildren="开启" unCheckedChildren="关闭" />
          </Form.Item>

          <Form.Item
            name="debounceMs"
            label="防抖时间（毫秒）"
            extra="等待文件写入完成后再上传"
          >
            <InputNumber
              min={500}
              max={30000}
              step={500}
              style={{ width: '100%' }}
              addonAfter="毫秒"
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default FileWatcher
