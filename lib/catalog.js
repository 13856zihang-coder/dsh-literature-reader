import { randomUUID } from 'node:crypto'
import { lstat, mkdir, readFile, readdir, realpath, stat } from 'node:fs/promises'
import path from 'node:path'
import { HttpError, writeFileAtomic, writeJson } from './util.js'
import { baseNameRel, dirnameRel, fileStem, invalidateVaultCache, normalizeRel, parseFrontmatter, safeVaultPath, scanVault, tagList } from './vault.js'

export const CATALOG_FILE = 'catalog.json'
const PRIVATE = /^(?:\.\w.*|_附件|node_modules|credentials(?:\.json)?|tokens\.json)$/i
const FIELDS = new Set(['title', 'tags', 'addTags', 'removeTags', 'authors', 'year', 'venue', 'doi', 'importance', 'readingState', 'understandingSummary', 'reviewedAt'])
export const pathKey = (value) => normalizeRel(value).toLowerCase()
export const identityOf = (info) => `${info.dev}:${info.ino}`
export const observationOf = (info) => ({ identity: identityOf(info), size: info.size, mtime: info.mtimeMs })
export const sameObservation = (a, b) => Boolean(a && b && a.identity === b.identity && a.size === b.size && a.mtime === b.mtime)

export async function checkedPath(vault, rel, { allowMissing = false, attachments = false } = {}) {
  if (typeof rel !== 'string' || /[\u0000-\u001f:]/.test(rel) || /^[\\/]/.test(rel)) throw new HttpError(400, '无效的仓库相对路径')
  const normalized = normalizeRel(rel)
  const parts = normalized ? normalized.split('/') : []
  for (const part of parts) {
    if (part === '.' || part === '..' || /[<>"|?*]/.test(part) || /[. ]$/.test(part) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part)
      || (PRIVATE.test(part) && !(attachments && part === '_附件'))) throw new HttpError(400, '路径包含不支持的目录或名称')
  }
  const root = path.resolve(vault)
  const rootInfo = await lstat(root)
  if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink()) throw new HttpError(400, '仓库必须是本地普通目录')
  const resolvedRoot = await realpath(root)
  let current = root
  for (let index = 0; index < parts.length; index += 1) {
    current = path.join(current, parts[index])
    const info = await lstat(current).catch((error) => {
      if (allowMissing && error.code === 'ENOENT') return null
      throw error
    })
    if (!info) continue
    if (info.isSymbolicLink()) throw new HttpError(400, '不支持符号链接或重解析目录')
    const resolved = await realpath(current)
    const relative = path.relative(resolvedRoot, resolved)
    if (path.isAbsolute(relative) || relative.split(path.sep).includes('..')) throw new HttpError(400, '路径越出仓库')
  }
  return safeVaultPath(root, normalized)
}

export function patchSharedFields(raw, patch) {
  const newline = raw.includes('\r\n') ? '\r\n' : '\n'
  const bom = raw.startsWith('\uFEFF') ? '\uFEFF' : ''
  const text = raw.slice(bom.length)
  const match = text.match(/^---\r?\n([\s\S]*?)^---[ \t]*(?:\r?\n|$)/m)
  if (text.startsWith('---') && (!match || match.index !== 0)) throw new HttpError(409, '笔记属性结构无法安全修改，请先在 Obsidian 中检查')
  let block = match ? match[1] : ''
  for (const key of ['title', 'tags']) {
    if (!Object.hasOwn(patch, key)) continue
    const keys = key === 'tags' ? ['tags', 'tag'] : ['title']
    for (const field of keys) {
      const expression = new RegExp(`^${field}:[^\\r\\n]*(?:\\r?\\n(?:[ \\t]+[^\\r\\n]*|[ \\t]*))*\\r?\\n?`, 'gm')
      const matches = [...block.matchAll(expression)]
      if (matches.length > 1) throw new HttpError(409, '笔记含重复属性，不能安全覆盖')
      if (matches.length) block = block.slice(0, matches[0].index) + block.slice(matches[0].index + matches[0][0].length)
    }
    const value = key === 'tags' ? JSON.stringify(patch.tags) : JSON.stringify(patch.title)
    block = `${block}${block && !block.endsWith('\n') ? newline : ''}${key}: ${value}${newline}`
  }
  return `${bom}---${newline}${block}---${match ? text.slice(match[0].length - (match[0].endsWith('\n') ? newline.length : 0)) : `${newline}${newline}${text}`}`
}

