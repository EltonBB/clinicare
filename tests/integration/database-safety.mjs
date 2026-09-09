/** @param {string | undefined} value */
export function requireTestDatabaseUrl(value) {
  const error = 'Set VELA_TEST_DATABASE_URL to the dedicated local vela_test database on 127.0.0.1:55432.';
  let url;
  try {
    url = new URL(value ?? '');
  } catch {
    throw new Error(error);
  }
  if (
    url.protocol !== 'postgresql:' ||
    url.hostname !== '127.0.0.1' ||
    url.port !== '55432' ||
    url.pathname !== '/vela_integration_test' ||
    url.username !== 'vela_test' ||
    !url.password || url.search || url.hash
  ) {
    throw new Error(error);
  }
  return url.toString();
}

/** @param {string | undefined} schema */
export function requireTestSchema(schema) {
  if (!schema || !/^vela_test_[a-f0-9]{32}$/.test(schema)) {
    throw new Error('Integration tests require a runner-generated isolated schema. Use npm run test:integration.');
  }
  return schema;
}
