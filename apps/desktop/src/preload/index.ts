import { contextBridge } from 'electron'
import { omnideskApi } from './api'

contextBridge.exposeInMainWorld('omnidesk', omnideskApi)