function normalizePatch(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new HttpError(400, '缺少属性修改')
  for (const key of Object.keys(input)) if (!FIELDS.has(key)) throw new HttpError(400, `不支持的属性：${key}`)
  const patch = { ...input }
  for (const key of ['title', 'venue', 'doi', 'understandingSummary']) {
    if (!Object.hasOwn(patch, key)) continue
    if (typeof patch[key] !== 'string' || patch[key].length > (key === 'understandingSummary' ? 4000 : 500) || (key === 'title' && !patch[key].trim())) throw new HttpError(400, `${key} 格式或长度无效`)
    patch[key] = patch[key].trim()
  }
  for (const key of ['tags', 'addTags', 'removeTags', 'authors']) {
    if (!Object.hasOwn(patch, key)) continue
    if (!Array.isArray(patch[key]) || patch[key].length > 100 || patch[key].some((value) => typeof value !== 'string' || value.length > 200)) throw new HttpError(400, `${key} 必须是文本数组`)
    patch[key] = [...new Set(patch[key].map((value) => value.trim().replace(key === 'authors' ? /^$/ : /^#/, '')).filter(Boolean))]
  }
  if (Object.hasOwn(patch, 'year') && patch.year !== null && (!Number.isInteger(patch.year) || patch.year < 1 || patch.year > 9999)) throw new HttpError(400, '年份无效')
  if (Object.hasOwn(patch, 'importance') && !['unset', 'low', 'medium', 'high'].includes(patch.importance)) throw new HttpError(400, '重要程度无效')
  if (Object.hasOwn(patch, 'readingState') && !['unread', 'reading', 'read'].includes(patch.readingState)) throw new HttpError(400, '阅读状态无效')
  if (Object.hasOwn(patch, 'reviewedAt') && patch.reviewedAt !== null && !Number.isFinite(Date.parse(patch.reviewedAt))) throw new HttpError(400, '回顾时间无效')
  return patch
}

function validateStore(value) {
  if (!value || value.schema !== 1 || !Number.isSafeInteger(value.revision) || !Array.isArray(value.records) || !Array.isArray(value.views)
    || value.records.some((record) => !record || typeof record.id !== 'string' || !['pdf', 'note'].includes(record.type) || typeof record.rel !== 'string' || !Number.isSafeInteger(record.revision) || !record.manual || typeof record.manual !== 'object')
    || new Set(value.records.map((record) => record.id)).size !== value.records.length) throw new HttpError(409, '资料管理文件损坏或版本不支持；原文件已保留，相关写入已停止')
  return value
}

export class Catalog {
  constructor({ dataDir, getVault, listPapers, updatePaper = async () => {} }) {
    this.dataDir = dataDir
    this.getVault = getVault
    this.listPapers = listPapers
    this.updatePaper = updatePaper
    this.file = path.join(dataDir, CATALOG_FILE)
    this.queue = Promise.resolve()
    this.snapshots = new Map()
    this.scanResult = null
  }

  async load() {
    let raw
    try { raw = await readFile(this.file, 'utf8') } catch (error) {
      if (error.code !== 'ENOENT') throw error
      return { schema: 1, revision: 0, records: [], views: [] }
    }
    try { return validateStore(JSON.parse(raw)) } catch (error) {
      if (error instanceof HttpError) throw error
      throw new HttpError(409, '资料管理文件无法读取；原文件已保留，相关写入已停止')
    }
  }

  exclusive(action) {
    const run = this.queue.then(action, action)
    this.queue = run.catch(() => {})
    return run
  }

  async save(store) {
    await mkdir(this.dataDir, { recursive: true })
    store.revision += 1
    await writeJson(this.file, store)
  }

  async scan(force = false) {
    if (this.scanning) return this.scanning
    if (!force && this.scanResult && Date.now() - this.scanTime < 2500) return this.scanResult
    this.scanning = (async () => {
      const vault = await this.getVault()
      if (!vault?.path) throw new HttpError(400, '未找到 Obsidian 库')
      await checkedPath(vault.path, '')
      const scan = await scanVault(vault.path, { refresh: true, reparse: force })
      const papers = await this.listPapers()
      this.scanResult = { vault, scan, papers, files: new Map([...scan.pdfs, ...scan.notes].map((file) => [pathKey(file.rel), file])) }
      this.scanTime = Date.now()
      return this.scanResult
    })().finally(() => { this.scanning = null })
    return this.scanning
  }

  async refresh() {
    return this.exclusive(async () => {
      const store = await this.load()
      const data = await this.scan(true)
      if (store.root && path.resolve(store.root).toLowerCase() !== path.resolve(data.vault.path).toLowerCase()) throw new HttpError(409, '仓库根已改变，请单独迁移资料身份，不能自动换根')
      store.root = data.vault.path
      const byPath = new Map(store.records.map((record) => [pathKey(record.rel), record]))
      const missing = store.records.filter((record) => !data.files.has(pathKey(record.rel)))
      const byIdentity = new Map(missing.filter((record) => record.observation).map((record) => [record.observation.identity, record]))
      for (const file of data.files.values()) {
        if (file.rel.split('/').some((part) => PRIVATE.test(part))) continue
        let info
        try { info = await stat(await checkedPath(data.vault.path, file.rel)) } catch { continue }
        const old = byPath.get(pathKey(file.rel))
        const paper = data.papers.find((meta) => pathKey(meta.vaultPath) === pathKey(file.rel))
        if (old) {
          if (!old.paperId && paper && (!old.observation || old.observation.identity === identityOf(info))) old.paperId = paper.id
          continue
        }
        if (byIdentity.has(identityOf(info))) continue
        store.records.push({ id: randomUUID(), type: file.type === 'pdf' ? 'pdf' : 'note', rel: file.rel, paperId: paper?.id || '',
          revision: 0, manual: {}, observation: observationOf(info), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
      }
      await this.save(store)
      return { registered: store.records.length, scanState: data.scan.scanState || { complete: true, issues: [] } }
    })
  }

  async project(record, data) {
    const file = data.files.get(pathKey(record.rel))
    const meta = data.papers.find((paper) => paper.id === record.paperId) || {}
    let fileState = 'ready'
    let candidates = []
    let info
    try { info = await stat(await checkedPath(data.vault.path, record.rel)) } catch (error) {
      fileState = error.code === 'ENOENT' ? 'missing' : 'unavailable'
    }
    if (!file && fileState === 'ready') fileState = 'unindexed'
    if (!info && record.observation) {
      candidates = [...data.files.values()].filter((entry) => entry.identity === record.observation.identity).map((entry) => entry.rel)
      if (candidates.length) fileState = 'needs_relink'
    }
    if (info && record.observation && !sameObservation(record.observation, observationOf(info))) fileState = 'content_changed'
    const sourceRel = record.type === 'note' ? record.rel : file?.noteRel || ''
    const source = data.scan.notes.find((note) => pathKey(note.rel) === pathKey(sourceRel))
    const manual = record.manual
    const tags = source ? source.tags : manual.tags || meta.tags || []
    const title = source?.explicitTitle ? source.title : manual.title || file?.title || meta.title || fileStem(record.rel)
    const relatedNotes = record.type === 'pdf' ? data.scan.notes.filter((note) => note.pdfTargets?.some((target) => {
      const cleaned = String(target).replace(/\\/g, '/').toLowerCase()
      return cleaned === pathKey(record.rel) || cleaned === baseNameRel(record.rel).toLowerCase()
    }) || note.rel === file?.noteRel || note.stem === `${file?.stem} 笔记` && note.folder === file?.folder).map((note) => ({ rel: note.rel, title: note.title, isSummary: note.isSummary })) : []
    return { id: record.id, revision: record.revision, rel: record.rel, type: record.type, paperId: record.paperId, fileName: baseNameRel(record.rel), folder: dirnameRel(record.rel),
      title, tags, originalTitle: meta.originalTitle || meta.extractedMetadata?.title || meta.title || '',
      authors: manual.authors ?? meta.authors ?? [], year: manual.year ?? meta.year ?? null, venue: manual.venue ?? meta.venue ?? '', doi: manual.doi ?? meta.doi ?? '',
      abstract: fileState === 'content_changed' ? '' : meta.abstract || meta.tldr || '', understandingSummary: manual.understandingSummary || '',
      importance: manual.importance || 'unset', readingState: manual.readingState || 'unread', readAt: manual.readAt || null, reviewedAt: manual.reviewedAt || null,
      updatedAt: record.updatedAt, sourceRel, fileState, candidates, processingState: meta.status || 'unread', relatedNotes,
      summaryRel: relatedNotes.find((note) => note.isSummary)?.rel || '', readerNoteRel: relatedNotes.find((note) => / 笔记\.md$/i.test(note.rel))?.rel || '',
      size: file?.size || 0 }
  }

  async list(query = {}) {
    const [store, data] = await Promise.all([this.load(), this.scan()])
    const items = []
    // Eight pending stats keep large catalogs responsive without unbounded I/O.
    for (let index = 0; index < store.records.length; index += 8) items.push(...await Promise.all(store.records.slice(index, index + 8).map((record) => this.project(record, data))))
    const tags = Array.isArray(query.tags) ? query.tags : String(query.tags || '').split(',').filter(Boolean)
    const term = String(query.query || '').trim().toLowerCase()
    const folder = normalizeRel(query.folder)
    const filtered = items.filter((item) => (!query.type || item.type === query.type)
      && (!folder || item.folder === folder || query.includeChildren !== '0' && query.includeChildren !== false && item.folder.startsWith(`${folder}/`))
      && tags.every((tag) => item.tags.includes(tag))
      && (!query.author || item.authors.some((author) => author.toLowerCase().includes(String(query.author).toLowerCase())))
      && (!query.year || String(item.year) === String(query.year))
      && (!query.importance || item.importance === query.importance)
      && (!query.readingState || item.readingState === query.readingState)
      && (!query.fileState || item.fileState === query.fileState)
      && (!term || [item.title, item.originalTitle, item.fileName, item.folder, ...item.authors, ...item.tags, item.understandingSummary, item.doi].join(' ').toLowerCase().includes(term)))
    const rank = { unset: 0, low: 1, medium: 2, high: 3 }
    filtered.sort((a, b) => (query.sort === 'importance' ? rank[b.importance] - rank[a.importance] : query.sort === 'updated' ? b.updatedAt.localeCompare(a.updatedAt) : query.sort === 'reviewed' ? String(b.reviewedAt).localeCompare(String(a.reviewedAt)) : 0)
      || a.title.localeCompare(b.title, 'zh-CN') || a.rel.localeCompare(b.rel, 'zh-CN'))
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 50))
    const page = Math.max(1, Math.min(Math.ceil(filtered.length / pageSize) || 1, Number(query.page) || 1))
    return { items: filtered.slice((page - 1) * pageSize, page * pageSize), total: filtered.length, page, pageSize,
      facets: { tags: [...new Set(items.flatMap((item) => item.tags))].sort(), authors: [...new Set(items.flatMap((item) => item.authors))].sort(), years: [...new Set(items.map((item) => item.year).filter(Boolean))].sort((a, b) => b - a) },
      folders: data.scan.folders.filter((folder) => !folder.rel.split('/').some((part) => PRIVATE.test(part))), vault: data.vault,
      scanState: data.scan.scanState || { complete: true, issues: [] }, registered: store.records.length, views: store.views }
  }

  async detail(id) {
    const [store, data] = await Promise.all([this.load(), this.scan()])
    const record = store.records.find((record) => record.id === id)
    if (!record) throw new HttpError(404, '资料不存在')
    const item = await this.project(record, data)
    let raw = null
    if (item.sourceRel) raw = await readFile(await checkedPath(data.vault.path, item.sourceRel), 'utf8')
    const token = randomUUID()
    this.snapshots.set(token, { id, revision: record.revision, sourceRel: item.sourceRel, raw, at: Date.now() })
    for (const [key, value] of this.snapshots) if (Date.now() - value.at > 3600_000) this.snapshots.delete(key)
    return { ...item, sourceVersion: token }
  }

  async update(items, inputPatch) {
    const patch = normalizePatch(inputPatch)
    if (!Array.isArray(items) || !items.length || items.length > 3000 || new Set(items.map((item) => item.id)).size !== items.length) throw new HttpError(400, '批量资料清单无效')
    return this.exclusive(async () => {
      const beforeStore = await this.load()
      const store = structuredClone(beforeStore)
      const data = await this.scan()
      const changes = new Map()
      const paperChanges = []
      for (const input of items) {
        const record = store.records.find((record) => record.id === input.id)
        if (!record) throw new HttpError(404, '资料不存在')
        if (record.revision !== input.revision) throw new HttpError(409, '资料已更新，请重新载入后保存')
        const snapshot = this.snapshots.get(input.sourceVersion)
        if (!snapshot || snapshot.id !== input.id || snapshot.revision !== input.revision) throw new HttpError(409, '编辑依据已过期，请重新打开详情')
        const item = await this.project(record, data)
        if (snapshot.sourceRel !== item.sourceRel) throw new HttpError(409, '关联笔记已改变，请重新载入')
        const values = { ...patch }
        values.tags = patch.tags || [...new Set([...item.tags, ...(patch.addTags || [])])].filter((tag) => !(patch.removeTags || []).includes(tag))
        if (!['tags', 'addTags', 'removeTags'].some((key) => Object.hasOwn(patch, key))) delete values.tags
        delete values.addTags
        delete values.removeTags
        if (Object.hasOwn(values, 'readingState')) values.readAt = values.readingState === 'read' ? record.manual.readAt || new Date().toISOString() : null
        if (item.sourceRel && (Object.hasOwn(values, 'title') || Object.hasOwn(values, 'tags'))) {
          const file = await checkedPath(data.vault.path, item.sourceRel)
          const raw = await readFile(file, 'utf8')
          if (raw !== snapshot.raw) throw new HttpError(409, 'Obsidian 中的笔记已被修改，请重新载入；没有覆盖外部编辑')
          const next = patchSharedFields(raw, values)
          const previous = changes.get(item.sourceRel)
          if (previous && previous.after !== next) throw new HttpError(409, '同一关联笔记存在不一致的批量修改')
          changes.set(item.sourceRel, { rel: item.sourceRel, before: raw, after: next })
        }
        Object.assign(record.manual, values)
        record.updatedAt = new Date().toISOString()
        record.revision += 1
        if (record.paperId) paperChanges.push({ paperId: record.paperId, values })
      }
      const operation = { schema: 1, id: randomUUID(), kind: 'metadata', status: 'running', createdAt: new Date().toISOString(),
        files: [...changes.values()], catalogBefore: beforeStore, catalogAfter: { ...store, revision: store.revision + 1 } }
      const operationFile = path.join(this.dataDir, 'operations', `${operation.id}.json`)
      await mkdir(path.dirname(operationFile), { recursive: true })
      await writeJson(operationFile, operation)
      const written = []
      try {
        for (const change of changes.values()) {
          const file = await checkedPath(data.vault.path, change.rel)
          if (await readFile(file, 'utf8') !== change.before) throw new HttpError(409, '写入前检测到外部修改')
          await writeFileAtomic(file, change.after)
          written.push(change)
        }
        for (const change of paperChanges) await this.updatePaper(change.paperId, change.values)
        for (const change of written) {
          const observation = observationOf(await stat(await checkedPath(data.vault.path, change.rel)))
          for (const record of store.records) if (pathKey(record.rel) === pathKey(change.rel)) record.observation = observation
        }
        await this.save(store)
        operation.status = 'completed'
        operation.catalogAfter = store
        await writeJson(operationFile, operation)
      } catch (error) {
        operation.status = 'recovery_needed'
        operation.error = error.message
        await writeJson(operationFile, operation).catch(() => {})
        throw error
      }
      invalidateVaultCache()
      this.scanResult = null
      return Promise.all(items.map((item) => this.detail(item.id)))
    })
  }

  async relink(id, input) {
    if (input.confirmed !== true) throw new HttpError(400, '重新定位需要确认')
    return this.exclusive(async () => {
      const store = await this.load()
      const record = store.records.find((record) => record.id === id)
      if (!record) throw new HttpError(404, '资料不存在')
      if (record.revision !== input.revision) throw new HttpError(409, '资料已改变')
      const data = await this.scan(true)
      const file = data.files.get(pathKey(input.rel))
      if (!file || (record.type === 'pdf') !== (file.type === 'pdf')) throw new HttpError(400, '目标文件类型不匹配或不存在')
      if (store.records.some((other) => other.id !== id && pathKey(other.rel) === pathKey(input.rel))) throw new HttpError(409, '目标已属于另一份资料，不能自动合并')
      const info = await stat(await checkedPath(data.vault.path, input.rel))
      if (record.observation && record.observation.identity !== identityOf(info) && input.acceptReplacement !== true) throw new HttpError(409, '候选不是原物理文件；替换内容需要明确确认')
      const oldRel = record.rel
      record.rel = file.rel
      record.observation = observationOf(info)
      record.revision += 1
      if (record.paperId) await this.updatePaper(record.paperId, { vaultPath: record.rel, fileName: file.fileName, vaultExists: true })
      await this.save(store)
      this.scanResult = null
      return { item: await this.detail(id), oldRel }
    })
  }

  async views(method, input, id) {
    if (method === 'GET') return { views: (await this.load()).views }
    return this.exclusive(async () => {
      const store = await this.load()
      if (method === 'DELETE') store.views = store.views.filter((view) => view.id !== id)
      else {
        if (typeof input.name !== 'string' || !input.name.trim() || input.name.length > 100 || !input.query || typeof input.query !== 'object' || Array.isArray(input.query)) throw new HttpError(400, '筛选名称或条件无效')
        const allowed = ['query', 'type', 'tags', 'author', 'year', 'importance', 'readingState', 'fileState', 'folder', 'includeChildren', 'sort']
        const query = Object.fromEntries(Object.entries(input.query).filter(([key]) => allowed.includes(key)))
        const view = { id: id || randomUUID(), name: input.name.trim(), query }
        store.views = store.views.filter((existing) => existing.id !== view.id)
        store.views.push(view)
        await this.save(store)
        return { view }
      }
      await this.save(store)
      return { ok: true }
    })
  }
}
