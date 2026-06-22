import React, { useState, useEffect, useCallback } from 'react'
import {
  Card,
  Table,
  Tag,
  Space,
  Button,
  Input,
  Select,
  DatePicker,
  Typography,
  Tooltip,
  Popconfirm,
  App,
  List,
  Progress,
} from 'antd'
import {
  CloudUploadOutlined,
  SearchOutlined,
  ReloadOutlined,
  DeleteOutlined,
  RedoOutlined,
  FolderOpenOutlined,
  InboxOutlined,
  UploadOutlined,
  CloseOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'

const { Title, Text } = Typography
const { RangePicker } = DatePicker
const { Option } = Select

interface TransferTask {
  id: string
  serverId: string
  serverName: string
  folderName?: string
  files: Array<{
    localPath: string
    remotePath: string
    fileName: string
    fileSize: number
    transferred: number
    status: string
  }>
  status: string
  progress: number
  startTime?: number
  endTime?: number
  error?: string
  retryCount: number
}

interface SelectedFile {
  path: string
  name: string
  size: number
}

interface ServerOption {
  id: string
  name: string
  type: string
  remotePath: string
}

interface ProgressInfo {
  speed: number
  elapsedTime: number
  estimatedTimeRemaining: number
  totalTransferred: number
  totalSize: number
}

const formatSpeed = (bytesPerSecond: number): string => {
  if (bytesPerSecond === 0) return '...'
  if (bytesPerSecond < 1024) return `${bytesPerSecond} B/s`
  if (bytesPerSecond < 1024 * 1024) return `${(bytesPerSecond / 1024).toFixed(1)} KB/s`
  return `${(bytesPerSecond / (1024 * 1024)).toFixed(1)} MB/s`
}

const formatDurationMs = (ms: number): string => {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  const minutes = Math.floor(ms / 60000)
  const seconds = Math.round((ms % 60000) / 1000)
  return `${minutes}m ${seconds}s`
}

const formatBytesShort = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

const TransferList: React.FC = () => {
  const { message } = App.useApp()
  const [transfers, setTransfers] = useState<TransferTask[]>([])
  const [filteredTransfers, setFilteredTransfers] = useState<TransferTask[]>([])
  const [loading, setLoading] = useState(false)
  const [filters, setFilters] = useState({
    status: 'all',
    search: '',
    dateRange: null as [dayjs.Dayjs, dayjs.Dayjs] | null,
  })
  const [progressData, setProgressData] = useState<Record<string, ProgressInfo>>({})

  // 上传相关状态
  const [selectedFiles, setSelectedFiles] = useState<SelectedFile[]>([])
  const [selectedServerId, setSelectedServerId] = useState<string | undefined>(undefined)
  const [remotePath, setRemotePath] = useState('')
  const [servers, setServers] = useState<ServerOption[]>([])
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [folderSelections, setFolderSelections] = useState<Array<{
    folderPath: string
    folderName: string
    files: Array<{ filePath: string; relativePath: string }>
  }>>([])

  useEffect(() => {
    loadTransfers()
    loadServers()

    // 命名 handler 以便 removeListener 精确移除
    const onStarted = (data: any) => {
      setTransfers((prev) => {
        if (prev.find((t) => t.id === data.id)) return prev
        return [data, ...prev]
      })
    }

    const onProgress = (data: any) => {
      setTransfers((prev) =>
        prev.map((t) =>
          t.id === data.id
            ? { ...t, progress: data.totalSize > 0 ? Math.round((data.totalTransferred / data.totalSize) * 100) : 0, status: 'transferring' }
            : t
        )
      )
      setProgressData((prev) => ({
        ...prev,
        [data.id]: {
          speed: data.speed,
          elapsedTime: data.elapsedTime,
          estimatedTimeRemaining: data.estimatedTimeRemaining,
          totalTransferred: data.totalTransferred,
          totalSize: data.totalSize,
        },
      }))
    }

    const onComplete = (data: any) => {
      setTransfers((prev) => [data, ...prev.filter((t) => t.id !== data.id)])
      setProgressData((prev) => {
        const next = { ...prev }
        delete next[data.id]
        return next
      })
      loadTransfers()
    }

    const onError = (data: any) => {
      setTransfers((prev) =>
        prev.map((t) =>
          t.id === data.id ? { ...t, status: 'failed', error: data.error } : t
        )
      )
      setProgressData((prev) => {
        const next = { ...prev }
        delete next[data.id]
        return next
      })
      loadTransfers()
    }

    if (window.electronAPI) {
      window.electronAPI.onTransferStarted?.(onStarted)
      window.electronAPI.onTransferProgress?.(onProgress)
      window.electronAPI.onTransferComplete?.(onComplete)
      window.electronAPI.onTransferError?.(onError)
    }

    return () => {
      if (window.electronAPI) {
        window.electronAPI.removeListener?.('transfer:started', onStarted)
        window.electronAPI.removeListener?.('transfer:progress', onProgress)
        window.electronAPI.removeListener?.('transfer:complete', onComplete)
        window.electronAPI.removeListener?.('transfer:error', onError)
      }
    }
  }, [])

  useEffect(() => {
    applyFilters()
  }, [transfers, filters])

  const loadTransfers = async () => {
    setLoading(true)
    try {
      if (window.electronAPI) {
        const data = await window.electronAPI.getTransferHistory()
        setTransfers(data)
      }
    } catch (error) {
      console.error('加载传输历史失败:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadServers = async () => {
    try {
      if (window.electronAPI) {
        const data = await window.electronAPI.getServers()
        setServers(data)
      }
    } catch (error) {
      console.error('加载服务器列表失败:', error)
    }
  }

  // 处理拖拽文件
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(false)

    const files: SelectedFile[] = []
    for (let i = 0; i < e.dataTransfer.files.length; i++) {
      const file = e.dataTransfer.files[i]
      // Electron 中 File 对象有 path 属性
      const filePath = (file as any).path || file.name
      if (!selectedFiles.find((f) => f.path === filePath)) {
        files.push({
          path: filePath,
          name: file.name,
          size: file.size,
        })
      }
    }

    if (files.length > 0) {
      setSelectedFiles((prev) => [...prev, ...files])
    }
  }, [selectedFiles])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(false)
  }, [])

  // 通过对话框选择文件
  const handleSelectFiles = async () => {
    try {
      if (window.electronAPI) {
        const paths = await window.electronAPI.selectFiles()
        if (paths && paths.length > 0) {
          const newFiles: SelectedFile[] = []
          for (const filePath of paths) {
            if (!selectedFiles.find((f) => f.path === filePath)) {
              const name = filePath.split(/[/\\]/).pop() || filePath
              newFiles.push({ path: filePath, name, size: 0 })
            }
          }
          if (newFiles.length > 0) {
            setSelectedFiles((prev) => [...prev, ...newFiles])
          }
        }
      }
    } catch (error) {
      console.error('选择文件失败:', error)
    }
  }

  // 选择文件夹进行上传（递归扫描文件夹内所有文件，保持目录结构）
  const handleSelectFolder = async () => {
    try {
      if (window.electronAPI) {
        const result = await window.electronAPI.selectFolderForUpload()
        if (result && result.files.length > 0) {
          setFolderSelections((prev) => [...prev, result])
          const newFiles: SelectedFile[] = result.files
            .filter((f) => !selectedFiles.find((sf) => sf.path === f.filePath))
            .map((f) => ({
              path: f.filePath,
              name: f.relativePath,
              size: 0,
            }))
          if (newFiles.length > 0) {
            setSelectedFiles((prev) => [...prev, ...newFiles])
            message.success(`已添加文件夹 "${result.folderName}"，共 ${newFiles.length} 个文件`)
          }
        }
      }
    } catch (error) {
      console.error('选择文件夹失败:', error)
    }
  }

  const handleRemoveFile = (filePath: string) => {
    setSelectedFiles((prev) => prev.filter((f) => f.path !== filePath))
  }

  const handleServerChange = (serverId: string) => {
    setSelectedServerId(serverId)
    const server = servers.find((s) => s.id === serverId)
    if (server) {
      setRemotePath(server.remotePath || '/')
    }
  }

  // 开始上传
  const handleUpload = async () => {
    if (!selectedServerId) {
      message.warning('请选择目标服务器')
      return
    }
    if (selectedFiles.length === 0) {
      message.warning('请选择要上传的文件')
      return
    }

    setUploading(true)
    try {
      if (window.electronAPI) {
        // Determine folderName from folder selections
        const folderName = folderSelections.length === 1
          ? folderSelections[0].folderName
          : folderSelections.length > 1
            ? `${folderSelections.length} 个文件夹`
            : undefined

        await window.electronAPI.uploadFiles({
          serverId: selectedServerId,
          folderName,
          files: selectedFiles.map((f) => {
            // 查找该文件是否来自某个文件夹选择
            const folder = folderSelections.find((fs) =>
              fs.files.some((ff) => ff.filePath === f.path)
            )
            const nameInPath = folder
              ? folder.folderName + '/' + f.name
              : f.name
            return {
              localPath: f.path,
              remotePath: remotePath
                ? remotePath.replace(/\/$/, '') + '/' + nameInPath
                : nameInPath,
            }
          }),
        })
        message.success(`已添加 ${selectedFiles.length} 个文件到传输队列`)
        setSelectedFiles([])
        setFolderSelections([])
        loadTransfers()
      }
    } catch (error) {
      message.error('上传失败: ' + (error instanceof Error ? error.message : String(error)))
    } finally {
      setUploading(false)
    }
  }

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '-'
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const applyFilters = () => {
    let filtered = [...transfers]

    // 状态筛选
    if (filters.status !== 'all') {
      filtered = filtered.filter((t) => t.status === filters.status)
    }

    // 搜索筛选
    if (filters.search) {
      const searchLower = filters.search.toLowerCase()
      filtered = filtered.filter(
        (t) =>
          t.serverName.toLowerCase().includes(searchLower) ||
          t.files?.some((f) => f.fileName.toLowerCase().includes(searchLower))
      )
    }

    // 日期筛选
    if (filters.dateRange) {
      const [start, end] = filters.dateRange
      filtered = filtered.filter((t) => {
        const time = dayjs(t.startTime)
        return time.isAfter(start.startOf('day')) && time.isBefore(end.endOf('day'))
      })
    }

    setFilteredTransfers(filtered)
  }

  const handleRetry = async (id: string) => {
    try {
      if (window.electronAPI) {
        await window.electronAPI.retryTransfer?.(id)
        message.success('已重新加入队列')
        loadTransfers()
      }
    } catch (error) {
      message.error('重试失败')
    }
  }

  const handleClearHistory = async () => {
    try {
      if (window.electronAPI) {
        await window.electronAPI.clearHistory?.()
        setTransfers([])
        message.success('历史记录已清空')
      }
    } catch (error) {
      message.error('清空失败')
    }
  }

  const handleDeleteTransfer = async (id: string) => {
    try {
      if (window.electronAPI) {
        await window.electronAPI.deleteTransfer(id)
        setTransfers((prev) => prev.filter((t) => t.id !== id))
        message.success('已删除')
      }
    } catch (error) {
      message.error('删除失败')
    }
  }

  const handleOpenFile = async (filePath: string) => {
    try {
      if (window.electronAPI) {
        const result = await window.electronAPI.openFilePath?.(filePath)
        if (result && !result.success) {
          message.error('打开文件失败')
        }
      }
    } catch (error) {
      message.error('打开文件失败')
    }
  }

  const statusColors: Record<string, string> = {
    pending: 'gold',
    connecting: 'blue',
    transferring: 'blue',
    completed: 'green',
    failed: 'red',
    cancelled: 'default',
  }

  const statusLabels: Record<string, string> = {
    pending: '等待中',
    connecting: '连接中',
    transferring: '传输中',
    completed: '已完成',
    failed: '失败',
    cancelled: '已取消',
  }

  const columns = [
    {
      title: '时间',
      dataIndex: 'startTime',
      key: 'startTime',
      width: 160,
      sorter: (a: TransferTask, b: TransferTask) => (a.startTime || 0) - (b.startTime || 0),
      render: (time: number) => dayjs(time).format('YYYY-MM-DD HH:mm:ss'),
    },
    {
      title: '服务器',
      dataIndex: 'serverName',
      key: 'serverName',
      width: 120,
    },
    {
      title: '文件',
      key: 'files',
      render: (_: unknown, record: TransferTask) => (
        <Space direction="vertical" size={0}>
          {record.folderName ? (
            <Text ellipsis style={{ maxWidth: 250 }}>
              <FolderOpenOutlined style={{ marginRight: 4 }} />
              {record.folderName}
              <Text type="secondary"> ({record.files?.length || 0} 个文件)</Text>
            </Text>
          ) : (
            <>
              {record.files?.slice(0, 2).map((file, index) => (
                <Text key={index} ellipsis style={{ maxWidth: 250 }}>
                  {file.fileName}
                </Text>
              ))}
              {record.files && record.files.length > 2 && (
                <Text type="secondary">等 {record.files.length} 个文件</Text>
              )}
            </>
          )}
        </Space>
      ),
    },
    {
      title: '大小',
      key: 'size',
      width: 140,
      render: (_: unknown, record: TransferTask) => {
        const pd = progressData[record.id]
        if (pd && (record.status === 'transferring' || record.status === 'connecting')) {
          return (
            <Space direction="vertical" size={0}>
              <Text style={{ fontSize: 12 }}>
                {formatBytesShort(pd.totalTransferred)} / {formatBytesShort(pd.totalSize)}
              </Text>
              <Text type="secondary" style={{ fontSize: 11 }}>
                {formatSpeed(pd.speed)}
              </Text>
            </Space>
          )
        }
        const totalSize = record.files?.reduce((sum, f) => sum + f.fileSize, 0) || 0
        return formatBytesShort(totalSize)
      },
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 130,
      render: (status: string, record: TransferTask) => (
        <Space direction="vertical" size={0}>
          <Tag color={statusColors[status]}>{statusLabels[status]}</Tag>
          {(status === 'transferring' || status === 'connecting') && (
            <Progress percent={record.progress} size="small" status="active" style={{ marginBottom: 0 }} />
          )}
          {record.error && (
            <Tooltip title={record.error}>
              <Text type="danger" style={{ fontSize: 12 }} ellipsis>
                {record.error}
              </Text>
            </Tooltip>
          )}
        </Space>
      ),
    },
    {
      title: '耗时',
      key: 'duration',
      width: 120,
      render: (_: unknown, record: TransferTask) => {
        if (record.status === 'transferring' || record.status === 'connecting') {
          const pd = progressData[record.id]
          if (pd) {
            return (
              <Space direction="vertical" size={0}>
                <Text style={{ fontSize: 12 }}>{formatDurationMs(pd.elapsedTime)}</Text>
                {pd.estimatedTimeRemaining > 0 && (
                  <Text type="secondary" style={{ fontSize: 11 }}>
                    剩余 {formatDurationMs(pd.estimatedTimeRemaining)}
                  </Text>
                )}
              </Space>
            )
          }
          return '...'
        }
        if (!record.startTime || !record.endTime) return '-'
        const duration = record.endTime - record.startTime
        if (duration < 1000) return `${duration}ms`
        if (duration < 60000) return `${(duration / 1000).toFixed(1)}s`
        return `${Math.floor(duration / 60000)}m ${Math.round((duration % 60000) / 1000)}s`
      },
    },
    {
      title: '操作',
      key: 'actions',
      width: 160,
      render: (_: unknown, record: TransferTask) => (
        <Space>
          {record.status === 'failed' && (
            <Tooltip title="重试">
              <Button
                type="text"
                icon={<RedoOutlined />}
                onClick={() => handleRetry(record.id)}
              />
            </Tooltip>
          )}
          {record.files?.[0]?.localPath && (
            <Tooltip title="打开文件">
              <Button
                type="text"
                icon={<FolderOpenOutlined />}
                onClick={() => handleOpenFile(record.files[0].localPath)}
              />
            </Tooltip>
          )}
          <Popconfirm title="确定删除此记录？" onConfirm={() => handleDeleteTransfer(record.id)}>
            <Tooltip title="删除">
              <Button type="text" danger icon={<DeleteOutlined />} />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <Title level={4}>
          <CloudUploadOutlined /> 手动传输
        </Title>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={loadTransfers}>
            刷新
          </Button>
          <Popconfirm title="确定要清空所有历史记录吗？" onConfirm={handleClearHistory}>
            <Button danger icon={<DeleteOutlined />}>
              清空
            </Button>
          </Popconfirm>
        </Space>
      </div>

      {/* 手动上传区域 */}
      <Card style={{ marginBottom: 16 }}>
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={handleSelectFiles}
          style={{
            border: `2px dashed ${dragOver ? '#1890ff' : '#d9d9d9'}`,
            borderRadius: 8,
            padding: '24px 16px',
            textAlign: 'center',
            backgroundColor: dragOver ? '#e6f7ff' : '#fafafa',
            cursor: 'pointer',
            marginBottom: 16,
            transition: 'all 0.3s',
          }}
        >
          <InboxOutlined style={{ fontSize: 32, color: '#1890ff', marginBottom: 8 }} />
          <div>
            <Text strong>点击选择文件或将文件拖拽到此处</Text>
          </div>
          <Text type="secondary">支持选择多个文件</Text>
        </div>

        <Space wrap style={{ marginBottom: 12 }}>
          <Button icon={<FolderOpenOutlined />} onClick={handleSelectFolder}>
            选择文件夹
          </Button>
          <Select
            placeholder="选择目标服务器"
            value={selectedServerId}
            onChange={handleServerChange}
            style={{ minWidth: 200 }}
            allowClear
          >
            {servers.map((server) => (
              <Option key={server.id} value={server.id}>
                {server.name} ({server.type.toUpperCase()})
              </Option>
            ))}
          </Select>
          <Input
            placeholder="远程路径（可选，默认使用服务器配置路径）"
            value={remotePath}
            onChange={(e) => setRemotePath(e.target.value)}
            style={{ minWidth: 300 }}
            allowClear
          />
          <Button
            type="primary"
            icon={<UploadOutlined />}
            onClick={handleUpload}
            loading={uploading}
            disabled={selectedFiles.length === 0 || !selectedServerId}
          >
            上传文件 ({selectedFiles.length})
          </Button>
        </Space>

        {selectedFiles.length > 0 && (
          <List
            size="small"
            dataSource={selectedFiles}
            renderItem={(file) => (
              <List.Item
                actions={[
                  <Button
                    key="remove"
                    type="text"
                    size="small"
                    danger
                    icon={<CloseOutlined />}
                    onClick={(e) => {
                      e.stopPropagation()
                      handleRemoveFile(file.path)
                    }}
                  />,
                ]}
              >
                <Space>
                  <Text>{file.name}</Text>
                  <Text type="secondary">{formatFileSize(file.size)}</Text>
                </Space>
              </List.Item>
            )}
            style={{
              maxHeight: 200,
              overflow: 'auto',
              border: '1px solid #f0f0f0',
              borderRadius: 6,
              padding: '0 8px',
            }}
          />
        )}
      </Card>

      {/* 筛选栏 */}
      <Card style={{ marginBottom: 16 }}>
        <Space size={16}>
          <Input
            placeholder="搜索服务器或文件名"
            prefix={<SearchOutlined />}
            value={filters.search}
            onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))}
            style={{ width: 250 }}
            allowClear
          />

          <Select
            value={filters.status}
            onChange={(value) => setFilters((prev) => ({ ...prev, status: value }))}
            style={{ width: 120 }}
          >
            <Option value="all">全部状态</Option>
            <Option value="completed">已完成</Option>
            <Option value="failed">失败</Option>
            <Option value="pending">等待中</Option>
            <Option value="transferring">传输中</Option>
          </Select>

          <RangePicker
            onChange={(dates) =>
              setFilters((prev) => ({
                ...prev,
                dateRange: dates as [dayjs.Dayjs, dayjs.Dayjs] | null,
              }))
            }
          />
        </Space>
      </Card>

      {/* 传输列表 */}
      <Card title="传输历史">
        <Table
          columns={columns}
          dataSource={filteredTransfers}
          rowKey="id"
          loading={loading}
          pagination={{
            pageSize: 20,
            showSizeChanger: true,
            showTotal: (total) => `共 ${total} 条记录`,
          }}
          locale={{ emptyText: '暂无传输记录' }}
        />
      </Card>
    </div>
  )
}

export default TransferList
