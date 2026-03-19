import test from 'node:test';
import assert from 'node:assert/strict';

import { buildAuthRepoUrl, redactUrlCredentials } from '../src/git.js';

test('buildAuthRepoUrl injeta token apenas para URLs HTTPS do GitHub', () => {
  const repo = 'https://github.com/example/private-repo.git';
  const withToken = buildAuthRepoUrl(repo, 'secret-token', 'ci-user');
  assert.ok(withToken.includes('secret-token'));
  assert.ok(withToken.includes('ci-user'));
  assert.ok(withToken.startsWith('https://'));

  const alreadyAuth = buildAuthRepoUrl('https://foo:bar@github.com/owner/repo.git', 'ignored');
  assert.equal(alreadyAuth, 'https://foo:bar@github.com/owner/repo.git');

  const otherHost = buildAuthRepoUrl('https://gitlab.com/owner/repo.git', 'token');
  assert.equal(otherHost, 'https://gitlab.com/owner/repo.git');

  const localPath = buildAuthRepoUrl('/tmp/repo', 'token');
  assert.equal(localPath, '/tmp/repo');
});

test('redactUrlCredentials esconde usuário e senha na URL', () => {
  const url = 'https://ci-user:secret-token@github.com/example/private-repo.git';
  const redacted = redactUrlCredentials(url);
  assert.ok(redacted.includes('***'));
  assert.ok(!redacted.includes('secret-token'));
});
