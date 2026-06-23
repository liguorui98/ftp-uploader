import React, { useState, useEffect } from 'react'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { Layout, Menu, Badge, Space, Typography } from 'antd'
import {
  DashboardOutlined,
  CloudUploadOutlined,
  SettingOutlined,
  ClockCircleOutlined,
  FolderOutlined,
  ToolOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
} from '@ant-design/icons'
import TitleBar from './TitleBar'
import StatusBar from './StatusBar'

const { Sider, Content } = Layout
const { Text } = Typography

const AppLayout: React.FC = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const [collapsed, setCollapsed] = useState(false)
  const [queueStatus, setQueueStatus] = useState({ queued: 0, active: 0, isPaused: false })
  const [serverCount, setServerCount] = useState(0)

  // 菜单项
  const menuItems = [
    {
      key: '/dashboard',
      icon: <DashboardOutlined />,
      label: '概览',
    },
    {
      key: '/transfers',
      icon: <CloudUploadOutlined />,
      label: '传输',
      extra: queueStatus.active > 0 ? (
        <Badge count={queueStatus.active} size="small" />
      ) : null,
    },
    {
      key: '/servers',
      icon: <SettingOutlined />,
      label: '服务器',
    },
    {
      key: '/schedules',
      icon: <ClockCircleOutlined />,
      label: '定时',
    },
    {
      key: '/watchers',
      icon: <FolderOutlined />,
      label: '监控',
    },
    {
      type: 'divider' as const,
    },
    {
      key: '/settings',
      icon: <ToolOutlined />,
      label: '设置',
    },
  ]

  // 获取服务器数量
  useEffect(() => {
    const fetchServerCount = async () => {
      try {
        if (window.electronAPI) {
          const servers = await window.electronAPI.getServers?.()
          if (Array.isArray(servers)) {
            setServerCount(servers.length)
          }
        }
      } catch (error) {
        // 忽略错误
      }
    }
    fetchServerCount()
    const serverInterval = setInterval(fetchServerCount, 10000)
    return () => clearInterval(serverInterval)
  }, [])

  // 获取队列状态（轮询，2秒间隔）
  useEffect(() => {
    const fetchStatus = async () => {
      try {
        if (window.electronAPI) {
          const status = await window.electronAPI.getQueueStatus?.()
          if (status) {
            setQueueStatus(status)
          }
        }
      } catch (error) {
        // 忽略错误
      }
    }

    fetchStatus()
    const interval = setInterval(fetchStatus, 2000)
    return () => clearInterval(interval)
  }, [])

  return (
    <Layout className="app-layout">
      {/* 自定义标题栏 */}
      <TitleBar />

      <Layout className="app-content">
        {/* 侧边栏 */}
        <Sider
          className="app-sidebar"
          collapsed={collapsed}
          onCollapse={setCollapsed}
          collapsible
          trigger={null}
          width={200}
          collapsedWidth={60}
        >
          <div style={{ padding: '16px 0' }}>
            <div style={{ textAlign: 'center', marginBottom: 16 }}>
              {collapsed ? (
                <CloudUploadOutlined style={{ fontSize: 24, color: '#1890ff' }} />
              ) : (
                <Space direction="vertical" size={0}>
                  <CloudUploadOutlined style={{ fontSize: 24, color: '#1890ff' }} />
                  <Text strong style={{ fontSize: 14 }}>FTP Uploader</Text>
                </Space>
              )}
            </div>

            <Menu
              mode="inline"
              selectedKeys={[location.pathname]}
              items={menuItems}
              onClick={({ key }) => navigate(key)}
              style={{ border: 'none' }}
            />
          </div>

          {/* 折叠按钮 */}
          <div
            style={{
              position: 'absolute',
              bottom: 16,
              width: '100%',
              textAlign: 'center',
              cursor: 'pointer',
            }}
            onClick={() => setCollapsed(!collapsed)}
          >
            {collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
          </div>
        </Sider>

        {/* 主内容区 */}
        <Content className="app-main">
          <Outlet />
        </Content>
      </Layout>

      {/* 状态栏 */}
      <StatusBar queueStatus={queueStatus} serverCount={serverCount} />
    </Layout>
  )
}

export default AppLayout
