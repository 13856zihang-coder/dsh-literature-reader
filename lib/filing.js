import { constants } from 'node:fs'
import { copyFile, lstat, mkdir, open, readFile, readdir, rename, rmdir, stat, unlink } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { checkedPath, observationOf, pathKey } from './catalog.js'
import { baseNameRel, dirnameRel, fileStem, invalidateVaultCache, normalizeRel } from './vault.js'
import { HttpError, writeFileAtomic, writeJson } from './util.js'
import { rewriteVaultLinks } from './vault-links.js'

const ID_RE = /^[a-z0-9-]{1,100}$/i
const exists = async (file) => lstat(file).catch((error) => { if (error.code === 'ENOENT') return null; throw error })

export async function sameFileBytes(left, right) {
  const handles = []
  try {
    handles.push(await open(left, 'r'))
    handles.push(await open(right, 'r'))
    const [a, b] = await Promise.all(handles.map((handle) => handle.stat()))
    if (a.size !== b.size) return false
    const buffers = [Buffer.alloc(64 * 1024), Buffer.alloc(64 * 1024)]
    let position = 0
    while (position < a.size) {
      const results = await Promise.all(handles.map((handle, i) => handle.read(buffers[i], 0, buffers[i].length, position)))
      if (results[0].bytesRead !== results[1].bytesRead || !results[0].bytesRead || !buffers[0].subarray(0, results[0].bytesRead).equals(buffers[1].subarray(0, results[1].bytesRead))) return false
      position += results[0].bytesRead
    }
    return true
  } finally { await Promise.all(handles.map((handle) => handle.close())) }
}

export function publicOperation(operation) {
  return { id: operation.id, revision: operation.revision, kind: operation.kind, status: operation.status, createdAt: operation.createdAt,
    newFolders: operation.newFolders || [], blocked: operation.blocked || [], error: operation.error || '', cancelRequested: Boolean(operation.cancelRequested),
    steps: (operation.steps || []).map(({ from, to, kind, done }) => ({ from, to, kind, done: Boolean(done) })),
    links: (operation.files || []).filter((file) => file.after !== undefined).map((file) => ({ rel: file.to, changes: file.linkCount || 0 })),
    completed: (operation.steps || []).filter((step) => step.done).length, total: (operation.steps || []).length }
}

export class Filing {
  constructor({ catalog, isPaperBusy = () => false }) {
    this.catalog = catalog
    this.isPaperBusy = isPaperBusy
    this.dir = path.join(catalog.dataDir, 'operations')
    this.active = new Map()
    this.writes = new Map()
    this.closed = false
    this.ready = this.recoverRunning()
  }

  filename(id) {
    if (typeof id !== 'string' || !ID_RE.test(id)) throw new HttpError(400, '无效的操作编号')
    return path.join(this.dir, `${id}.json`)
  }

  async persist(operation) {
    await mkdir(this.dir, { recursive: true })
    const previous = this.writes.get(operation.id) || Promise.resolve()
    const next = previous.catch(() => {}).then(() => writeJson(this.filename(operation.id), operation))
    this.writes.set(operation.id, next)
    try { await next } finally { if (this.writes.get(operation.id) === next) this.writes.delete(operation.id) }
  }

  async load(id) {
    await this.ready
    if (this.active.has(id)) return this.active.get(id)
    let value
    try { value = JSON.parse(await readFile(this.filename(id), 'utf8')) } catch (error) {
      if (error.code === 'ENOENT') throw new HttpError(404, '整理操作不存在')
      throw new HttpError(409, '操作记录损坏，已保留原文件')
    }
    if (value.schema !== 1 || value.id !== id || !['filing', 'metadata'].includes(value.kind)) throw new HttpError(409, '不支持的操作记录版本')
    return value
  }

  async recoverRunning() {
    const entries = await readdir(this.dir).catch((error) => { if (error.code === 'ENOENT') return []; throw error })
    for (const name of entries) {
      if (!/^[a-z0-9-]+\.json$/i.test(name)) continue
      let operation
      try { operation = JSON.parse(await readFile(path.join(this.dir, name), 'utf8')) } catch { continue }
      if (operation.schema === 1 && operation.status === 'running') {
        operation.status = 'recovery_needed'
        operation.error = '上次操作中断，请核对实际位置后恢复或撤销'
        await this.persist(operation)
      }
    }
  }

