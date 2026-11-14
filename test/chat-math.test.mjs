import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import test from 'node:test'

const source = await readFile(new URL('../client.js', import.meta.url), 'utf8')
const stub = {
  createElement: (type, props, ...children) => ({ type, props: props || {}, children: children.flat(Infinity) }),
  useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
  useMemo: (fn) => fn(), useCallback: (fn) => fn, useEffect() {}, useLayoutEffect() {},
  useRef: (initial) => ({ current: initial }), memo: (fn) => fn,
}
let definition
const context = vm.createContext({ window: { __ModuleLoader__: { load: (value) => { definition = value } } }, console })
const anchor = '\n    return {\n      inject:'
assert.ok(source.includes(anchor))
vm.runInContext(source.replace(anchor, '\n    globalThis.chatTest = { Markdown, ChatMessage };' + anchor), context)
definition.factory((id) => { assert.equal(id, 'react'); return stub })
const { Markdown, ChatMessage } = context.chatTest

function walk(node, out = []) {
  if (node == null || node === false) return out
  if (Array.isArray(node)) { node.forEach((child) => walk(child, out)); return out }
  if (typeof node !== 'object') { out.push({ text: String(node) }); return out }
  if (typeof node.type === 'function') return walk(node.type({ ...node.props, children: node.children }), out)
  out.push(node)
  node.children.forEach((child) => walk(child, out))
  return out
}
const render = (text) => walk(Markdown({ text }))
const maths = (nodes) => nodes.filter((node) => node.props?.className?.split(' ').includes('lr-latex'))
const markup = (nodes) => maths(nodes).map((node) => node.props.dangerouslySetInnerHTML?.__html || '').join('')
const textOf = (nodes) => nodes.map((node) => node.text || '').join('')

test('existing screenshot formulas render in prose, bold text, display blocks and tables', () => {
  const nodes = render(String.raw`接收端终端电压 \(V_{\text{TT}}\)，**高电平 \(V_{\text{H}}\)**。

\[
V_{\text{H}}=\frac{V_{\text{DD}}+V_{\text{TT}}}{2}
\]

| 电压 | 摆幅 |
| --- | --- |
| \(0.75\,\text{V}\) | $V_H-V_L$ |`)
  assert.equal(maths(nodes).length, 5)
  assert.match(markup(nodes), /<mfrac>/)
  assert.match(markup(nodes), /<msub>/)
  assert.ok(nodes.some((node) => node.type === 'strong' && maths(walk(node)).length === 1))
  assert.ok(nodes.some((node) => node.type === 'td' && maths(walk(node)).length === 1))
  assert.ok(maths(nodes).some((node) => node.props.className.includes('is-display')))
  assert.ok(!textOf(nodes).includes('\\frac'))
})

test('dollar-delimited fractions, matrices and aligned equations use native MathML', () => {
  const nodes = render(String.raw`行内 $\alpha_i^2+\sqrt{x}$。

$$
\begin{aligned}
V_H &= \frac{V_{DD}+V_{TT}}{2} \\
V_L &= \frac{V_{TT}}{2}
\end{aligned}
$$

$$\begin{pmatrix}a&b\\c&d\end{pmatrix}$$`)
  assert.equal(maths(nodes).length, 3)
  assert.match(markup(nodes), /<msubsup>/)
  assert.match(markup(nodes), /<msqrt>/)
  assert.match(markup(nodes), /<mtable/)
  assert.ok(!nodes.some((node) => /^h[1-6]$/.test(node.type)))
})

test('code fences, inline code, escaped dollars, prices and incomplete streams stay literal', () => {
  for (const value of ['代码 `$x$`', '```latex\n\\[x_i\\]\n```', String.raw`价格 \$5 和 \$10`, '$5 and $10', String.raw`尚未完成 \(\frac{a}{`, '$$\nx = \\frac{a}{']) {
    assert.equal(maths(render(value)).length, 0, value)
  }
  const nodes = render('``$x$`` 和 $y$')
  assert.equal(maths(nodes).length, 1)
  assert.ok(textOf(nodes).includes('$x$'))
})

test('currency ranges and unfinished delimiters preserve their literal text', () => {
  for (const value of ['$5-$10', '$5–$10', String.raw`尚未完成 \[\frac{a}{`, String.raw`尚未完成 \(\frac{a}{`]) {
    const nodes = render(value)
    assert.equal(maths(nodes).length, 0, value)
    assert.equal(textOf(nodes), value)
  }
})

test('a multiline display formula beginning inside a list item stays together', () => {
  const nodes = render(String.raw`- 高电平：\[
V_H=\frac{V_{DD}+V_{TT}}{2}
\]
- 低电平：$V_L=0$`)
  assert.equal(maths(nodes).length, 2)
  assert.equal(nodes.filter((node) => node.type === 'li').length, 2)
  assert.match(markup(nodes), /<mfrac>/)
})

test('table separators inside formula and code do not split cells', () => {
  const nodes = render(String.raw`| 范数 | 代码 |
| --- | --- |
| $\left|x\right|$ | ` + '`a|b` |')
  assert.equal(nodes.filter((node) => node.type === 'td').length, 2)
  assert.equal(maths(nodes).length, 1)
  assert.match(textOf(nodes), /a\|b/)
})

test('streaming fragments remain renderable and complete formulas appear when closed', () => {
  const answer = String.raw`结果：\[V_H=\frac{V_{DD}+V_{TT}}{2}\] [p.2]`
  for (let length = 0; length <= answer.length; length++) assert.doesNotThrow(() => render(answer.slice(0, length)))
  let page
  const nodes = walk(Markdown({ text: answer, onCite: (value) => { page = value } }))
  assert.equal(maths(nodes).length, 1)
  const citation = nodes.find((node) => node.props?.className === 'lr-cite')
  assert.ok(citation)
  citation.props.onClick()
  assert.equal(page, 2)
})

test('invalid LaTeX and HTML remain inert and do not hide surrounding text', () => {
  const nodes = render(String.raw`之前 $\notARealCommand{x}$ 之后 <img src=x onerror=alert(1)>`)
  assert.match(textOf(nodes), /之前/)
  assert.match(textOf(nodes), /之后/)
  assert.ok(nodes.some((node) => node.props?.className?.includes('lr-latex-error')))
  assert.ok(!nodes.some((node) => node.type === 'img'))
  const untrusted = markup(render(String.raw`$\href{javascript:alert(1)}{x}$`))
  assert.ok(!untrusted.includes('href="javascript:'))
})

test('assistant history and chapter extracts share math rendering; user messages stay plain', () => {
  for (const kind of ['ask', 'extract']) {
    const nodes = walk(ChatMessage({ message: { role: 'assistant', kind, content: '$x_1$', chapter: { title: 'Test', start: 1, end: 2 } }, onExpand() {} }))
    assert.equal(maths(nodes).length, 1)
  }
  const nodes = walk(ChatMessage({ message: { role: 'user', content: '$x_1$' } }))
  assert.equal(maths(nodes).length, 0)
  assert.ok(textOf(nodes).includes('$x_1$'))
})
