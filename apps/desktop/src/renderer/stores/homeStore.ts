import { defineStore } from 'pinia'
import { errorMessage } from '@shared/errors'
import type { HomeWidgetInstance } from '@shared/models'
import { getWidgetDefinition } from '@renderer/widgets/registry'

interface HomeState {
  widgets: HomeWidgetInstance[]
  isEditing: boolean
  isLoading: boolean
  isLoaded: boolean
  error?: string
}

const GRID_COLS = 12

const generateId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `widget-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

const nextAvailablePosition = (widgets: HomeWidgetInstance[]): number => {
  if (widgets.length === 0) {
    return 0
  }
  return Math.max(...widgets.map((widget) => widget.y + widget.h))
}

const fallbackLayout = (): HomeWidgetInstance[] => [
  { id: generateId(), widgetId: 'clock', x: 0, y: 0, w: 4, h: 4 },
  { id: generateId(), widgetId: 'weather', x: 4, y: 0, w: 4, h: 5 },
  { id: generateId(), widgetId: 'unread-by-account', x: 8, y: 0, w: 4, h: 6 },
  { id: generateId(), widgetId: 'recent-notifications', x: 0, y: 6, w: 8, h: 6 },
]

export const useHomeStore = defineStore('home', {
  state: (): HomeState => ({
    widgets: [],
    isEditing: false,
    isLoading: false,
    isLoaded: false,
  }),

  getters: {
    columnCount: () => GRID_COLS,
  },

  actions: {
    async loadLayout(): Promise<void> {
      const api = window.omnidesk
      if (!api?.home?.getLayout) {
        if (!this.isLoaded) {
          this.widgets = fallbackLayout()
          this.isLoaded = true
        }
        return
      }

      this.isLoading = true
      this.error = undefined

      try {
        const layout = await api.home.getLayout()
        if (layout.widgets.length === 0 && !this.isLoaded) {
          this.widgets = fallbackLayout()
          await this.saveLayout()
        } else {
          this.widgets = layout.widgets
        }
        this.isLoaded = true
      } catch (error) {
        this.error = errorMessage(error, "Impossible de charger l'accueil.")
        if (!this.isLoaded) {
          this.widgets = fallbackLayout()
          this.isLoaded = true
        }
      } finally {
        this.isLoading = false
      }
    },

    async saveLayout(): Promise<void> {
      const api = window.omnidesk
      if (!api?.home?.saveLayout) {
        return
      }

      const payload: HomeWidgetInstance[] = this.widgets.map((widget) => ({
        id: widget.id,
        widgetId: widget.widgetId,
        x: widget.x,
        y: widget.y,
        w: widget.w,
        h: widget.h,
        config: widget.config
          ? (JSON.parse(JSON.stringify(widget.config)) as Record<string, unknown>)
          : undefined,
      }))

      try {
        await api.home.saveLayout(payload)
      } catch (error) {
        this.error = errorMessage(error, "Impossible d'enregistrer l'accueil.")
        console.error('[homeStore] saveLayout failed', error)
      }
    },

    toggleEditMode(): void {
      this.isEditing = !this.isEditing
    },

    addWidget(widgetId: string): void {
      const definition = getWidgetDefinition(widgetId)
      if (!definition) {
        return
      }

      const width = Math.min(definition.defaultSize.w, GRID_COLS)
      const newWidget: HomeWidgetInstance = {
        id: generateId(),
        widgetId,
        x: 0,
        y: nextAvailablePosition(this.widgets),
        w: width,
        h: definition.defaultSize.h,
      }

      this.widgets = [...this.widgets, newWidget]
      void this.saveLayout()
    },

    removeWidget(id: string): void {
      this.widgets = this.widgets.filter((widget) => widget.id !== id)
      void this.saveLayout()
    },

    updateWidgetConfig(id: string, config: Record<string, unknown>): void {
      this.widgets = this.widgets.map((widget) =>
        widget.id === id ? { ...widget, config } : widget,
      )
      void this.saveLayout()
    },

    applyGridUpdate(items: Array<{ i: string; x: number; y: number; w: number; h: number }>): void {
      const byId = new Map(items.map((item) => [item.i, item]))
      let changed = false

      const next = this.widgets.map((widget) => {
        const update = byId.get(widget.id)
        if (!update) {
          return widget
        }
        if (
          update.x === widget.x &&
          update.y === widget.y &&
          update.w === widget.w &&
          update.h === widget.h
        ) {
          return widget
        }

        changed = true
        return { ...widget, x: update.x, y: update.y, w: update.w, h: update.h }
      })

      if (changed) {
        this.widgets = next
        void this.saveLayout()
      }
    },

    resetToDefault(): void {
      this.widgets = fallbackLayout()
      void this.saveLayout()
    },
  },
})