  async list() {
    await this.ready
    const entries = await readdir(this.dir).catch((error) => { if (error.code === 'ENOENT') return []; throw error })
    const operations = []
    for (const name of entries) {
      if (!/^[a-z0-9-]+\.json$/i.test(name)) continue
      try { operations.push(publicOperation(await this.load(name.slice(0, -5)))) } catch (error) { operations.push({ id: name.slice(0, -5), status: 'unavailable', error: error.message }) }
    }
    return operations.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
  }

  async collect(root, rel) {
    const absolute = await checkedPath(root, rel, { attachments: true })
    const info = await lstat(absolute)
    if (info.isFile()) return [{ rel, kind: 'assets' }]
    if (!info.isDirectory()) throw new HttpError(400, '只能整理普通文件和目录')
    const out = []
    for (const entry of await readdir(absolute, { withFileTypes: true })) out.push(...await this.collect(root, `${rel}/${entry.name}`))
    return out
  }

  async preview(input) {
    await this.ready
    if (this.closed) throw new HttpError(409, '插件正在关闭')
    return this.catalog.exclusive(async () => {
      const store = await this.catalog.load()
      const data = await this.catalog.scan(true)
      const plan = { schema: 1, kind: 'filing', id: randomUUID(), revision: 1, root: data.vault.path, status: 'preview',
        createdAt: new Date().toISOString(), newFolders: [], blocked: [], steps: [], files: [], watched: [],
        catalogRevision: store.revision, catalogChanges: [], inventory: [...data.files.keys()].sort() }
      if (!data.scan.scanState?.complete && data.scan.scanState) plan.blocked.push('仓库扫描不完整，无法确认链接检查范围')
      const pending = (await this.list()).filter((operation) => ['running', 'recovery_needed', 'partial'].includes(operation.status))
      if (pending.length) plan.blocked.push('有未完成的文件操作，请先恢复或撤销')
      const add = (from, to, kind) => {
        if (from === to) return
        const previous = plan.steps.find((step) => pathKey(step.from) === pathKey(from))
        if (previous) { if (previous.to !== to) plan.blocked.push(`同一文件被指定了不同目标：${from}`); return }
        plan.steps.push({ from, to, kind, done: false })
      }
      const selections = input.items
      if (input.action === 'rename-folder') {
        const from = normalizeRel(input.folderRel)
        if (!from || typeof input.name !== 'string' || !input.name || /[\\/]/.test(input.name)) throw new HttpError(400, '文件夹名称无效')
        const to = path.posix.join(dirnameRel(from), input.name)
        await checkedPath(plan.root, to, { allowMissing: true })
        const entries = await this.collect(plan.root, from)
        for (const file of entries) add(file.rel, `${to}${file.rel.slice(from.length)}`, 'folder-file')
        plan.directoryMove = { from, to }
      } else {
        if (!Array.isArray(selections) || !selections.length || selections.length > 3000) throw new HttpError(400, '请选择要整理的资料')
        for (const selection of selections) {
          const record = store.records.find((record) => record.id === selection.id)
          if (!record) throw new HttpError(404, '资料不存在')
          if (this.isPaperBusy(record.paperId)) { plan.blocked.push(`文献正在处理中：${record.rel}`); continue }
          const folder = normalizeRel(selection.folder || '')
          await checkedPath(plan.root, folder, { allowMissing: true })
          const name = selection.fileName || baseNameRel(record.rel)
          if (typeof name !== 'string' || /[\\/]/.test(name) || !name.toLowerCase().endsWith(record.type === 'pdf' ? '.pdf' : '.md')) throw new HttpError(400, '新文件名无效或改变了文件类型')
          const to = folder ? `${folder}/${name}` : name
          await checkedPath(plan.root, to, { allowMissing: true })
          add(record.rel, to, record.type)
          if (record.type !== 'pdf') continue
          const meta = data.papers.find((paper) => paper.id === record.paperId)
          const item = await this.catalog.project(record, data)
          const companions = new Map()
          const relativeOf = (absolute) => {
            if (!absolute) return ''
            const relative = path.relative(plan.root, absolute)
            return !path.isAbsolute(relative) && !relative.split(path.sep).includes('..') ? relative.split(path.sep).join('/') : ''
          }
          for (const [kind, rel] of [['summary', relativeOf(meta?.summaryPath) || item.summaryRel], ['readerNote', relativeOf(meta?.readerNotePath) || item.readerNoteRel]]) if (rel) companions.set(rel, kind)
          for (const note of data.scan.notes) if (note.folder === dirnameRel(record.rel) && [fileStem(record.rel) + ' 总结', fileStem(record.rel) + ' 笔记'].includes(note.stem)) companions.set(note.rel, note.isSummary ? 'summary' : 'readerNote')
          for (const [rel, kind] of companions) {
            if (selection.include?.[kind] === false || !data.files.has(pathKey(rel))) continue
            const note = data.scan.notes.find((note) => note.rel === rel)
            const ownership = note?.pdfTargets || []
            if (ownership.some((target) => baseNameRel(target.replace(/^\[\[|\]\]$/g, '')).toLowerCase() !== baseNameRel(record.rel).toLowerCase())) { plan.blocked.push(`关联笔记被多篇文献引用，请取消随同整理：${rel}`); continue }
            let noteName = baseNameRel(rel)
            if (selection.fileName && selection.renameNotes !== false && noteName.startsWith(`${fileStem(record.rel)} `)) noteName = `${fileStem(name)}${noteName.slice(fileStem(record.rel).length)}`
            add(rel, folder ? `${folder}/${noteName}` : noteName, kind)
          }
          if (record.paperId && selection.include?.assets !== false) {
            const rel = [dirnameRel(record.rel), '_附件', record.paperId].filter(Boolean).join('/')
            if (await exists(path.join(plan.root, ...rel.split('/')))) for (const file of await this.collect(plan.root, rel)) add(file.rel, [folder, '_附件', record.paperId, file.rel.slice(rel.length + 1)].filter(Boolean).join('/'), 'assets')
          }
        }
      }
      const targets = new Set()
      for (const step of plan.steps) {
        if (targets.has(pathKey(step.to))) plan.blocked.push(`多个文件指向同一目标：${step.to}`)
        targets.add(pathKey(step.to))
        try {
          await checkedPath(plan.root, step.from, { attachments: true })
          const destination = await checkedPath(plan.root, step.to, { allowMissing: true, attachments: true })
          if (await exists(destination) && pathKey(step.from) !== pathKey(step.to)) plan.blocked.push(`目标已存在：${step.to}`)
          let parent = dirnameRel(step.to)
          while (parent) {
            if (!await exists(await checkedPath(plan.root, parent, { allowMissing: true, attachments: true })) && !plan.newFolders.includes(parent)) plan.newFolders.push(parent)
            parent = dirnameRel(parent)
          }
        } catch (error) { plan.blocked.push(`${step.from}：${error.message}`) }
      }
      const backupDir = path.join(this.catalog.dataDir, 'backups', 'filing', plan.id)
      await mkdir(backupDir, { recursive: true })
      const watch = new Map()
      const snapshot = async (rel) => {
        if (watch.has(pathKey(rel))) return watch.get(pathKey(rel))
        const file = await checkedPath(plan.root, rel, { attachments: true })
        const info = await stat(file)
        const backup = `${watch.size}.bin`
        await copyFile(file, path.join(backupDir, backup), constants.COPYFILE_EXCL)
        if (!await sameFileBytes(file, path.join(backupDir, backup))) throw new HttpError(409, `文件在预览时改变：${rel}`)
        const value = { rel, backup, observation: observationOf(info) }
        watch.set(pathKey(rel), value)
        return value
      }
      for (const step of plan.steps) {
        try {
          const original = await snapshot(step.from)
          plan.files.push({ ...original, from: step.from, to: step.to, kind: step.kind })
        } catch (error) { plan.blocked.push(`${step.from}：${error.message}`) }
      }
      const allFiles = [...data.files.values()].map((file) => file.rel).concat(plan.steps.map((step) => step.from))
      for (const note of data.scan.notes) {
        try {
          if (note.size > 8 * 1024 * 1024) { plan.blocked.push(`笔记超过链接检查大小范围：${note.rel}`); continue }
          const original = await snapshot(note.rel)
          const buffer = await readFile(path.join(backupDir, original.backup))
          const raw = buffer.toString('utf8')
          if (!Buffer.from(raw).equals(buffer)) { plan.blocked.push(`笔记不是受支持的 UTF-8：${note.rel}`); continue }
          const moved = plan.steps.find((step) => step.from === note.rel)
          const to = moved?.to || note.rel
          const result = rewriteVaultLinks(raw, note.rel, to, plan.steps, allFiles, plan.root)
          plan.blocked.push(...result.blocked.map((reason) => `${note.rel}：${reason}`))
          if (result.content === raw) continue
          let file = plan.files.find((file) => file.from === note.rel)
          if (!file) { file = { ...original, from: note.rel, to, kind: 'links' }; plan.files.push(file) }
          file.after = result.content
          file.linkCount = result.changes.length
        } catch (error) { plan.blocked.push(`${note.rel}：${error.message}`) }
      }
      plan.watched = [...watch.values()]
      for (const record of store.records) {
        const step = plan.steps.find((step) => pathKey(step.from) === pathKey(record.rel))
        if (step) plan.catalogChanges.push({ id: record.id, before: structuredClone(record), to: step.to })
      }
      plan.newFolders.sort((a, b) => a.split('/').length - b.split('/').length || a.localeCompare(b))
      await this.persist(plan)
      return publicOperation(plan)
    })
  }

