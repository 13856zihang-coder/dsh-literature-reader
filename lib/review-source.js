import { createSourceEndpoint, sourceRecord, businessDate } from './review-protocol.js'

export function createLiteratureReviewSource(catalog, now = () => new Date()) {
  const provider = 'literature', scopeId = catalog.file
  return createSourceEndpoint({ provider, scopeId, now, project: async (from, to, options) => {
    const state = await catalog.load()
    const records = []
    for (const row of state.records) {
      const manual = row.manual
      const title = manual.title || row.originalTitle || row.rel || '已登记文献'
      if (options.mode === 'references') {
        if (title.toLowerCase().includes(options.query)) records.push(sourceRecord(provider, scopeId, row, 'reference', from,
          { title, referenceOnly: true, type: row.type, readingState: manual.readingState || 'unread', readAt: manual.readAt || null, reviewedAt: manual.reviewedAt || null },
          { catalogId: row.id, paperId: row.paperId || null, referenceQuery: title.slice(0, 200) }))
        continue
      }
      const readDate = businessDate(manual.readAt), reviewedDate = businessDate(manual.reviewedAt)
      const dates = [readDate, reviewedDate].filter(d => d && d >= from && d <= to)
      if (!dates.length) continue
      records.push(sourceRecord(provider, scopeId, row, row.type === 'note' ? 'note' : 'paper', dates.sort().at(-1),
        { title, readingState: manual.readingState || 'unread', readAt: manual.readAt || null,
          reviewedAt: manual.reviewedAt || null, understandingSummary: manual.understandingSummary || '', latestOnly: true },
        { catalogId: row.id, paperId: row.paperId || null }))
    }
    return { records, totals: { explicitReadingRecords: options.mode === 'references' ? null : records.length }, coverage: { status: records.length ? options.mode === 'references' ? 'current_state' : 'latest_only' : 'empty', explanation: options.mode === 'references' ? '当前目录标题搜索，包含未读文献和已登记笔记；不读取正文，关联不代表读完。' : '只读目录中的最近读完/回顾时间，不代表完整阅读事件流；不扫描笔记或读取 PDF。' } }
  } })
}
