import { HttpError } from './util.js'

export function createManagementApi({ catalog, readBody, json }) {
  return async (req, res, url, segments) => {
    const method = req.method || 'GET'
    const [resource, id, action] = segments.slice(2)
    if (!['catalog', 'views'].includes(resource)) return false
    const body = method === 'GET' || method === 'DELETE' ? {} : await readBody(req, 2 * 1024 * 1024)
    let result
    if (resource === 'views') result = await catalog.views(method, body, id)
    else if (!id && method === 'GET') result = await catalog.list(Object.fromEntries(url.searchParams))
    else if (id === 'refresh' && method === 'POST') result = await catalog.refresh()
    else if (id === 'register' && method === 'POST') {
      await catalog.refresh()
      const store = await catalog.load()
      const record = store.records.find((record) => record.rel === body.rel)
      if (!record) throw new HttpError(404, '文件不在当前管理范围')
      result = { item: await catalog.detail(record.id) }
    } else if (id === 'batch' && method === 'POST') result = { items: await catalog.update(body.items, body.patch) }
    else if (id && action === 'relink' && method === 'POST') result = await catalog.relink(id, body)
    else if (id && !action && method === 'GET') result = { item: await catalog.detail(id) }
    else if (id && !action && method === 'PATCH') result = { item: (await catalog.update([{ id, revision: body.revision, sourceVersion: body.sourceVersion }], body.patch))[0] }
    else throw new HttpError(405, '不支持的资料管理操作')
    json(res, 200, result)
    return true
  }
}
