import { MakerDMG } from '@electron-forge/maker-dmg'
import { MakerSquirrel } from '@electron-forge/maker-squirrel'
import { MakerZIP } from '@electron-forge/maker-zip'

const config = {
  packagerConfig: {
    name: 'FTP Uploader',
    executableName: 'ftp-uploader',
    appBundleId: 'com.liguorui.ftp-uploader',
    icon: './resources/icon',
    asar: true,
    prune: false,
    ignore: (file: string) => {
      if (file.startsWith('/.git')) return true
      if (file.startsWith('/.github')) return true
      if (file.startsWith('/src')) return true
      if (file.startsWith('/tsconfig')) return true
      if (file.startsWith('/.vscode')) return true
      if (file.startsWith('/node_modules')) return true
      return false
    },
  },
  makers: [
    new MakerDMG({ format: 'ULFO' }),
    new MakerZIP({}, ['darwin']),
    new MakerSquirrel({ name: 'ftp-uploader' }),
  ],
}

export default config