// Identical copies ship with source plugins so each package remains independent.
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'

export function sourceError(message, status = 409) {
  const error = new Error(message); error.status = status; error.code = 'REVIEW_SOURCE_ERROR'; throw error
}
export function sourceDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) sourceError('日期无效', 400)
  return value
}
export function businessDate(stamp) {
  if (!stamp || !Number.isFinite(Date.parse(stamp))) return null
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(stamp))
}
export async function readSource(file, version, arrays, empty) {
  let raw
  try { raw = await readFile(file, 'utf8') } catch (error) { if (error.code === 'ENOENT') return empty(); throw error }
  let state
  try { state = JSON.parse(raw) } catch { sourceError('来源文件损坏；未修改原文件') }
  if (state.version !== version || arrays.some(key => !Array.isArray(state[key]))) sourceError('来源版本或结构不支持；未修改原文件')
  return state
}
export function sourceRecord(provider, scopeId, row, kind, day, facts, locator = {}) {
  if (typeof row.id !== 'string' || !row.id || row.id.length > 160) sourceError('来源记录身份无效')
  sourceDate(day)
  return { provider, scopeId, entityId: row.id, kind, date: day, timePrecision: 'day', title: facts.title || row.id,
    facts, locator: { provider, scopeId, entityId: row.id, date: day, ...locator }, privacy: 'selectable' }
}
export function createSourceEndpoint({ provider, scopeId, project, now = () => new Date() }) {
  const snapshots = new Map()
  return async function read(url) {
    const from = sourceDate(url.searchParams.get('from')), to = sourceDate(url.searchParams.get('to'))
    if (to < from || Date.parse(to) - Date.parse(from) > 365 * 86400000) sourceError('范围须在 366 天内', 400)
    const token = url.searchParams.get('snapshot')
    const mode = url.searchParams.get('mode') || 'facts'
    const query = url.searchParams.get('query') || ''
    if (!['facts', 'references'].includes(mode) || mode === 'references' && (!query.trim() || query.length > 200 || !['todo', 'literature'].includes(provider))) sourceError('引用搜索参数无效', 400)
    const options = { mode, query: query.trim().toLowerCase() }
    let entry
    if (token) {
      entry = snapshots.get(token)
      if (!entry || entry.from !== from || entry.to !== to || entry.mode !== mode || entry.query !== options.query || now().getTime() - entry.at > 900000) sourceError('来源快照已过期，请重新预览')
      if (JSON.stringify(await project(from, to, options)) !== entry.exact) sourceError('来源已改变，请重新预览')
    } else {
      const projection = await project(from, to, options)
      if (!Array.isArray(projection.records) || new Set(projection.records.map(r => r.entityId)).size !== projection.records.length) sourceError('来源含重复或无效身份')
      for (const record of projection.records) if (record.provider !== provider || record.scopeId !== scopeId) sourceError('来源作用域不一致')
      entry = { ...projection, from, to, ...options, at: now().getTime(), token: randomUUID(), exact: JSON.stringify(projection) }
      for (const [key, value] of snapshots) if (now().getTime() - value.at > 900000) snapshots.delete(key)
      if (snapshots.size >= 16) snapshots.delete(snapshots.keys().next().value)
      snapshots.set(entry.token, entry)
    }
    const rawCursor = url.searchParams.get('cursor') || '0'
    if (!/^\d+$/.test(rawCursor) || rawCursor !== '0' && !token) sourceError('分页游标无效', 400)
    const cursor = Number(rawCursor), limit = 500
    if (!Number.isSafeInteger(cursor) || cursor > entry.records.length || cursor % limit !== 0) sourceError('分页游标无效', 400)
    const end = Math.min(cursor + limit, entry.records.length)
    return { schema: 1, provider, scopeId, range: { from, to }, observedAt: new Date(entry.at).toISOString(), snapshot: entry.token,
      capabilities: { readOnly: true, pagination: true, locate: true, fields: 'explicit_allowlist', privateFields: false },
      coverage: entry.coverage, warnings: entry.warnings || [], records: entry.records.slice(cursor, end), totals: entry.totals || {},
      pagination: { total: entry.records.length, complete: end === entry.records.length, nextCursor: end < entry.records.length ? String(end) : null } }
  }
}
