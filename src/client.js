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
 * The host half (src/index.ts) reads the same volatile keys from its config;
 * the page writes them into the profile's user layer, so the next tool call sees
 * them without a restart.
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
    const styles = `
.dsh-penpot-form { display: flex; flex-direction: column; gap: 16px; max-width: 560px; color: var(--dsw-alias-label-primary); font-size: 13px; }
.dsh-penpot-form .panel { display: flex; flex-direction: column; gap: 4px; padding: 10px 12px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 6px; background: var(--dsw-alias-bg-layer-2); }
.dsh-penpot-form .row { display: flex; align-items: center; gap: 6px; font-weight: 500; }
.dsh-penpot-form .dot { flex: none; width: 6px; height: 6px; border-radius: 50%; background: var(--dsw-alias-state-idle-primary); }
.dsh-penpot-form .dot.ok { background: var(--dsw-alias-state-success-primary); }
.dsh-penpot-form .muted { color: var(--dsw-alias-label-secondary); font-size: 12px; line-height: 1.45; }
.dsh-penpot-form .field { display: flex; flex-direction: column; gap: 6px; }
.dsh-penpot-form .label { font-weight: 500; }
.dsh-penpot-form .hint { color: var(--dsw-alias-label-secondary); font-size: 12px; line-height: 1.4; }
.dsh-penpot-form .input { box-sizing: border-box; width: 100%; min-height: 32px; padding: 6px 10px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 6px; background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); font: inherit; font-size: 13px; }
.dsh-penpot-form .input:focus { outline: 1px solid var(--dsw-alias-brand-primary); outline-offset: 1px; }
.dsh-penpot-form .input:disabled { opacity: 0.6; }
.dsh-penpot-form .actions { display: flex; align-items: center; gap: 10px; }
.dsh-penpot-form .primary { min-height: 32px; padding: 0 14px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 6px; background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); font: inherit; font-size: 13px; font-weight: 500; cursor: pointer; }
.dsh-penpot-form .primary:hover:not(:disabled) { background: var(--dsw-alias-bg-layer-2); }
.dsh-penpot-form .primary:disabled { opacity: 0.55; cursor: default; }
.dsh-penpot-form .message { color: var(--dsw-alias-label-secondary); font-size: 12px; }
.dsh-penpot-form .section { display: flex; flex-direction: column; gap: 12px; padding-top: 14px; border-top: 1px solid var(--dsw-alias-border-l1); }
.dsh-penpot-form .section-title { font-weight: 600; }
.dsh-penpot-form .warning { color: var(--dsw-alias-state-warning-primary); font-size: 12px; line-height: 1.45; }
`

    function Field({ label, hint, children }) {
      return h(
        'label',
        { className: 'field' },
        h('span', { className: 'label' }, label),
        hint === undefined ? null : h('span', { className: 'hint' }, hint),
        children,
      )
    }

    function PenpotConfigForm({ form }) {
      const state = form === undefined ? undefined : form.state
      const value = (state === undefined ? undefined : state.value) ?? {}
      const [apiUrl, setApiUrl] = React.useState(String(value.apiUrl ?? ''))
      const [token, setToken] = React.useState(String(value.token ?? ''))
      const [browserPath, setBrowserPath] = React.useState(String(value.browserPath ?? ''))
      const [exportEmail, setExportEmail] = React.useState(String(value.exportEmail ?? ''))
      const [exportPassword, setExportPassword] = React.useState(String(value.exportPassword ?? ''))
      const [saving, setSaving] = React.useState(false)
      const [message, setMessage] = React.useState('')

      // A new accepted snapshot (after a save, or a recompose) replaces the
      // drafts; while the user is typing no snapshot changes. Every hook runs
      // before the early returns below, so loading and unavailable renders keep
      // the same hook order as the form itself.
      const revision = state === undefined ? undefined : state.revision
      React.useEffect(() => {
        const next = state === undefined ? {} : (state.value ?? {})
        setApiUrl(String(next.apiUrl ?? ''))
        setToken(String(next.token ?? ''))
        setBrowserPath(String(next.browserPath ?? ''))
        setExportEmail(String(next.exportEmail ?? ''))
        setExportPassword(String(next.exportPassword ?? ''))
      }, [revision])

      if (state === undefined) {
        return h('p', null, 'Loading the configuration…')
      }
      if (state.status === 'unavailable') {
        return h('p', null, 'This plugin is not loaded, so it cannot be configured right now.')
      }
      if (state.status === 'loading') {
        return h('p', null, 'Loading the current values…')
      }

      const savedUrl = String(value.apiUrl ?? '')
      const savedToken = String(value.token ?? '')
      const savedBrowser = String(value.browserPath ?? '')
      const savedExportEmail = String(value.exportEmail ?? '')
      const savedExportPassword = String(value.exportPassword ?? '')
      const urlSet = savedUrl.trim().length > 0
      const tokenSet = savedToken.trim().length > 0
      const exportCredentialsSet = savedExportEmail.trim().length > 0 && savedExportPassword.trim().length > 0
      const configured = urlSet && tokenSet
      const disabled = !state.writable || saving
      const save = async () => {
        setSaving(true)
        setMessage('')
        try {
          const ok = await form.mutate(
            [
              { op: 'set', path: ['apiUrl'], value: apiUrl.trim() },
              { op: 'set', path: ['token'], value: token.trim() },
              { op: 'set', path: ['browserPath'], value: browserPath.trim() },
              { op: 'set', path: ['exportEmail'], value: exportEmail.trim() },
              { op: 'set', path: ['exportPassword'], value: exportPassword.trim() },
            ],
            state.revision,
          )
          const incomplete = apiUrl.trim().length === 0 || token.trim().length === 0
          if (!ok) {
            setMessage('The runtime did not accept these values; they were left for you to correct.')
          } else if (incomplete) {
            setMessage('Saved. Set both the API URL and token to enable the tools.')
          } else {
            setMessage('Saved.')
          }
        } catch (error) {
          setMessage(`Save failed: ${String(error)}`)
        } finally {
          setSaving(false)
        }
      }

      return h(
        'div',
        { className: 'dsh-penpot-form' },
        h('style', null, styles),
        h(
          'div',
          { className: 'panel' },
          h(
            'div',
            { className: 'row' },
            h('span', { className: configured ? 'dot ok' : 'dot' }),
            h('span', null, configured ? 'Configured' : 'Not configured yet'),
          ),
          h(
            'div',
            { className: 'muted' },
            `API URL ${urlSet ? 'set' : 'not set'} · Access token ${tokenSet ? 'set' : 'not set'} · Headless browser ${savedBrowser.trim().length > 0 ? 'set' : 'not set'} · PNG credentials ${exportCredentialsSet ? 'set' : 'not set'}`,
          ),
          h('div', { className: 'muted' }, 'Changes are saved to this profile and apply immediately.'),
        ),
        h(
          Field,
          {
            label: 'API URL',
            hint: 'For example http://yourpenpot.url. Include the port if your Penpot runs on one; no /api/rpc suffix.',
          },
          h('input', {
            type: 'url',
            className: 'input',
            value: apiUrl,
            disabled,
            placeholder: 'http://yourpenpot.url',
            onChange: (event) => setApiUrl(event.target.value),
          }),
        ),
        h(
          Field,
          {
            label: 'Access token',
            hint: 'Create one in Penpot → Settings → Access tokens. A saved token is shown masked.',
          },
          h('input', {
            type: 'password',
            className: 'input',
            value: token,
            disabled,
            placeholder: 'Paste the access token',
            onChange: (event) => setToken(event.target.value),
          }),
        ),
        h(
          'div',
          { className: 'section' },
          h('div', { className: 'section-title' }, 'PNG export (optional)'),
          h('div', { className: 'warning' }, 'Used only by the native PNG tool and the preview tool. Credentials are stored in this profile; use a dedicated Penpot account, not your personal password.'),
          h(
            Field,
            {
              label: 'Headless browser (optional)',
              hint: 'Absolute path to Chrome, Chromium or Edge for penpot_frame_png. The SVG tool works without it.',
            },
            h('input', {
              type: 'text',
              className: 'input',
              value: browserPath,
              disabled,
              placeholder: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
              onChange: (event) => setBrowserPath(event.target.value),
            }),
          ),
          h(
            Field,
            {
              label: 'Penpot email (optional)',
              hint: 'Only for Penpot\'s own PNG exporter. Leave empty to use the plugin renderer.',
            },
            h('input', {
              type: 'email',
              className: 'input',
              value: exportEmail,
              disabled,
              placeholder: 'you@example.com',
              onChange: (event) => setExportEmail(event.target.value),
            }),
          ),
          h(
            Field,
            {
              label: 'Penpot password (optional)',
              hint: 'Stored in the profile user layer. Use a dedicated account and clear this field when exact export is not needed.',
            },
            h('input', {
              type: 'password',
              className: 'input',
              value: exportPassword,
              disabled,
              placeholder: 'Penpot account password',
              onChange: (event) => setExportPassword(event.target.value),
            }),
          ),
        ),
        h(
          'div',
          { className: 'actions' },
          h(
            'button',
            {
              type: 'button',
              className: 'primary',
              disabled,
              onClick: save,
              style: {
                minHeight: 32,
                padding: '0 14px',
                borderRadius: 6,
                border: '1px solid var(--dsw-alias-border-l2)',
                background: 'var(--dsw-alias-bg-layer-1)',
                color: 'var(--dsw-alias-label-primary)',
                font: 'inherit',
                fontSize: 13,
                fontWeight: 500,
                cursor: disabled ? 'default' : 'pointer',
                opacity: disabled ? 0.55 : 1,
              },
            },
            saving ? 'Saving…' : 'Save',
          ),
          message.length === 0 ? null : h('span', { className: 'message' }, message),
        ),
      )
    }

    const inject = ['slots']
    function apply(ctx) {
      ctx.slots.inject('plugins.row.config', () => {
        const dispose = ctx.slots.register(
          { name: 'plugins.row.config', key: KEY },
          ({ view, form }) => (view === 'summary' ? null : h(PenpotConfigForm, { form })),
        )
        return dispose
      })
    }

    exports.NS = 'dsh-penpot'
    exports.apply = apply
    exports.inject = inject
    return module.exports
  },
})
