import assert from 'node:assert/strict';
import test from 'node:test';
import { refreshBookmarkOrder } from '../src/bookmark-order-sync.js';

test('refreshes changed bookmark order through the supplied renderer', () => {
  const rendered = [];
  const cache = {
    get: () => ({ bookmarks: [{ id: 'old' }] }),
    set: () => {},
  };
  const bookmarksApi = {
    getChildren: (_parentId, callback) => callback([{ id: 'current' }]),
  };

  refreshBookmarkOrder(bookmarksApi, cache, 'bookmarks-bar', (bookmarks) => {
    rendered.push({ id: 'bookmarks-bar', children: bookmarks });
  });

  assert.deepEqual(rendered, [{ id: 'bookmarks-bar', children: [{ id: 'current' }] }]);
});
