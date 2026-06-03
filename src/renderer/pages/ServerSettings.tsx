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
  CheckCircleOutlined,
  CloudServerOutlined,
  ApiOutlined,
} from '@ant-design/icons'
import { nanoid } from 'nanoid'

const { Title, Text } = Typography
const { Option } = Select

interface ServerConfig {
  id: string
  name: string
  type: 'ftp' | 'sftp'
  host: string
  port: number
  username: string
  password: string
  privateKeyPath?: string
  passphrase?: string
  remotePath: string
  timeout: number
  encoding?: string
  ftpOptions?: {
    passive: boolean
    secure: boolean | 'implicit'
  }
}

const ServerSettings: React.FC = () => {
  const [servers, setServers] = useState<ServerConfig[]>([])
  const [editingServer, setEditingServer] = useState<ServerConfig | null>(null)
  const [isModalVisible, setIsModalVisible] = useState(false)
  const [testing, setTesting] = useState<string | null>(null)
  const [form] = Form.useForm()

  useEffect(() => {
    loadServers()
  }, [])

  const loadServers = async () => {
    try {
      if (window.electronAPI) {
        const data = await window.electronAPI.getServers()
        setServers(data)
      }
    } catch (error) {
      console.error('加载服务器配置失败:', error)
    }
  }

  const handleAdd = () => {
    setEditingServer(null)
    form.resetFields()
    form.setFieldsValue({
      type: 'sftp',
      port: 22,
      remotePath: '/uploads',
      timeout: 30000,
      ftpOptions: {
        passive: true,
        secure: false,
      },
    })
    setIsModalVisible(true)
  }

  const handleEdit = (server: ServerConfig) => {
    setEditingServer(server)
    form.setFieldsValue(server)
    setIsModalVisible(true)
  }

  const handleDelete = async (id: string) => {
    try {
      if (window.electronAPI) {
        await window.electronAPI.deleteServer(id)
        setServers((prev) => prev.filter((s) => s.id !== id))
        message.success('服务器已删除')
      }
    } catch (error) {
      message.error('删除失败')
    }
  }

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()

      const server: ServerConfig = {
        id: editingServer?.id || nanoid(),
        ...values,
        port: values.port || (values.type === 'ftp' ? 21 : 22),
      }

      if (window.electronAPI) {
        await window.electronAPI.saveServer(server)

        if (editingServer) {
          setServers((prev) => prev.map((s) => (s.id === server.id ? server : s)))
          message.success('服务器已更新')
        } else {
          setServers((prev) => [...prev, server])
          message.success('服务器已添加')
        }
      }

      setIsModalVisible(false)
      form.resetFields()
    } catch (error) {
      console.error('表单验证失败:', error)
    }
  }

  const handleTestConnection = async (server: ServerConfig) => {
    setTesting(server.id)

    try {
      if (window.electronAPI) {
        const result = await window.electronAPI.testConnection(server)

        if (result) {
          message.success('连接测试成功')
        } else {
          message.error('连接测试失败')
        }
      }
    } catch (error) {
      message.error('连接测试失败')
    } finally {
      setTesting(null)
    }
  }

  const handleSelectPrivateKey = async () => {
    try {
      if (window.electronAPI) {
        const path = await window.electronAPI.selectFiles?.()
        if (path && path.length > 0) {
          form.setFieldsValue({ privateKeyPath: path[0] })
        }
      }
    } catch (error) {
      console.error('选择私钥文件失败:', error)
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <Title level={4}>
          <CloudServerOutlined /> 服务器配置
        </Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
          添加服务器
        </Button>
      </div>

      {/* 服务器列表 */}
      <List
        grid={{ gutter: 16, column: 2 }}
        dataSource={servers}
        locale={{ emptyText: '暂无服务器配置' }}
        renderItem={(server) => (
          <List.Item>
            <Card
              actions={[
                <Tooltip title="测试连接" key="test">
                  <Button
                    type="text"
                    icon={<ApiOutlined />}
                    loading={testing === server.id}
                    onClick={() => handleTestConnection(server)}
                  />
                </Tooltip>,
                <Tooltip title="编辑" key="edit">
                  <Button
                    type="text"
                    icon={<EditOutlined />}
                    onClick={() => handleEdit(server)}
                  />
                </Tooltip>,
                <Popconfirm
                  key="delete"
                  title="确定要删除这个服务器吗？"
                  onConfirm={() => handleDelete(server.id)}
                >
                  <Tooltip title="删除">
                    <Button type="text" danger icon={<DeleteOutlined />} />
                  </Tooltip>
                </Popconfirm>,
              ]}
            >
              <Card.Meta
                avatar={
                  <div
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: 8,
                      background: server.type === 'sftp' ? '#e6f7ff' : '#fff7e6',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <CloudServerOutlined
                      style={{
                        fontSize: 24,
                        color: server.type === 'sftp' ? '#1890ff' : '#fa8c16',
                      }}
                    />
                  </div>
                }
                title={
                  <Space>
                    <Text strong>{server.name}</Text>
                    <Tag color={server.type === 'sftp' ? 'blue' : 'orange'}>
                      {server.type.toUpperCase()}
                    </Tag>
                  </Space>
                }
                description={
                  <Space direction="vertical" size={0}>
                    <Text type="secondary">{server.host}:{server.port}</Text>
                    <Text type="secondary">用户: {server.username}</Text>
                    <Text type="secondary">远程路径: {server.remotePath}</Text>
                  </Space>
                }
              />
            </Card>
          </List.Item>
        )}
      />

      {/* 添加/编辑模态框 */}
      <Modal
        title={editingServer ? '编辑服务器' : '添加服务器'}
        open={isModalVisible}
        onOk={handleSubmit}
        onCancel={() => setIsModalVisible(false)}
        width={600}
        okText="保存"
        cancelText="取消"
      >
        <Form
          form={form}
          layout="vertical"
          className="server-form"
        >
          <Form.Item
            name="name"
            label="服务器名称"
            rules={[{ required: true, message: '请输入服务器名称' }]}
          >
            <Input placeholder="例如：生产服务器" />
          </Form.Item>

          <Form.Item
            name="type"
            label="服务器类型"
            rules={[{ required: true, message: '请选择服务器类型' }]}
          >
            <Select>
              <Option value="ftp">FTP</Option>
              <Option value="sftp">SFTP</Option>
            </Select>
          </Form.Item>

          <Space style={{ width: '100%' }} size={16}>
            <Form.Item
              name="host"
              label="主机地址"
              rules={[{ required: true, message: '请输入主机地址' }]}
              style={{ flex: 1 }}
            >
              <Input placeholder="例如：192.168.1.100" />
            </Form.Item>

            <Form.Item
              name="port"
              label="端口"
              rules={[{ required: true, message: '请输入端口' }]}
            >
              <InputNumber min={1} max={65535} style={{ width: 120 }} />
            </Form.Item>
          </Space>

          <Space style={{ width: '100%' }} size={16}>
            <Form.Item
              name="username"
              label="用户名"
              rules={[{ required: true, message: '请输入用户名' }]}
              style={{ flex: 1 }}
            >
              <Input placeholder="请输入用户名" />
            </Form.Item>

            <Form.Item
              name="password"
              label="密码"
              style={{ flex: 1 }}
            >
              <Input.Password placeholder="请输入密码" />
            </Form.Item>
          </Space>

          <Form.Item
            noStyle
            shouldUpdate={(prevValues, currentValues) => prevValues.type !== currentValues.type}
          >
            {({ getFieldValue }) =>
              getFieldValue('type') === 'sftp' && (
                <>
                  <Form.Item name="privateKeyPath" label="私钥文件路径">
                    <Space.Compact style={{ width: '100%' }}>
                      <Input placeholder="选择私钥文件（可选）" />
                      <Button onClick={handleSelectPrivateKey}>选择</Button>
                    </Space.Compact>
                  </Form.Item>

                  <Form.Item name="passphrase" label="私钥密码">
                    <Input.Password placeholder="如果私钥有密码保护，请输入" />
                  </Form.Item>
                </>
              )
            }
          </Form.Item>

          <Form.Item
            name="remotePath"
            label="远程路径"
            rules={[{ required: true, message: '请输入远程路径' }]}
          >
            <Input placeholder="例如：/uploads" />
          </Form.Item>

          <Form.Item name="timeout" label="超时时间（毫秒）">
            <InputNumber min={5000} max={300000} step={1000} style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item
            noStyle
            shouldUpdate={(prevValues, currentValues) => prevValues.type !== currentValues.type}
          >
            {({ getFieldValue }) =>
              getFieldValue('type') === 'ftp' && (
                <>
                  <Form.Item
                    name={['ftpOptions', 'passive']}
                    label="被动模式"
                    valuePropName="checked"
                  >
                    <Switch />
                  </Form.Item>

                  <Form.Item
                    name={['ftpOptions', 'secure']}
                    label="加密方式"
                  >
                    <Select>
                      <Option value={false}>无加密</Option>
                      <Option value="implicit">隐式加密</Option>
                      <Option value={true}>显式加密</Option>
                    </Select>
                  </Form.Item>
                </>
              )
            }
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default ServerSettings
