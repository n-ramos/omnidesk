import type { Component } from 'vue'

export interface WidgetSize {
  w: number
  h: number
}

export interface WidgetDefinition {
  id: string
  name: string
  description: string
  defaultSize: WidgetSize
  minSize?: WidgetSize
  maxSize?: WidgetSize
  component: Component
}

export interface WidgetProps<TConfig = Record<string, unknown>> {
  config?: TConfig
  editMode: boolean
}

export interface WidgetEmits<TConfig = Record<string, unknown>> {
  (event: 'update:config', value: TConfig): void
}
