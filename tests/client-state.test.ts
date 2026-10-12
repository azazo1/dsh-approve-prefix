/** 从构建产物挂载会话 tab, 验证联合提交与失败时的草稿保留. */

import { expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'

interface Node {
  type: unknown
  props: Record<string, any>
  children: any[]
}

function nodes(value: any): Node[] {
  if (Array.isArray(value)) return value.flatMap(nodes)
  if (value === null || typeof value !== 'object' || !('children' in value)) return []
  return [value, ...value.children.flatMap(nodes)]
}

const settle = (): Promise<void> => new Promise(resolve => setImmediate(resolve))

test('构建的会话 tab 只发送一个联合请求, 失败不清草稿, 仅提交变化字段', async () => {
  const calls: Array<{ url: string; method: string; body?: string }> = []
  const values: any[] = []
  let cursor = 0
  let effectRegistered = false
  let initialEffect: (() => void) | undefined
  let tab: (props: unknown) => Node
  let fail = false
  let state = {
    entries: [{ tool: 'bash', prefix: 'flutter' }],
    night: true,
    defaultTool: 'bash', limit: 32,
    blockedTools: ['ask_user_question'], exemptTools: ['exit_plan_mode'],
  }
  const React = {
    createElement: (type: unknown, props: Record<string, any> | null, ...children: any[]): Node =>
      ({ type, props: props ?? {}, children }),
    useState(initial: any) {
      const index = cursor++
      if (!(index in values)) values[index] = typeof initial === 'function' ? initial() : initial
      return [values[index], (next: any) => { values[index] = next }]
    },
    useEffect(effect: () => void) {
      if (effectRegistered) return
      effectRegistered = true
      initialEffect = effect
    },
  }
  let registration: any
  runInNewContext(readFileSync(new URL('../lib/client/index.js', import.meta.url), 'utf8'), {
    __ModuleLoader__: { load: (entry: any) => { registration = entry } },
    document: { querySelector: () => ({}) },
    fetch: async (url: string, init: { method: string; body?: string }) => {
      calls.push({ url, ...init })
      if (init.method === 'PUT' && !fail) state = { ...state, ...JSON.parse(init.body!) }
      return { ok: !fail, status: fail ? 400 : 200, json: async () => state }
    },
  })
  expect(registration.id).toBe('dsh-approve-prefix')
  const primitives = {
    Input: 'Input', Button: 'Button',
    SettingsFormModel: class {
      bind() { return {} }
      actions() { return {} }
      dispose() {}
    },
  }
  const factory = registration.factory((name: string) => {
    if (name === 'react') return React
    if (name === '@deepseek-ai/dsh-client-ui-primitives') return primitives
    throw new Error(`unexpected module ${name}`)
  })
  factory.apply({
    configForms: { get: () => ({}), whileServed: () => () => {} },
    locale: { register() {}, bind: () => (key: string) => key },
    effect: (callback: () => void) => callback(),
    slots: {
      inject: (_name: string, callback: () => void) => callback(),
      register: (options: { name: string }, component: typeof tab) => {
        if (options.name === 'conversation.view') tab = component
        return () => {}
      },
    },
  })
  const render = (): Node[] => {
    cursor = 0
    return nodes(tab!({ sessionId: 'session-client', t: (key: string) => key }))
  }
  const header = (tree: Node[]): Node[] =>
    nodes(tree.find(node => node.props.className === 'dsh-ap-tab-head')).filter(node => node.type === 'Button')
  const checkbox = (tree: Node[]): Node => tree.find(node => node.props.type === 'checkbox')!
  let tree = render()
  initialEffect!()
  await settle()
  tree = render()
  expect(calls).toHaveLength(1)
  expect(calls[0]!.url).toBe('/api/plugins/dsh-approve-prefix/sessions/session-client/state')
  expect(calls[0]!.method).toBe('GET')
  expect(checkbox(tree).props.checked).toBe(true)

  header(tree)[2]!.props.onClick()
  checkbox(tree).props.onChange({ currentTarget: { checked: false } })
  tree = render()
  fail = true
  header(tree)[1]!.props.onClick()
  await settle()
  tree = render()
  expect(calls).toHaveLength(2)
  expect(calls[1]!.method).toBe('PUT')
  expect(JSON.parse(calls[1]!.body!)).toEqual({ entries: [], night: false })
  expect(header(tree)[1]!.props.disabled).toBe(false)
  expect(checkbox(tree).props.checked).toBe(false)
  expect(state.night).toBe(true)
  expect(state.entries).toHaveLength(1)

  fail = false
  header(tree)[1]!.props.onClick()
  await settle()
  tree = render()
  expect(calls).toHaveLength(3)
  expect(state.night).toBe(false)
  expect(state.entries).toEqual([])
  expect(header(tree)[1]!.props.disabled).toBe(true)

  checkbox(tree).props.onChange({ currentTarget: { checked: true } })
  tree = render()
  header(tree)[1]!.props.onClick()
  await settle()
  expect(calls).toHaveLength(4)
  expect(JSON.parse(calls[3]!.body!)).toEqual({ night: true })
})
