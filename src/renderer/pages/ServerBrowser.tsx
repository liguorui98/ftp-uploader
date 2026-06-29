import React, { useState, useEffect, useCallback, useRef } from 'react'
import {
  Card,
  Table,
  Select,
  Button,
  Space,
  Breadcrumb,
  Modal,
  Input,
  message,
  Popconfirm,
  Tooltip,
  Typography,
  Progress,
} from 'antd'
import {
  FolderOutlined,
  FileOutlined,
  FileImageOutlined,
  FilePdfOutlined,
  FileZipOutlined,
  FileTextOutlined,
  ReloadOutlined,
  FolderAddOutlined,
  DownloadOutlined,
  DeleteOutlined,
  EditOutlined,
  HomeOutlined,
} from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import type { ServerConfig, RemoteFileInfo, DownloadProgress } from '../types'

const { Title, Text } = Typography

const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '-'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

const formatDuration = (ms: number): string => {
  if (ms <= 0) return '计算中...'
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${Math.ceil(ms / 1000)}秒`
  const minutes = Math.floor(ms / 60000)
  const seconds = Math.ceil((ms % 60000) / 1000)
  return `${minutes}分${seconds}秒`
}

const getFileIcon = (name: string) => {
  const ext = name.split('.').pop()?.toLowerCase() || ''
  if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg', 'webp', 'ico'].includes(ext))
    return <FileImageOutlined style={{ color: '#52c41a' }} />
  if (ext === 'pdf') return <FilePdfOutlined style={{ color: '#ff4d4f' }} />
  if (['zip', 'rar', '7z', 'tar', 'gz', 'bz2'].includes(ext))
    return <FileZipOutlined style={{ color: '#faad14' }} />
  if (['txt', 'log', 'md', 'json', 'xml', 'yml', 'yaml', 'csv'].includes(ext))
    return <FileTextOutlined style={{ color: '#1890ff' }} />
  return <FileOutlined style={{ color: '#8c8c8c' }} />
}

const ServerBrowser: React.FC = () => {
  const [servers, setServers] = useState<ServerConfig[]>([])
  const [selectedServerId, setSelectedServerId] = useState<string>('')
  const [currentPath, setCurrentPath] = useState<string>('/')
  const [files, setFiles] = useState<RemoteFileInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [mkdirVisible, setMkdirVisible] = useState(false)
  const [mkdirName, setMkdirName] = useState('')
  const [renameVisible, setRenameVisible] = useState(false)
  const [renameTarget, setRenameTarget] = useState<RemoteFileInfo | null>(null)
  const [renameNewName, setRenameNewName] = useState('')
  const [downloading, setDownloading] = useState(false)
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress | null>(null)
  const [downloadId, setDownloadId] = useState('')
  const downloadIdRef = useRef('')

  // 加载服务器列表
  useEffect(() => {
    const loadServers = async () => {
      try {
        const list = await window.electronAPI.getServers()
        setServers(list)
        if (list.length > 0 && !selectedServerId) {
          setSelectedServerId(list[0].id)
        }
      } catch {
        // 忽略
      }
    }
    loadServers()
  }, [])

  // 加载目录内容
  const loadFiles = useCallback(async () => {
    if (!selectedServerId) return
    setLoading(true)
    try {
      const result = await window.electronAPI.browserList(selectedServerId, currentPath)
      setFiles(result)
    } catch (error) {
      message.error(`加载目录失败: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setLoading(false)
    }
  }, [selectedServerId, currentPath])

  // 服务器切换时重置路径并加载
  useEffect(() => {
    if (selectedServerId) {
      const server = servers.find((s) => s.id === selectedServerId)
      const rootPath = server?.remotePath || '/'
      setCurrentPath(rootPath.endsWith('/') ? rootPath : rootPath + '/')
    }
  }, [selectedServerId, servers])

  // 路径变化时加载文件列表
  useEffect(() => {
    loadFiles()
  }, [loadFiles])

  // 监听下载事件
  useEffect(() => {
    const cleanups: Array<() => void> = []

    cleanups.push(
      window.electronAPI.onBrowserDownloadStarted?.((data) => {
        downloadIdRef.current = data.downloadId
        setDownloadId(data.downloadId)
      }) || (() => {})
    )

    cleanups.push(
      window.electronAPI.onBrowserDownloadProgress?.((data) => {
        setDownloadProgress(data)
      }) || (() => {})
    )

    cleanups.push(
      window.electronAPI.onBrowserDownloadComplete?.((data) => {
        setDownloading(false)
        setDownloadProgress(null)
        setDownloadId('')
        downloadIdRef.current = ''
        if (data.success) {
          message.success('下载完成')
        } else if (data.error !== '下载已取消') {
          message.error(`下载失败: ${data.error}`)
        } else {
          message.info('下载已取消')
        }
      }) || (() => {})
    )

    return () => { cleanups.forEach((fn) => fn()) }
  }, [])

  // 进入子目录
  const handleEnterDir = (dirName: string) => {
    const sep = currentPath.endsWith('/') ? '' : '/'
    setCurrentPath(currentPath + sep + dirName + '/')
  }

  // 返回上级目录
  const handleGoUp = () => {
    const parts = currentPath.replace(/\/+$/, '').split('/').filter(Boolean)
    if (parts.length <= 0) return
    parts.pop()
    setCurrentPath('/' + parts.join('/') + '/')
  }

  // 面包屑跳转
  const handleBreadcrumbClick = (index: number) => {
    const parts = currentPath.replace(/\/+$/, '').split('/').filter(Boolean)
    if (index === -1) {
      const server = servers.find((s) => s.id === selectedServerId)
      setCurrentPath(server?.remotePath || '/')
    } else {
      const target = '/' + parts.slice(0, index + 1).join('/') + '/'
      setCurrentPath(target)
    }
  }

  // 新建文件夹
  const handleMkdir = async () => {
    if (!mkdirName.trim()) {
      message.warning('请输入文件夹名称')
      return
    }
    try {
      await window.electronAPI.browserMkdir(selectedServerId, currentPath, mkdirName.trim())
      message.success(`文件夹 "${mkdirName}" 创建成功`)
      setMkdirVisible(false)
      setMkdirName('')
      loadFiles()
    } catch (error) {
      message.error(`创建失败: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  // 删除文件/文件夹
  const handleDelete = async (file: RemoteFileInfo) => {
    const sep = currentPath.endsWith('/') ? '' : '/'
    const fullPath = currentPath + sep + file.name
    try {
      await window.electronAPI.browserDelete(selectedServerId, fullPath)
      message.success(`"${file.name}" 删除成功`)
      loadFiles()
    } catch (error) {
      message.error(`删除失败: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  // 下载文件
  const handleDownload = async (file: RemoteFileInfo) => {
    const sep = currentPath.endsWith('/') ? '' : '/'
    const fullPath = currentPath + sep + file.name
    setDownloading(true)
    setDownloadProgress(null)
    try {
      const result = await window.electronAPI.browserDownload(selectedServerId, fullPath)
      if (!result.success) {
        setDownloading(false)
        return
      }
      if (result.downloadId) {
        downloadIdRef.current = result.downloadId
        setDownloadId(result.downloadId)
      }
      // 完成/失败由 onBrowserDownloadComplete 事件处理
    } catch (error) {
      setDownloading(false)
      message.error(`下载失败: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  // 取消下载
  const handleCancelDownload = async () => {
    const id = downloadIdRef.current
    if (id) {
      await window.electronAPI.browserCancelDownload(id)
      // 兜底：3 秒后如果弹框仍未关闭，强制关闭
      setTimeout(() => {
        setDownloading(false)
        setDownloadProgress(null)
        setDownloadId('')
        downloadIdRef.current = ''
      }, 3000)
    }
  }

  // 重命名
  const handleRename = async () => {
    if (!renameTarget || !renameNewName.trim()) {
      message.warning('请输入新名称')
      return
    }
    const sep = currentPath.endsWith('/') ? '' : '/'
    const oldPath = currentPath + sep + renameTarget.name
    const newPath = currentPath + sep + renameNewName.trim()
    try {
      await window.electronAPI.browserRename(selectedServerId, oldPath, newPath)
      message.success(`重命名成功`)
      setRenameVisible(false)
      setRenameTarget(null)
      setRenameNewName('')
      loadFiles()
    } catch (error) {
      message.error(`重命名失败: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  // 构建面包屑
  const pathParts = currentPath.replace(/\/+$/, '').split('/').filter(Boolean)

  const columns: ColumnsType<RemoteFileInfo & { key: string }> = [
    {
      title: '名称',
      dataIndex: 'name',
      key: 'name',
      sorter: (a, b) => {
        // 文件夹排前面
        if (a.type === 'directory' && b.type !== 'directory') return -1
        if (a.type !== 'directory' && b.type === 'directory') return 1
        return a.name.localeCompare(b.name)
      },
      render: (_: unknown, record: RemoteFileInfo) => {
        const isDir = record.type === 'directory'
        return (
          <Space
            style={{ cursor: isDir ? 'pointer' : 'default' }}
            onClick={() => isDir && handleEnterDir(record.name)}
          >
            {isDir ? (
              <FolderOutlined style={{ color: '#faad14', fontSize: 16 }} />
            ) : (
              getFileIcon(record.name)
            )}
            <Text style={isDir ? { color: '#1890ff' } : {}}>{record.name}</Text>
          </Space>
        )
      },
    },
    {
      title: '大小',
      dataIndex: 'size',
      key: 'size',
      width: 120,
      sorter: (a, b) => a.size - b.size,
      render: (_: unknown, record: RemoteFileInfo) =>
        record.type === 'directory' ? '-' : formatBytes(record.size),
    },
    {
      title: '修改时间',
      dataIndex: 'modifyTime',
      key: 'modifyTime',
      width: 180,
      sorter: (a, b) => new Date(a.modifyTime).getTime() - new Date(b.modifyTime).getTime(),
      render: (val: string) => {
        if (!val) return '-'
        const d = new Date(val)
        const pad = (n: number) => String(n).padStart(2, '0')
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
      },
    },
    {
      title: '权限',
      dataIndex: 'permissions',
      key: 'permissions',
      width: 100,
      render: (val: string) => val || '-',
    },
    {
      title: '操作',
      key: 'action',
      width: 160,
      render: (_: unknown, record: RemoteFileInfo) => (
        <Space size={4}>
          {record.type === 'file' && (
            <Tooltip title="下载">
              <Button
                type="text"
                size="small"
                icon={<DownloadOutlined />}
                onClick={() => handleDownload(record)}
              />
            </Tooltip>
          )}
          <Tooltip title="重命名">
            <Button
              type="text"
              size="small"
              icon={<EditOutlined />}
              onClick={() => {
                setRenameTarget(record)
                setRenameNewName(record.name)
                setRenameVisible(true)
              }}
            />
          </Tooltip>
          <Popconfirm
            title={`确定删除 "${record.name}"？`}
            onConfirm={() => handleDelete(record)}
            okText="删除"
            cancelText="取消"
            okButtonProps={{ danger: true }}
          >
            <Tooltip title="删除">
              <Button type="text" size="small" danger icon={<DeleteOutlined />} />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  // 表格数据：添加 key 和上级目录行
  const tableData: Array<RemoteFileInfo & { key: string }> = []

  // 非根目录时显示上级目录
  const server = servers.find((s) => s.id === selectedServerId)
  const rootPath = server?.remotePath || '/'
  const normalizedRoot = rootPath.replace(/\/+$/, '') + '/'
  const normalizedCurrent = currentPath.replace(/\/+$/, '') + '/'
  const canGoUp = normalizedCurrent !== normalizedRoot && pathParts.length > 1

  if (canGoUp) {
    tableData.push({
      name: '..',
      type: 'directory',
      size: 0,
      modifyTime: '',
      permissions: '',
      key: '__parent__',
    })
  }

  files.forEach((f, i) => {
    tableData.push({ ...f, key: `${f.name}-${i}` })
  })

  return (
    <div style={{ padding: 24, height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Title level={4} style={{ marginBottom: 24 }}>
        <FolderOutlined /> 文件管理
      </Title>

      <Card style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {/* 顶部工具栏 */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 16,
          }}
        >
          <Space>
            <Text strong>服务器：</Text>
            <Select
              style={{ width: 240 }}
              placeholder="选择服务器"
              value={selectedServerId || undefined}
              onChange={setSelectedServerId}
              options={servers.map((s) => ({
                value: s.id,
                label: `${s.name} (${s.type.toUpperCase()} - ${s.host})`,
              }))}
            />
          </Space>
          <Space>
            <Button
              icon={<FolderAddOutlined />}
              onClick={() => setMkdirVisible(true)}
              disabled={!selectedServerId}
            >
              新建文件夹
            </Button>
            <Button
              icon={<ReloadOutlined />}
              onClick={loadFiles}
              disabled={!selectedServerId}
            >
              刷新
            </Button>
          </Space>
        </div>

        {/* 面包屑路径 */}
        <div
          style={{
            marginBottom: 16,
            padding: '8px 12px',
            background: '#fafafa',
            borderRadius: 6,
          }}
        >
          <Breadcrumb
            items={[
              {
                title: (
                  <Space
                    size={4}
                    style={{ cursor: 'pointer' }}
                    onClick={() => handleBreadcrumbClick(-1)}
                  >
                    <HomeOutlined />
                    <span>根目录</span>
                  </Space>
                ),
              },
              ...pathParts.map((part, index) => ({
                title: (
                  <span
                    style={{ cursor: 'pointer', color: '#1890ff' }}
                    onClick={() => handleBreadcrumbClick(index)}
                  >
                    {part}
                  </span>
                ),
              })),
            ]}
          />
        </div>

        {/* 文件列表 */}
        <Table
          columns={columns}
          dataSource={tableData}
          loading={loading}
          size="small"
          pagination={false}
          scroll={{ y: 'calc(100vh - 320px)' }}
          locale={{ emptyText: selectedServerId ? '空目录' : '请先选择服务器' }}
          rowClassName={(record) =>
            record.name === '..' ? 'parent-dir-row' : ''
          }
          onRow={(record) => ({
            onDoubleClick: () => {
              if (record.type === 'directory') {
                if (record.name === '..') {
                  handleGoUp()
                } else {
                  handleEnterDir(record.name)
                }
              }
            },
          })}
        />

        <div style={{ marginTop: 8, textAlign: 'right' }}>
          <Text type="secondary">共 {files.length} 项</Text>
        </div>
      </Card>

      {/* 新建文件夹对话框 */}
      <Modal
        title="新建文件夹"
        open={mkdirVisible}
        onOk={handleMkdir}
        onCancel={() => {
          setMkdirVisible(false)
          setMkdirName('')
        }}
        okText="创建"
        cancelText="取消"
      >
        <Input
          placeholder="请输入文件夹名称"
          value={mkdirName}
          onChange={(e) => setMkdirName(e.target.value)}
          onPressEnter={handleMkdir}
          autoFocus
        />
      </Modal>

      {/* 重命名对话框 */}
      <Modal
        title={`重命名 "${renameTarget?.name || ''}"`}
        open={renameVisible}
        onOk={handleRename}
        onCancel={() => {
          setRenameVisible(false)
          setRenameTarget(null)
          setRenameNewName('')
        }}
        okText="确定"
        cancelText="取消"
      >
        <Input
          placeholder="请输入新名称"
          value={renameNewName}
          onChange={(e) => setRenameNewName(e.target.value)}
          onPressEnter={handleRename}
          autoFocus
        />
      </Modal>

      {/* 下载进度对话框 */}
      <Modal
        title={`正在下载: ${downloadProgress?.fileName || ''}`}
        open={downloading}
        footer={[
          <Button key="cancel" danger onClick={handleCancelDownload}>
            取消下载
          </Button>,
        ]}
        closable={false}
        maskClosable={false}
        width={420}
      >
        {downloadProgress ? (
          <div>
            <Progress
              percent={
                downloadProgress.total > 0
                  ? Math.round((downloadProgress.transferred / downloadProgress.total) * 100)
                  : 0
              }
              status="active"
              strokeColor={{ from: '#108ee9', to: '#87d068' }}
            />
            <div style={{ marginTop: 16, display: 'flex', justifyContent: 'space-between' }}>
              <Text type="secondary">
                已下载: {formatBytes(downloadProgress.transferred)} / {formatBytes(downloadProgress.total)}
              </Text>
            </div>
            <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between' }}>
              <Text type="secondary">速度: {formatBytes(downloadProgress.speed)}/s</Text>
              <Text type="secondary">剩余时间: {formatDuration(downloadProgress.estimatedTimeRemaining)}</Text>
            </div>
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <Text type="secondary">准备下载中...</Text>
          </div>
        )}
      </Modal>

      <style>{`
        .parent-dir-row {
          background: #fafafa;
        }
        .parent-dir-row:hover td {
          background: #f0f0f0 !important;
        }
      `}</style>
    </div>
  )
}

export default ServerBrowser