  backup(operation, file) { return path.join(this.catalog.dataDir, 'backups', 'filing', operation.id, file.backup) }

  async preflight(operation) {
    if (operation.root !== (await this.catalog.getVault())?.path) throw new HttpError(409, '仓库根已经改变')
    const store = await this.catalog.load()
    if (store.revision !== operation.catalogRevision) throw new HttpError(409, '资料属性已改变，请重新预览')
    const data = await this.catalog.scan(true)
    if (JSON.stringify([...data.files.keys()].sort()) !== JSON.stringify(operation.inventory)) throw new HttpError(409, '仓库文件清单已改变，请重新预览')
    for (const file of operation.watched) {
      const absolute = await checkedPath(operation.root, file.rel, { attachments: true })
      if (!await sameFileBytes(absolute, this.backup(operation, file))) throw new HttpError(409, `文件已被外部修改，请重新预览：${file.rel}`)
    }
    for (const step of operation.steps) {
      const target = await checkedPath(operation.root, step.to, { allowMissing: true, attachments: true })
      if (await exists(target) && pathKey(step.from) !== pathKey(step.to)) throw new HttpError(409, `目标已存在：${step.to}`)
    }
  }

  checkCancelled(operation) {
    if (operation.cancelRequested || this.closed) throw new HttpError(409, '整理已取消；已执行的步骤保留恢复记录')
  }

