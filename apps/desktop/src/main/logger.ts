import electronLog from 'electron-log/main'

electronLog.initialize()
electronLog.transports.file.level = 'info'
electronLog.transports.console.level = 'info'

export const logger = {
  debug: (...args: unknown[]): void => electronLog.debug(...args),
  info: (...args: unknown[]): void => electronLog.info(...args),
  warn: (...args: unknown[]): void => electronLog.warn(...args),
  error: (...args: unknown[]): void => electronLog.error(...args),
}
