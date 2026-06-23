import React, { useState, useEffect } from 'react'
import { Row, Col, Card, Statistic, Table, Tag, Space, Typography, Progress } from 'antd'
import {
  CloudUploadOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ClockCircleOutlined,
  SyncOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'

const { Title, Text } = Typography

interface TransferTask {
  id: string
  serverName: string
  folderName?: string
  files: Array<{ fileName: string; fileSize: number; status: string }>
  status: string
  progress: number
  startTime?: number
  endTime?: number
}

interface ProgressInfo {
  speed: number
  elapsedTime: number
  estimatedTimeRemaining: number
  totalTransferred: number
  totalSize: number
}

const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

const formatSpeed = (bytesPerSecond: number): string => {
  if (bytesPerSecond === 0) return '...'
  if (bytesPerSecond < 1024) return `${bytesPerSecond} B/s`
  if (bytesPerSecond < 1024 * 1024) return `${(bytesPerSecond / 1024).toFixed(1)} KB/s`
  return `${(bytesPerSecond / (1024 * 1024)).toFixed(1)} MB/s`
}

const formatDuration = (ms: number): string => {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  const minutes = Math.floor(ms / 60000)
  const seconds = Math.round((ms % 60000) / 1000)
  return `${minutes}m ${seconds}s`
}

const Dashboard: React.FC = () => {
  const [stats, setStats] = useState({
    total: 0,
    success: 0,
    failed: 0,
    today: 0,
    active: 0,
    queued: 0,
  })
  const [recentTransfers, setRecentTransfers] = useState<TransferTask[]>([])
  const [activeTransfers, setActiveTransfers] = useState<TransferTask[]>([])
  const [progressData, setProgressData] = useState<Record<string, ProgressInfo>>({})

  useEffect(() => {
    fetchData()

    // 命名 handler 以便 removeListener 精确移除
    const onProgress = (data: any) => {
      const progress = data.totalSize > 0 ? Math.round((data.totalTransferred / data.totalSize) * 100) : 0
      setActiveTransfers((prev) =>
        prev.map((t) =>
          t.id === data.id ? { ...t, progress } : t
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

    const onStarted = (data: any) => {
      setActiveTransfers((prev) => {
        if (prev.find((t) => t.id === data.id)) return prev
        return [...prev, data]
      })
      setStats((prev) => ({ ...prev, active: prev.active + 1 }))
    }

    const onComplete = (data: any) => {
      setActiveTransfers((prev) => prev.filter((t) => t.id !== data.id))
      setProgressData((prev) => {
        const next = { ...prev }
        delete next[data.id]
        return next
      })
      setRecentTransfers((prev) => [data, ...prev.slice(0, 9)])
      setStats((prev) => ({
        ...prev,
        success: prev.success + 1,
        total: prev.total + 1,
        active: Math.max(0, prev.active - 1),
      }))
      fetchData()
    }

    const onError = (data: any) => {
      setActiveTransfers((prev) => prev.filter((t) => t.id !== data.id))
      setProgressData((prev) => {
        const next = { ...prev }
        delete next[data.id]
        return next
      })
      setStats((prev) => ({
        ...prev,
        failed: prev.failed + 1,
        total: prev.total + 1,
        active: Math.max(0, prev.active - 1),
      }))
      fetchData()
    }

    const cleanups: Array<() => void> = []
    if (window.electronAPI) {
      cleanups.push(window.electronAPI.onTransferProgress?.(onProgress) || (() => {}))
      cleanups.push(window.electronAPI.onTransferStarted?.(onStarted) || (() => {}))
      cleanups.push(window.electronAPI.onTransferComplete?.(onComplete) || (() => {}))
      cleanups.push(window.electronAPI.onTransferError?.(onError) || (() => {}))
    }

    return () => {
      cleanups.forEach((cleanup) => cleanup())
    }
  }, [])

  const fetchData = async () => {
    try {
      if (window.electronAPI) {
        const history = await window.electronAPI.getTransferHistory?.() || []
        const today = dayjs().startOf('day')

        setRecentTransfers(history.slice(0, 10))
        setActiveTransfers(history.filter((t) => t.status === 'transferring' || t.status === 'connecting'))

        setStats({
          total: history.length,
          success: history.filter((t) => t.status === 'completed').length,
          failed: history.filter((t) => t.status === 'failed').length,
          today: history.filter((t) => dayjs(t.startTime).isAfter(today)).length,
          active: history.filter((t) => t.status === 'transferring' || t.status === 'connecting').length,
          queued: history.filter((t) => t.status === 'pending').length,
        })
      }
    } catch (error) {
      console.error('获取数据失败:', error)
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
      render: (time: number) => dayjs(time).format('MM-DD HH:mm:ss'),
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
        <Text ellipsis style={{ maxWidth: 200 }}>
          {record.files?.map((f) => f.fileName).join(', ')}
        </Text>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: string) => (
        <Tag color={statusColors[status]}>{statusLabels[status]}</Tag>
      ),
    },
  ]

  return (
    <div>
      <Title level={4} style={{ marginBottom: 24 }}>
        <CloudUploadOutlined /> 概览
      </Title>

      {/* 统计卡片 */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={4}>
          <Card>
            <Statistic
              title="总传输"
              value={stats.total}
              prefix={<CloudUploadOutlined />}
            />
          </Card>
        </Col>
        <Col span={4}>
          <Card>
            <Statistic
              title="成功"
              value={stats.success}
              prefix={<CheckCircleOutlined />}
              valueStyle={{ color: '#3f8600' }}
            />
          </Card>
        </Col>
        <Col span={4}>
          <Card>
            <Statistic
              title="失败"
              value={stats.failed}
              prefix={<CloseCircleOutlined />}
              valueStyle={{ color: '#cf1322' }}
            />
          </Card>
        </Col>
        <Col span={4}>
          <Card>
            <Statistic
              title="今日"
              value={stats.today}
              prefix={<ClockCircleOutlined />}
            />
          </Card>
        </Col>
        <Col span={4}>
          <Card>
            <Statistic
              title="活跃"
              value={stats.active}
              prefix={<SyncOutlined spin={stats.active > 0} />}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col span={4}>
          <Card>
            <Statistic
              title="队列中"
              value={stats.queued}
              prefix={<ClockCircleOutlined />}
            />
          </Card>
        </Col>
      </Row>

      {/* 活跃传输 */}
      {activeTransfers.length > 0 && (
        <Card title="正在进行的传输" style={{ marginBottom: 24 }}>
          {activeTransfers.map((transfer) => {
            const pd = progressData[transfer.id]
            return (
              <div key={transfer.id} style={{ marginBottom: 16 }}>
                <Space style={{ marginBottom: 8 }}>
                  <SyncOutlined spin />
                  <Text strong>{transfer.serverName}</Text>
                  <Text type="secondary">
                    {transfer.folderName
                      ? transfer.folderName
                      : transfer.files?.[0]?.fileName}
                    {transfer.folderName
                      ? ` (${transfer.files?.length || 0} 个文件)`
                      : transfer.files && transfer.files.length > 1 && ` 等 ${transfer.files.length} 个文件`}
                  </Text>
                </Space>
                {pd && (
                  <Space style={{ marginBottom: 4 }} size={16}>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {formatBytes(pd.totalTransferred)} / {formatBytes(pd.totalSize)}
                    </Text>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {formatSpeed(pd.speed)}
                    </Text>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      已用时 {formatDuration(pd.elapsedTime)}
                    </Text>
                    {pd.estimatedTimeRemaining > 0 && (
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        剩余 {formatDuration(pd.estimatedTimeRemaining)}
                      </Text>
                    )}
                  </Space>
                )}
                <Progress
                  percent={transfer.progress}
                  status="active"
                  format={(percent) => `${percent}%`}
                />
              </div>
            )
          })}
        </Card>
      )}

      {/* 最近传输 */}
      <Card title="最近传输">
        <Table
          columns={columns}
          dataSource={recentTransfers}
          rowKey="id"
          pagination={false}
          size="small"
          locale={{ emptyText: '暂无传输记录' }}
        />
      </Card>
    </div>
  )
}

export default Dashboard