  async execute(input) {
    const operation = await this.load(input.planId)
    if (operation.status === 'completed') return publicOperation(operation)
    if (operation.status !== 'preview' || operation.cancelRequested || operation.revision !== input.revision) throw new HttpError(409, '预览已过期、取消或已执行')
    if (input.editorsClosed !== true) throw new HttpError(400, '请先保存并关闭受影响的 Obsidian 文档，再确认整理')
    if (operation.blocked.length) throw new HttpError(409, operation.blocked.join('；'))
    return this.catalog.exclusive(async () => {
      await this.preflight(operation)
      return this.run(operation)
    })
  }

  async run(operation) {
    if (this.active.has(operation.id)) throw new HttpError(409, '该操作正在执行')
    this.active.set(operation.id, operation)
    operation.status = 'running'
    await this.persist(operation)
    try {
      for (const folder of operation.newFolders) {
        this.checkCancelled(operation)
        await mkdir(await checkedPath(operation.root, folder, { allowMissing: true, attachments: true }), { recursive: true })
      }
      for (const step of operation.steps) {
        this.checkCancelled(operation)
        const source = await checkedPath(operation.root, step.from, { allowMissing: true, attachments: true })
        const destination = await checkedPath(operation.root, step.to, { allowMissing: true, attachments: true })
        const file = operation.files.find((file) => file.from === step.from)
        const sourceExists = await exists(source)
        const targetExists = await exists(destination)
        if (pathKey(step.from) === pathKey(step.to)) {
          step.stage = path.join(path.dirname(source), `.lr-${operation.id}-${operation.steps.indexOf(step)}`)
          await this.persist(operation)
          if (await exists(step.stage)) await rename(step.stage, destination)
          else if (!step.done) { await rename(source, step.stage); await rename(step.stage, destination) }
        } else {
          if (!targetExists) {
            if (!sourceExists || !await sameFileBytes(source, this.backup(operation, file))) throw new HttpError(409, `源文件已改变：${step.from}`)
            await copyFile(source, destination, constants.COPYFILE_EXCL)
          }
          if (!await sameFileBytes(destination, this.backup(operation, file)) && !(file.after !== undefined && await readFile(destination, 'utf8') === file.after)) throw new HttpError(409, `目标文件已改变：${step.to}`)
          this.checkCancelled(operation)
          if (sourceExists) {
            if (!await sameFileBytes(source, this.backup(operation, file))) throw new HttpError(409, `源文件在移动期间改变：${step.from}`)
            await unlink(source)
          }
        }
        step.done = true
        await this.persist(operation)
      }
      for (const file of operation.files) {
        if (file.after === undefined) continue
        this.checkCancelled(operation)
        const destination = await checkedPath(operation.root, file.to, { attachments: true })
        const current = await readFile(destination, 'utf8')
        if (current === file.after) continue
        if (!await sameFileBytes(destination, this.backup(operation, file))) throw new HttpError(409, `链接文件出现外部编辑：${file.to}`)
        await writeFileAtomic(destination, file.after)
        file.linksDone = true
        await this.persist(operation)
      }
      this.checkCancelled(operation)
      const store = await this.catalog.load()
      for (const change of operation.catalogChanges) {
        const record = store.records.find((record) => record.id === change.id)
        if (!record || record.revision !== change.before.revision && record.rel !== change.to) throw new HttpError(409, '资料身份已改变，不能提交整理结果')
        record.rel = change.to
        record.observation = observationOf(await stat(await checkedPath(operation.root, record.rel, { attachments: true })))
        record.revision = change.before.revision + 1
        record.updatedAt = new Date().toISOString()
        change.after = structuredClone(record)
        if (record.paperId) await this.updatePaperPaths(record.paperId, operation.steps)
      }
      await this.catalog.save(store)
      if (operation.directoryMove) {
        const directories = new Set(operation.steps.flatMap((step) => {
          const list = []
          let rel = dirnameRel(step.from)
          while (rel === operation.directoryMove.from || rel.startsWith(`${operation.directoryMove.from}/`)) { list.push(rel); rel = dirnameRel(rel) }
          return list
        }))
        for (const rel of [...directories].sort((a, b) => b.length - a.length)) await rmdir(await checkedPath(operation.root, rel, { attachments: true })).catch((error) => { if (error.code !== 'ENOENT') throw error })
      }
      operation.status = 'completed'
      operation.completedAt = new Date().toISOString()
      await this.persist(operation)
      return publicOperation(operation)
    } catch (error) {
      operation.status = operation.steps.some((step) => step.done) ? 'partial' : 'recovery_needed'
      operation.error = error.message
      await this.persist(operation)
      return publicOperation(operation)
    } finally {
      this.active.delete(operation.id)
      this.catalog.scanResult = null
      invalidateVaultCache()
    }
  }

