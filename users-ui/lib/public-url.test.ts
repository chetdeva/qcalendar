import assert from 'node:assert/strict';
import { test } from 'node:test';
import { publicUrl } from './public-url.ts';

const req = { url: 'https://localhost:3003/auth/signout' };

test('uses the public address when configured', () => {
  assert.equal(publicUrl('/login', req, 'https://accounts.quanttoria.com').href, 'https://accounts.quanttoria.com/login');
});
test('falls back to the request address without configuration', () => {
  assert.equal(publicUrl('/login', req, '').href, 'https://localhost:3003/login');
});
test('keeps an absolute return address', () => {
  assert.equal(publicUrl('https://calendar.quanttoria.com/week', req, 'https://accounts.quanttoria.com').href, 'https://calendar.quanttoria.com/week');
});
