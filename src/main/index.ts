import { app, shell, BrowserWindow, globalShortcut, Menu, Tray, clipboard } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import trayIcon from '../../resources/tray.png?asset'
import { promisify } from 'util'
import childProcess from 'child_process'
import camelCase from 'lodash.camelcase'
import upperFirst from 'lodash.upperfirst'
import snakeCase from 'lodash.snakecase'
import kebabCase from 'lodash.kebabcase'

const exec = promisify(childProcess.exec)

const execPaste = async (): Promise<void> => {
  await exec(`osascript -e 'tell application "System Events" to keystroke "v" using command down'`)
}

const clipboardHistories: string[] = []

setInterval(() => {
  const text = clipboard.readText()
  const prevText = clipboardHistories?.[0]
  if (text === '' || text.trim() === '') {
    return
  }
  if (text === prevText) {
    return
  }
  clipboardHistories.unshift(text)
  clipboardHistories.splice(10)
}, 300)

// 受け取った文字列が30文字を超える場合は、末尾を省略する
const formatTextOverflows = (text: string): string => {
  if (text.length > 30) {
    return `${text.slice(0, 30)}...`
  }
  return text
}

const createWindow = (): void => {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    frame: false,
    transparent: true,
    show: false,
    fullscreen: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.maximize()
  mainWindow.setAlwaysOnTop(true, 'screen-saver')
  mainWindow.setIgnoreMouseEvents(true, { forward: true })
  mainWindow.setVisibleOnAllWorkspaces(true, {
    visibleOnFullScreen: true
  })
  mainWindow.setHiddenInMissionControl(true)

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.otomomik.transform-paste')

  const tray = new Tray(trayIcon)
  const contextMenu = Menu.buildFromTemplate([{ label: 'Quit', click: () => app.quit() }])
  tray.setContextMenu(contextMenu)

  globalShortcut.register('Cmd+Option+V', () => {
    const menu = Menu.buildFromTemplate(
      clipboardHistories.length === 0
        ? [{ label: 'No history' }]
        : [
            ...clipboardHistories.map((h) => {
              const plainText = h
              const camelCaseText = camelCase(plainText)
              const upperCamelCaseText = upperFirst(camelCaseText)
              const snakeCaseText = snakeCase(plainText)
              const upperSnakeCaseText = snakeCaseText.toUpperCase()
              const kebabCaseText = kebabCase(plainText)
              const upperKebabCaseText = kebabCaseText.toUpperCase()

              const texts = Array.from(
                new Set([
                  plainText,
                  camelCaseText,
                  upperCamelCaseText,
                  snakeCaseText,
                  upperSnakeCaseText,
                  kebabCaseText,
                  upperKebabCaseText
                ])
              ).filter((t) => t !== '')

              return {
                label: formatTextOverflows(h),
                submenu: texts.map((t) => ({
                  label: formatTextOverflows(t),
                  click: async (): Promise<void> => {
                    clipboard.writeText(t)
                    await execPaste()
                  }
                }))
              }
            }),
            {
              type: 'separator'
            },
            {
              label: 'Clear',
              click: (): void => {
                clipboard.clear()
                clipboardHistories.splice(0)
              }
            }
          ]
    )
    menu.popup()
  })

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  createWindow()

  app.on('activate', () => {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// In this file you can include the rest of your app"s specific main process
// code. You can also put them in separate files and require them here.