  async updatePaperPaths(paperId, steps, reverse = false) {
    const papers = await this.catalog.listPapers()
    const paper = papers.find((paper) => paper.id === paperId)
    if (!paper) return
    const values = {}
    for (const [field, relative] of [['vaultPath', true], ['summaryPath', false], ['readerNotePath', false]]) {
      const old = relative ? paper[field] : paper[field] ? path.relative((await this.catalog.getVault()).path, paper[field]).split(path.sep).join('/') : ''
      const step = steps.find((step) => pathKey(reverse ? step.to : step.from) === pathKey(old))
      if (!step) continue
      const next = reverse ? step.from : step.to
      values[field] = relative ? next : path.join((await this.catalog.getVault()).path, ...next.split('/'))
      if (field === 'vaultPath') { values.fileName = baseNameRel(next); values.vaultExists = true }
      if (field === 'readerNotePath') values.readerNoteRelative = next
    }
    await this.catalog.updatePaper(paperId, values)
  }

  async cancel(id) {
    const operation = await this.load(id)
    if (['completed', 'rolled_back'].includes(operation.status)) throw new HttpError(409, '操作已经完成，请使用撤销预览')
    operation.cancelRequested = true
    if (operation.status === 'preview') operation.status = 'cancelled'
    await this.persist(operation)
    return publicOperation(operation)
  }

