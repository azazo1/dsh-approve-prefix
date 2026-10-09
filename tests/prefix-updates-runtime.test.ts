/** 用真实 Cordis Loader 加载构建入口, 验证 Volatile 提交的 fiber 作用域和清理. */

import { expect, test } from 'bun:test'
import { Context, Service } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import * as plugin from '../lib/index.js'
import type { AgentLike, PrefixUpdateMessageLike, PromptSectionLike } from '../src/host-types.ts'
import { ALLOW_PREFIX_SECTION_NAME } from '../src/prompt/allow-prefixes.ts'

test('构建入口通过 Loader 接收本 fiber 的持久前缀提交, 保留 fiber 并清理注册', async () => {
  const ctx = new Context()
  const updates: PrefixUpdateMessageLike[] = []
  const agent: AgentLike = { session: { id: 'runtime-session' }, inject: message => { updates.push(message) } }
  const sections = new Map<string, PromptSectionLike>()
  ctx.provide('agents', { get: () => agent, list: () => [agent] } as never)
  class PromptSink extends Service {
    constructor(ctx: Context) { super(ctx, 'systemPrompt') }
    section(section: PromptSectionLike): () => void {
      return this.ctx.effect(() => {
        sections.set(section.name, section)
        return () => { sections.delete(section.name) }
      })
    }
  }
  new PromptSink(ctx)
  try {
    await ctx.plugin(Loader)
    ctx.loader.builtins['prefix-updates'] = plugin
    const id = await ctx.loader.create({
      name: 'cordis:prefix-updates',
      config: { tools: ['bash'], prefixes: ['git status'], persistentPrefixes: [] },
    })
    const entry = ctx.loader.resolve(id)
    await entry.fiber!.await()
    await ctx.fiber.await()
    const owner = entry.fiber!
    expect(sections.has(ALLOW_PREFIX_SECTION_NAME)).toBe(true)
    expect(updates).toHaveLength(0)

    await entry.update({
      config: { tools: ['bash'], prefixes: ['git status'], persistentPrefixes: [{ tool: 'bash', prefix: 'gh api' }] },
    })
    await ctx.fiber.await()
    expect(Object.is(entry.fiber, owner)).toBe(true)
    expect(updates).toHaveLength(1)
    const section = sections.get(ALLOW_PREFIX_SECTION_NAME)!
    const text = typeof section.text === 'function' ? section.text({ agent }) : section.text
    expect(updates[0]!.source.sections).toEqual([{ name: section.name, text }])
    expect(updates[0]!.content[0]!.text.endsWith(text)).toBe(true)

    await entry.update({
      config: { tools: ['bash'], prefixes: ['git status'], persistentPrefixes: [{ tool: 'bash', prefix: 'gh   api' }] },
    })
    expect(updates).toHaveLength(1)
    await entry.update({ config: { tools: ['bash'], prefixes: ['git status'], persistentPrefixes: [] } })
    expect(updates).toHaveLength(2)
    expect(updates[1]!.id).not.toBe(updates[0]!.id)

    const hooks = ctx.events._hooks['loader/volatile-update'] ?? []
    expect(hooks).toHaveLength(1)
    await owner.dispose()
    expect(ctx.events._hooks['loader/volatile-update'] ?? []).toHaveLength(0)
    expect(sections.size).toBe(0)
  } finally {
    await ctx.fiber.dispose()
  }
})
