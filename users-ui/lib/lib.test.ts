import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseOrigins, safeNext } from './return-to.ts';
import { buildCookieOptions } from './cookies.ts';
import { emailError, nameError, passwordError } from './validation.ts';

const ALLOWED = parseOrigins('https://calendar.example.com, http://localhost:3002 ,not a url,ftp://files.example.com');

test('parseOrigins keeps only valid http(s) origins', () => {
  assert.deepEqual(ALLOWED, ['https://calendar.example.com', 'http://localhost:3002']);
  assert.deepEqual(parseOrigins(undefined), []);
});

test('safeNext allows same-site paths and allow-listed origins', () => {
  assert.equal(safeNext('/profile', ALLOWED), '/profile');
  assert.equal(safeNext('/admin/users?q=a#x', ALLOWED), '/admin/users?q=a#x');
  assert.equal(safeNext('https://calendar.example.com/week?d=1', ALLOWED), 'https://calendar.example.com/week?d=1');
  assert.equal(safeNext('http://localhost:3002/', ALLOWED), 'http://localhost:3002/');
});

test('safeNext falls back for anything that could be an open redirect', () => {
  const bad = [
    '//evil.test', '///evil.test', '/\\evil.test', '\\\\evil.test', 'https://evil.test/x',
    'https://calendar.example.com.evil.test/', 'https://calendar.example.com@evil.test/',
    'https://user:pw@calendar.example.com/', 'http://calendar.example.com/', 'https://calendar.example.com:8443/',
    'javascript:alert(1)', 'data:text/html,hi', 'ftp://files.example.com/', 'profile', '', '/a\nb', '/a\u0000b',
    'https://calendar.example.com/' + 'a'.repeat(3000),
  ];
  for (const next of bad) assert.equal(safeNext(next, ALLOWED), '/profile', JSON.stringify(next.slice(0, 40)));
  assert.equal(safeNext(undefined, ALLOWED), '/profile');
  assert.equal(safeNext(null, ALLOWED, '/home'), '/home');
  assert.equal(safeNext('https://calendar.example.com/', []), '/profile', 'nothing allow-listed means no absolute redirects');
});

test('buildCookieOptions scopes the cookie to the parent domain only when configured', () => {
  assert.deepEqual(buildCookieOptions(undefined, false), { path: '/', sameSite: 'lax', secure: false });
  assert.deepEqual(buildCookieOptions('  ', true), { path: '/', sameSite: 'lax', secure: true });
  assert.deepEqual(buildCookieOptions('.example.com', true), { domain: '.example.com', path: '/', sameSite: 'lax', secure: true });
  for (const bad of ['https://example.com', 'example.com:3000', 'example.com/path', 'localhost', 'a b.com']) {
    assert.throws(() => buildCookieOptions(bad, true), /COOKIE_DOMAIN/, bad);
  }
});

test('validation rules', () => {
  assert.equal(emailError('a@b.co'), null);
  for (const e of ['', 'nope', 'a@b', '@b.co', 'a b@c.de']) assert.ok(emailError(e), e);
  assert.equal(passwordError('longenough1'), null);
  assert.match(passwordError('short') ?? '', /8/);
  assert.match(passwordError('x'.repeat(73)) ?? '', /72/);
  assert.match(passwordError('Me@Example.com', ' me@example.com ') ?? '', /email/);
  assert.equal(nameError(' Mia '), null);
  assert.ok(nameError('  '));
  assert.ok(nameError('x'.repeat(101)));
});