  async checkRecovery(operation) {
    const evidence = []
    for (const file of operation.files) {
      const locations = [...new Set([file.from || file.rel, file.to || file.rel])]
      for (const rel of locations) {
        const absolute = await checkedPath(operation.root || (await this.catalog.getVault()).path, rel, { allowMissing: true, attachments: true })
        const info = await exists(absolute)
        if (!info) { evidence.push({ rel, state: 'missing' }); continue }
        const before = operation.kind === 'metadata' ? await readFile(absolute, 'utf8') === file.before : await sameFileBytes(absolute, this.backup(operation, file))
        const after = file.after !== undefined && await readFile(absolute, 'utf8') === file.after
        if (!before && !after) throw new HttpError(409, `出现新的外部编辑，不能覆盖：${rel}`)
        evidence.push({ rel, state: before ? 'before' : 'after', observation: observationOf(await stat(absolute)) })
      }
    }
    return evidence
  }

  async recover(id, mode, input) {
    if (!['rollback', 'resume'].includes(mode)) throw new HttpError(400, '恢复方式无效')
    const operation = await this.load(id)
    if (this.active.has(id) || operation.status === 'running') throw new HttpError(409, '操作仍在执行')
    if (operation.status === 'rolled_back') return { operation: publicOperation(operation) }
    if (operation.status === 'preview' || operation.status === 'cancelled') throw new HttpError(409, '尚未执行的预览无需恢复')
    return this.catalog.exclusive(async () => {
      const evidence = await this.checkRecovery(operation)
      const store = await this.catalog.load()
      if (input.preview === true) {
        operation.recovery = { version: randomUUID(), mode, evidence, catalogRevision: store.revision }
        await this.persist(operation)
        return { recoveryVersion: operation.recovery.version, operation: publicOperation(operation), files: evidence.map(({ rel, state }) => ({ rel, state })) }
      }
      if (input.confirmed !== true || input.editorsClosed !== true || !operation.recovery || operation.recovery.version !== input.recoveryVersion || operation.recovery.mode !== mode
        || operation.recovery.catalogRevision !== store.revision || JSON.stringify(operation.recovery.evidence) !== JSON.stringify(evidence)) throw new HttpError(409, '恢复预览已过期或未确认，请重新核对')
      if (mode === 'resume') {
        if (operation.kind !== 'filing' || operation.status === 'completed') throw new HttpError(409, '该操作不能继续执行')
        operation.cancelRequested = false
        return { operation: await this.run(operation) }
      }
      if (operation.kind === 'metadata') {
        if (JSON.stringify(store) !== JSON.stringify(operation.catalogAfter) && JSON.stringify(store) !== JSON.stringify(operation.catalogBefore)) throw new HttpError(409, '管理信息已有新修改，请先保留双方')
        for (const file of operation.files) await writeFileAtomic(await checkedPath((await this.catalog.getVault()).path, file.rel), file.before)
        await this.catalog.save(operation.catalogBefore)
      } else {
        for (const change of operation.catalogChanges) {
          const record = store.records.find((record) => record.id === change.id)
          if (change.after && record?.revision !== change.after.revision) throw new HttpError(409, '资料属性已有新修改，不能覆盖')
        }
        for (const file of [...operation.files].reverse()) {
          const source = await checkedPath(operation.root, file.from, { allowMissing: true, attachments: true })
          const destination = await checkedPath(operation.root, file.to, { allowMissing: true, attachments: true })
          await mkdir(path.dirname(source), { recursive: true })
          if (!await exists(source)) await copyFile(this.backup(operation, file), source, constants.COPYFILE_EXCL)
          else if (!await sameFileBytes(source, this.backup(operation, file))) await writeFileAtomic(source, await readFile(this.backup(operation, file), 'utf8'))
          if (file.from !== file.to && pathKey(file.from) !== pathKey(file.to) && await exists(destination)) await unlink(destination)
        }
        for (const change of operation.catalogChanges) {
          const at = store.records.findIndex((record) => record.id === change.id)
          if (at < 0) throw new HttpError(409, '原资料记录缺失')
          store.records[at] = { ...change.before, revision: store.records[at].revision + 1, updatedAt: new Date().toISOString() }
          if (change.before.paperId) await this.updatePaperPaths(change.before.paperId, operation.steps, true)
        }
        await this.catalog.save(store)
      }
      operation.status = 'rolled_back'
      await this.persist(operation)
      this.catalog.scanResult = null
      invalidateVaultCache()
      return { operation: publicOperation(operation) }
    })
  }

  async dispose() {
    this.closed = true
    for (const operation of this.active.values()) { operation.cancelRequested = true; await this.persist(operation) }
    await this.catalog.queue
    await Promise.all([...this.writes.values()])
  }
}
