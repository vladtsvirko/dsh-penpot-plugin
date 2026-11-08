/**
 * Browser half: the configuration page for the `dsh-penpot` row.
 *
 * DSH's Plugins page declares the `plugins.row.config` slot; a plugin that
 * registers it gets a Configure control on its row and a page whose owner
 * passes the row's config snapshot and a mutate function. This module is plain
 * browser JavaScript in the client-module format (no build step beyond copying
 * it to lib/client.js), so it can read React from the shared module table and
 * keep the form small.
 *
 * The host half (src/index.ts) reads the same two keys from its config; the
 * page writes them into the profile's user layer, so the next recompose sees
 * them.
 */
window.__ModuleLoader__.load({
  id: 'dsh-penpot-plugin',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    const React = require('react')
    const h = React.createElement

    const KEY = 'dsh-penpot-plugin#dsh-penpot'
    const inputStyle = {
      boxSizing: 'border-box',
      width: '100%',
      padding: '6px 8px',
      borderRadius: 6,
      border: '1px solid var(--dsh-border, #d0d5dd)',
      background: 'var(--dsh-surface, #fff)',
      color: 'inherit',
      font: 'inherit',
    }

    function field(label, hint, input) {
      return h(
        'label',
        { style: { display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 14 } },
        h('span', { style: { fontWeight: 600 } }, label),
        hint === undefined ? null : h('span', { style: { opacity: 0.7, fontSize: 12 } }, hint),
        input,
      )
    }

    function PenpotConfigForm({ form }) {
      if (form === undefined) {
        return h('p', null, 'This plugin does not expose its configuration in this build.')
      }
      const state = form.state
      if (state.status === 'unavailable') {
        return h('p', null, 'This plugin is not loaded, so it cannot be configured right now.')
      }
      if (state.status === 'loading') {
        return h('p', null, 'Loading the current values…')
      }
      const value = state.value ?? {}
      const [apiUrl, setApiUrl] = React.useState(String(value.apiUrl ?? ''))
      const [token, setToken] = React.useState(String(value.token ?? ''))
      const [saving, setSaving] = React.useState(false)
      const [message, setMessage] = React.useState('')

      // A new accepted snapshot (after a save, or a recompose) replaces the
      // drafts; while the user is typing no snapshot changes.
      React.useEffect(() => {
        setApiUrl(String((state.value ?? {}).apiUrl ?? ''))
        setToken(String((state.value ?? {}).token ?? ''))
      }, [state.revision])

      const disabled = !state.writable || saving
      const save = async () => {
        setSaving(true)
        setMessage('')
        try {
          const ok = await form.mutate(
            [
              { op: 'set', path: ['apiUrl'], value: apiUrl.trim() },
              { op: 'set', path: ['token'], value: token.trim() },
            ],
            state.revision,
          )
          setMessage(ok ? 'Saved.' : 'The deployment did not accept these values; they were left for you to correct.')
        } catch (error) {
          setMessage(`Save failed: ${String(error)}`)
        } finally {
          setSaving(false)
        }
      }

      return h(
        'div',
        null,
        h(
          'p',
          null,
          'Point the Penpot tools at a Penpot instance. The API origin is the published frontend, without an /api/rpc suffix.',
        ),
        field(
          'API URL',
          'For example http://192.168.2.98:8090. The HTTPS origin on :8443 also works if the CA is trusted.',
          h('input', {
            type: 'url',
            value: apiUrl,
            disabled,
            placeholder: 'http://192.168.2.98:8090',
            style: inputStyle,
            onChange: (event) => setApiUrl(event.target.value),
          }),
        ),
        field(
          'Access token',
          'Create it in Penpot → Settings → Access tokens.',
          h('input', {
            type: 'password',
            value: token,
            disabled,
            placeholder: 'the token from the Penpot instance',
            style: inputStyle,
            onChange: (event) => setToken(event.target.value),
          }),
        ),
        h(
          'div',
          { style: { display: 'flex', alignItems: 'center', gap: 10 } },
          h(
            'button',
            {
              type: 'button',
              disabled,
              onClick: save,
              style: { padding: '6px 14px', borderRadius: 6, cursor: disabled ? 'default' : 'pointer' },
            },
            saving ? 'Saving…' : 'Save',
          ),
          message.length === 0 ? null : h('span', { style: { fontSize: 13 } }, message),
        ),
      )
    }

    const inject = ['slots']
    function apply(ctx) {
      ctx.slots.inject('plugins.row.config', () =>
        ctx.slots.register(
          { name: 'plugins.row.config', key: KEY },
          ({ view, form }) => (view === 'summary' ? null : h(PenpotConfigForm, { form })),
        ),
      )
    }

    exports.NS = 'dsh-penpot'
    exports.apply = apply
    exports.inject = inject
    return module.exports
  },
})
