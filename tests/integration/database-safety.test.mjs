import assert from 'node:assert/strict';
import test from 'node:test';
import { requireTestDatabaseUrl, requireTestSchema } from './database-safety.mjs';

const local = 'postgresql://vela_test:synthetic@127.0.0.1:55432/vela_integration_test';

test('accepts only the explicit isolated local database', () => {
  assert.equal(requireTestDatabaseUrl(local), local);
});

for (const value of [
  undefined, '', 'not a URL',
  local.replace('127.0.0.1', 'db.example.com'),
  local.replace('127.0.0.1', 'localhost'),
  local.replace('55432', '5432'),
  local.replace('/vela_integration_test', '/postgres'),
  local.replace('vela_test:', 'postgres:'),
  local.replace(':synthetic@', '@'),
  local.replace('postgresql:', 'https:'),
  `${local}?host=db.example.com`, `${local}?schema=public`, `${local}#public`,
]) {
  test(`rejects unsafe configuration ${String(value)}`, () => {
    assert.throws(() => requireTestDatabaseUrl(value));
  });
}

test('does not expose credentials in validation errors', () => {
  assert.throws(() => requireTestDatabaseUrl(local.replace('127.0.0.1', 'remote')), (error) => {
    assert.equal(String(error).includes('synthetic'), false);
    return true;
  });
});

test('only accepts a generated schema name', () => {
  const schema = 'vela_test_' + 'a'.repeat(32);
  assert.equal(requireTestSchema(schema), schema);
  for (const value of [undefined, '', 'public', 'vela_test_', `${schema}"; DROP SCHEMA public; --`]) {
    assert.throws(() => requireTestSchema(value));
  }
});
