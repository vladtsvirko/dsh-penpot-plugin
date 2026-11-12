import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

interface ClientModule {
  inject: string[]
  apply: (ctx: unknown) => void
}

interface Element {
  type: unknown
  props: Record<string, unknown>
  children: unknown[]
}

type Wrapper = (props: { view?: string; form?: unknown }) => unknown

interface ReactMock {
  createElement: (type: unknown, props: Record<string, unknown> | null, ...children: unknown[]) => Element
  useState: (initial: unknown) => [unknown, (value: unknown) => void]
  useEffect: (effect: () => void, deps?: unknown[]) => void
}

/** The smallest React the client half needs; hooks return their initial values. */
function createReact(overrides: Partial<ReactMock> = {}): ReactMock {
  return {
    createElement: (type, props, ...children) => ({ type, props: props ?? {}, children }),
    useState: (initial) => [initial, () => {}],
    useEffect: () => {},
    ...overrides,
  }
}

function loadClient(react: ReactMock = createReact()): ClientModule {
  const code = readFileSync(new URL('../src/client.js', import.meta.url), 'utf8')
  let loaded: ClientModule | undefined
  const window = {
    __ModuleLoader__: {
      load: ({ factory }: { factory: (require: (name: string) => unknown) => unknown }) => {
        loaded = factory((name) => (name === 'react' ? react : {})) as ClientModule
      },
    },
  }
  const globalWithWindow = globalThis as { window?: unknown }
  const previous = globalWithWindow.window
  globalWithWindow.window = window
  try {
    // The bundle is browser JavaScript; give it the same globals the loader does.
    new Function('window', code)(window)
  } finally {
    globalWithWindow.window = previous
  }
  if (loaded === undefined) throw new Error('the client bundle did not register a factory')
  return loaded
}

/** Register the client half and return the component the Plugins page renders. */
function register(client = loadClient()): Wrapper {
  let component: Wrapper | undefined
  const ctx = {
    slots: {
      inject: (_name: string, registerSlot: () => void) => registerSlot(),
      register: (_spec: unknown, value: Wrapper) => {
        component = value
        return () => {}
      },
    },
  }
  client.apply(ctx)
  if (component === undefined) throw new Error('the client half registered no component')
  return component
}

function isElement(value: unknown): value is Element {
  return typeof value === 'object' && value !== null && 'type' in value && 'props' in value
}

/** Every element of one type in a rendered tree. */
function findAll(node: unknown, type: string): Element[] {
  if (Array.isArray(node)) return node.flatMap((child) => findAll(child, type))
  if (!isElement(node)) return []
  const own = node.type === type ? [node] : []
  return [...own, ...findAll(node.children, type)]
}

/** Render the page view and return the component's element tree. */
function renderPage(wrapper: Wrapper, form: unknown): Element {
  const element = wrapper({ view: 'page', form })
  if (!isElement(element)) throw new Error('the page view rendered no element')
  const tree = (element.type as (props: unknown) => unknown)(element.props)
  if (!isElement(tree)) throw new Error('the config form rendered no element')
  return tree
}

describe('penpot config page', () => {
  it('registers the row config slot for the dsh-penpot row', () => {
    const client = loadClient()
    expect(client.inject).toContain('slots')
    const registrations: Array<{ spec: unknown; component: unknown }> = []
    const ctx = {
      slots: {
        inject: (_name: string, register: () => void) => register(),
        register: (spec: unknown, component: unknown) => {
          registrations.push({ spec, component })
          return () => {}
        },
      },
    }
    client.apply(ctx)
    expect(registrations).toHaveLength(1)
    expect(registrations[0]?.spec).toEqual({ name: 'plugins.row.config', key: 'dsh-penpot-plugin#dsh-penpot' })
    expect(typeof registrations[0]?.component).toBe('function')
  })

  it('renders nothing for the summary view', () => {
    const wrapper = register()
    expect(wrapper({ view: 'summary', form: undefined })).toBeNull()
    expect(wrapper({ view: 'page', form: undefined })).not.toBeNull()
  })

  it('keeps one hook order while the configuration snapshot loads', () => {
    let hooks = 0
    const react = createReact({
      useState: (initial) => {
        hooks += 1
        return [initial, () => {}]
      },
      useEffect: () => {
        hooks += 1
      },
    })
    const wrapper = register(loadClient(react))
    const render = (form: unknown): number => {
      hooks = 0
      renderPage(wrapper, form)
      return hooks
    }

    const withoutForm = render(undefined)
    expect(withoutForm).toBeGreaterThan(0)
    expect(render({ state: { status: 'loading' } })).toBe(withoutForm)
    expect(render({ state: { status: 'unavailable' } })).toBe(withoutForm)
    expect(render({
      state: { status: 'ready', value: {}, revision: 3, writable: true },
      mutate: async () => true,
    })).toBe(withoutForm)
  })

  it('writes the API URL and token to the row config', async () => {
    const calls: Array<{ ops: unknown; revision: unknown }> = []
    const form = {
      state: {
        status: 'ready',
        value: { apiUrl: 'http://localhost:8090', token: 'secret' },
        revision: 7,
        writable: true,
      },
      mutate: async (ops: unknown, revision: unknown) => {
        calls.push({ ops, revision })
        return true
      },
    }
    const tree = renderPage(register(), form)

    const inputs = findAll(tree, 'input')
    expect(inputs.map((input) => input.props.value)).toEqual(['http://localhost:8090', 'secret'])
    expect(inputs.map((input) => input.props.type)).toEqual(['url', 'password'])

    const button = findAll(tree, 'button')[0]
    expect(button?.props.disabled).toBe(false)
    await (button?.props.onClick as () => Promise<void>)()
    expect(calls).toEqual([{
      ops: [
        { op: 'set', path: ['apiUrl'], value: 'http://localhost:8090' },
        { op: 'set', path: ['token'], value: 'secret' },
      ],
      revision: 7,
    }])
  })
})
