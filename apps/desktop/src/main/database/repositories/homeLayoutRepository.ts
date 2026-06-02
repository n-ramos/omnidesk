import { randomUUID } from 'node:crypto'
import type { Database } from 'better-sqlite3'
import type { HomeWidgetInstance } from '@shared/models'

interface HomeWidgetRow {
  id: string
  widget_id: string
  position_index: number
  x: number
  y: number
  w: number
  h: number
  config_json: string | null
}

const mapRow = (row: HomeWidgetRow): HomeWidgetInstance => {
  let config: Record<string, unknown> | undefined
  if (row.config_json) {
    try {
      config = JSON.parse(row.config_json) as Record<string, unknown>
    } catch {
      config = undefined
    }
  }

  return {
    id: row.id,
    widgetId: row.widget_id,
    x: row.x,
    y: row.y,
    w: row.w,
    h: row.h,
    config,
  }
}

export class HomeLayoutRepository {
  constructor(private readonly db: Database) {}

  list(): HomeWidgetInstance[] {
    const rows = this.db
      .prepare(
        `SELECT id, widget_id, position_index, x, y, w, h, config_json
         FROM home_widgets
         ORDER BY position_index ASC, created_at ASC`,
      )
      .all() as HomeWidgetRow[]

    return rows.map(mapRow)
  }

  replaceAll(widgets: HomeWidgetInstance[]): HomeWidgetInstance[] {
    const insert = this.db.prepare(
      `INSERT INTO home_widgets (id, widget_id, position_index, x, y, w, h, config_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )

    const txn = this.db.transaction((entries: HomeWidgetInstance[]) => {
      this.db.prepare(`DELETE FROM home_widgets`).run()

      entries.forEach((widget, index) => {
        const id = widget.id || randomUUID()
        const configJson = widget.config ? JSON.stringify(widget.config) : null
        insert.run(id, widget.widgetId, index, widget.x, widget.y, widget.w, widget.h, configJson)
      })
    })

    txn(widgets)
    return this.list()
  }
}
