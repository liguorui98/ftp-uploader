import React, { useState, useEffect } from 'react'
import { Space, Typography } from 'antd'
import {
  MinusOutlined,
  CloseOutlined,
  BorderOutlined,
  FullscreenOutlined,
} from '@ant-design/icons'

const { Text } = Typography

const TitleBar: React.FC = () => {
  const [platform, setPlatform] = useState<string>('darwin')

  useEffect(() => {
    if (window.electronAPI) {
      setPlatform(window.electronAPI.getPlatform())
    }
  }, [])

  const isMac = platform === 'darwin'

  return (
    <div className="titlebar" style={{ background: '#fafafa' }}>
      {/* macOS 红绿灯占位 */}
      {isMac && <div style={{ width: 70 }} />}

      {/* 标题 */}
      <div style={{ flex: 1, textAlign: isMac ? 'center' : 'left', paddingLeft: isMac ? 0 : 12 }}>
        <Text strong style={{ fontSize: 13 }}>FTP Uploader</Text>
      </div>

      {/* Windows 控制按钮 */}
      {!isMac && (
        <Space size={0}>
          <div
            className="titlebar-button"
            style={{
              padding: '8px 16px',
              cursor: 'pointer',
              transition: 'background 0.2s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = '#e6e6e6')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            <MinusOutlined />
          </div>
          <div
            className="titlebar-button"
            style={{
              padding: '8px 16px',
              cursor: 'pointer',
              transition: 'background 0.2s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = '#e6e6e6')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            <BorderOutlined />
          </div>
          <div
            className="titlebar-button"
            style={{
              padding: '8px 16px',
              cursor: 'pointer',
              transition: 'background 0.2s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = '#ff4d4f')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            <CloseOutlined style={{ color: '#fff' }} />
          </div>
        </Space>
      )}
    </div>
  )
}

export default TitleBar
