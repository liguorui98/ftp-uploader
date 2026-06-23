import React from 'react'
import { Space, Typography, Badge, Tooltip } from 'antd'
import {
  CloudServerOutlined,
  PauseCircleOutlined,
  SyncOutlined,
} from '@ant-design/icons'

const { Text } = Typography

interface StatusBarProps {
  queueStatus: {
    queued: number
    active: number
    isPaused: boolean
  }
  serverCount: number
}

const StatusBar: React.FC<StatusBarProps> = ({ queueStatus, serverCount }) => {
  return (
    <div className="statusbar">
      <Space size={16}>
        {/* 连接状态 */}
        <Tooltip title="服务器连接状态">
          <Space size={4}>
            <Badge status={serverCount > 0 ? 'success' : 'default'} />
            <Text type="secondary">
              {serverCount > 0 ? '已连接' : '未配置'}
            </Text>
          </Space>
        </Tooltip>

        {/* 队列状态 */}
        <Tooltip title="传输队列状态">
          <Space size={4}>
            {queueStatus.isPaused ? (
              <PauseCircleOutlined style={{ color: '#faad14' }} />
            ) : (
              <SyncOutlined spin={queueStatus.active > 0} style={{ color: '#1890ff' }} />
            )}
            <Text type="secondary">
              {queueStatus.active > 0
                ? `传输中 ${queueStatus.active}`
                : queueStatus.queued > 0
                ? `队列中 ${queueStatus.queued}`
                : '空闲'}
            </Text>
          </Space>
        </Tooltip>

        {/* 服务器信息 */}
        <Tooltip title="已配置的服务器数量">
          <Space size={4}>
            <CloudServerOutlined style={{ color: '#666' }} />
            <Text type="secondary">
              {serverCount > 0 ? `服务器 ${serverCount}` : '服务器'}
            </Text>
          </Space>
        </Tooltip>
      </Space>

      <div style={{ flex: 1 }} />

      {/* 版本信息 */}
      <Text type="secondary" style={{ fontSize: 11 }}>v1.0.3-beta</Text>
    </div>
  )
}

export default StatusBar
