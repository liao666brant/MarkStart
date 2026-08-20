import assert from 'node:assert/strict'
import test from 'node:test'

import { getIconHtml } from '../src/shared/icons'

test('renders known icons and preserves the Material icon fallback', () => {
  assert.match(getIconHtml('settings'), /^<span class="icon-svg"><svg/)
  assert.equal(getIconHtml('missing-icon'), '<span class="material-icons">missing-icon</span>')
})
