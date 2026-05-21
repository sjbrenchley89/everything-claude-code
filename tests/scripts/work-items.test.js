'use strict';

const assert = require('assert');
const {
  parseArgs,
  buildUpsertPayload,
  buildGithubPrWorkItem,
  buildGithubIssueWorkItem,
} = require('../../scripts/work-items');

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    return true;
  } catch (err) {
    console.log(`  ✗ ${name}`);
    console.log(`    Error: ${err.message}`);
    return false;
  }
}

function runTests() {
  console.log('\nwork-items.js\n');
  let passed = 0;
  let failed = 0;

  function run(name, fn) {
    if (test(name, fn)) passed += 1;
    else failed += 1;
  }

  // parseArgs
  run('parseArgs defaults to list command', () => {
    const opts = parseArgs(['node', 'work-items.js']);
    assert.strictEqual(opts.command, 'list');
    assert.strictEqual(opts.json, false);
    assert.strictEqual(opts.dbPath, null);
    assert.strictEqual(opts.limit, 20);
  });

  run('parseArgs first positional becomes command', () => {
    const opts = parseArgs(['node', 'work-items.js', 'upsert']);
    assert.strictEqual(opts.command, 'upsert');
  });

  run('parseArgs show command with positional id', () => {
    const opts = parseArgs(['node', 'work-items.js', 'show', 'my-item-id']);
    assert.strictEqual(opts.command, 'show');
    assert.deepStrictEqual(opts.positionals, ['my-item-id']);
  });

  run('parseArgs --json flag', () => {
    const opts = parseArgs(['node', 'work-items.js', '--json']);
    assert.strictEqual(opts.json, true);
  });

  run('parseArgs --db captures value', () => {
    const opts = parseArgs(['node', 'work-items.js', '--db', '/tmp/test.db']);
    assert.strictEqual(opts.dbPath, '/tmp/test.db');
  });

  run('parseArgs --title and --id captured', () => {
    const opts = parseArgs(['node', 'work-items.js', 'upsert', '--id', 'x', '--title', 'My Task']);
    assert.strictEqual(opts.title, 'My Task');
    assert.strictEqual(opts.id, 'x');
  });

  run('parseArgs --status captures value', () => {
    const opts = parseArgs(['node', 'work-items.js', '--status', 'blocked']);
    assert.strictEqual(opts.status, 'blocked');
  });

  run('parseArgs --owner captures value', () => {
    const opts = parseArgs(['node', 'work-items.js', '--owner', 'alice']);
    assert.strictEqual(opts.owner, 'alice');
  });

  run('parseArgs --url captures value', () => {
    const opts = parseArgs(['node', 'work-items.js', '--url', 'https://example.com']);
    assert.strictEqual(opts.url, 'https://example.com');
  });

  run('parseArgs --help flag', () => {
    const opts = parseArgs(['node', 'work-items.js', '--help']);
    assert.strictEqual(opts.help, true);
  });

  run('parseArgs throws on unknown flag', () => {
    assert.throws(
      () => parseArgs(['node', 'work-items.js', '--not-a-flag']),
      /Unknown argument/,
    );
  });

  run('parseArgs throws on value flag with no value', () => {
    assert.throws(
      () => parseArgs(['node', 'work-items.js', '--title']),
      /Missing value for --title/,
    );
  });

  // buildUpsertPayload
  run('buildUpsertPayload throws when no id', () => {
    assert.throws(
      () => buildUpsertPayload({ title: 'Test', positionals: [] }),
      /Missing work item id/,
    );
  });

  run('buildUpsertPayload throws when no title and no existing', () => {
    assert.throws(
      () => buildUpsertPayload({ id: 'my-id', positionals: [] }),
      /Missing --title/,
    );
  });

  run('buildUpsertPayload creates payload with defaults', () => {
    const payload = buildUpsertPayload({ id: 'my-item', title: 'Do the thing', positionals: [] });
    assert.strictEqual(payload.id, 'my-item');
    assert.strictEqual(payload.title, 'Do the thing');
    assert.strictEqual(payload.source, 'manual');
    assert.strictEqual(payload.status, 'open');
    assert.strictEqual(payload.priority, null);
    assert.strictEqual(payload.url, null);
    assert.strictEqual(payload.owner, null);
    assert.strictEqual(payload.sessionId, null);
    assert.strictEqual(typeof payload.updatedAt, 'string');
  });

  run('buildUpsertPayload accepts positional id', () => {
    const payload = buildUpsertPayload({ positionals: ['pos-id'], title: 'Task' });
    assert.strictEqual(payload.id, 'pos-id');
  });

  run('buildUpsertPayload explicit --id overrides positional', () => {
    const payload = buildUpsertPayload({ id: 'explicit', positionals: ['positional'], title: 'T' });
    assert.strictEqual(payload.id, 'explicit');
  });

  run('buildUpsertPayload inherits title from existing', () => {
    const existing = {
      id: 'e1', title: 'Old title', source: 'linear', status: 'open',
      priority: 'high', url: 'https://x.com', owner: 'bob', repoRoot: '/repo',
      sessionId: null, metadata: null, createdAt: '2024-01-01T00:00:00Z',
    };
    const payload = buildUpsertPayload({ id: 'e1', positionals: [] }, existing);
    assert.strictEqual(payload.title, 'Old title');
    assert.strictEqual(payload.source, 'linear');
    assert.strictEqual(payload.priority, 'high');
    assert.strictEqual(payload.createdAt, '2024-01-01T00:00:00Z');
  });

  run('buildUpsertPayload options override existing fields', () => {
    const existing = {
      id: 'e1', title: 'Old', source: 'manual', status: 'open',
      priority: null, url: null, owner: null, repoRoot: null,
      sessionId: null, metadata: null, createdAt: '2024-01-01T00:00:00Z',
    };
    const payload = buildUpsertPayload(
      { id: 'e1', title: 'New title', status: 'done', positionals: [] },
      existing,
    );
    assert.strictEqual(payload.title, 'New title');
    assert.strictEqual(payload.status, 'done');
  });

  // buildGithubPrWorkItem
  run('buildGithubPrWorkItem constructs correct id', () => {
    const pr = {
      number: 42, title: 'My PR', isDraft: false, mergeStateStatus: 'CLEAN',
      url: 'https://github.com/org/repo/pull/42', updatedAt: '2024-01-01T00:00:00Z',
      headRefName: 'feature', author: { login: 'alice' },
    };
    const item = buildGithubPrWorkItem('org/repo', pr);
    assert.strictEqual(item.id, 'github-org-repo-pr-42');
    assert.strictEqual(item.source, 'github-pr');
    assert.strictEqual(item.sourceId, '42');
    assert.strictEqual(item.title, 'PR #42: My PR');
  });

  run('buildGithubPrWorkItem draft PR is blocked with high priority', () => {
    const pr = {
      number: 5, title: 'WIP', isDraft: true, mergeStateStatus: 'CLEAN',
      url: null, updatedAt: null, headRefName: null, author: null,
    };
    const item = buildGithubPrWorkItem('owner/repo', pr);
    assert.strictEqual(item.status, 'blocked');
    assert.strictEqual(item.priority, 'high');
  });

  run('buildGithubPrWorkItem dirty merge state is blocked', () => {
    const pr = {
      number: 7, title: 'Conflicts', isDraft: false, mergeStateStatus: 'DIRTY',
      url: null, updatedAt: null, headRefName: null, author: null,
    };
    const item = buildGithubPrWorkItem('owner/repo', pr);
    assert.strictEqual(item.status, 'blocked');
    assert.strictEqual(item.priority, 'high');
  });

  run('buildGithubPrWorkItem clean PR is needs-review with normal priority', () => {
    const pr = {
      number: 10, title: 'Ready', isDraft: false, mergeStateStatus: 'CLEAN',
      url: 'https://example.com', updatedAt: '2024-01-01T00:00:00Z',
      headRefName: 'fix', author: { login: 'bob' },
    };
    const item = buildGithubPrWorkItem('owner/repo', pr);
    assert.strictEqual(item.status, 'needs-review');
    assert.strictEqual(item.priority, 'normal');
    assert.strictEqual(item.owner, 'bob');
  });

  run('buildGithubPrWorkItem null author yields null owner', () => {
    const pr = {
      number: 1, title: 'T', isDraft: false, mergeStateStatus: 'CLEAN',
      url: null, updatedAt: null, headRefName: null, author: null,
    };
    const item = buildGithubPrWorkItem('a/b', pr);
    assert.strictEqual(item.owner, null);
  });

  run('buildGithubPrWorkItem includes correct metadata', () => {
    const pr = {
      number: 1, title: 'T', isDraft: false, mergeStateStatus: 'CLEAN',
      url: null, updatedAt: null, headRefName: 'branch', author: null,
    };
    const item = buildGithubPrWorkItem('a/b', pr);
    assert.strictEqual(item.metadata.type, 'pull_request');
    assert.strictEqual(item.metadata.repo, 'a/b');
    assert.strictEqual(item.metadata.syncedBy, 'ecc-work-items-sync-github');
    assert.strictEqual(item.metadata.isDraft, false);
    assert.strictEqual(item.metadata.headRefName, 'branch');
  });

  // buildGithubIssueWorkItem
  run('buildGithubIssueWorkItem constructs correct id', () => {
    const issue = {
      number: 99, title: 'Bug report', url: 'https://github.com/org/repo/issues/99',
      updatedAt: '2024-01-01T00:00:00Z', labels: [], author: { login: 'charlie' },
    };
    const item = buildGithubIssueWorkItem('org/repo', issue);
    assert.strictEqual(item.id, 'github-org-repo-issue-99');
    assert.strictEqual(item.source, 'github-issue');
    assert.strictEqual(item.title, 'Issue #99: Bug report');
    assert.strictEqual(item.owner, 'charlie');
  });

  run('buildGithubIssueWorkItem status is always needs-review', () => {
    const issue = { number: 1, title: 'T', url: null, updatedAt: null, labels: [], author: null };
    const item = buildGithubIssueWorkItem('a/b', issue);
    assert.strictEqual(item.status, 'needs-review');
    assert.strictEqual(item.priority, 'normal');
  });

  run('buildGithubIssueWorkItem extracts label names from objects', () => {
    const issue = {
      number: 2, title: 'T', url: null, updatedAt: null,
      labels: [{ name: 'bug' }, { name: 'help wanted' }],
      author: null,
    };
    const item = buildGithubIssueWorkItem('a/b', issue);
    assert.deepStrictEqual(item.metadata.labels, ['bug', 'help wanted']);
  });

  run('buildGithubIssueWorkItem handles string labels', () => {
    const issue = {
      number: 3, title: 'T', url: null, updatedAt: null,
      labels: ['bug', 'enhancement'],
      author: null,
    };
    const item = buildGithubIssueWorkItem('a/b', issue);
    assert.deepStrictEqual(item.metadata.labels, ['bug', 'enhancement']);
  });

  run('buildGithubIssueWorkItem includes correct metadata', () => {
    const issue = { number: 4, title: 'T', url: null, updatedAt: null, labels: [], author: null };
    const item = buildGithubIssueWorkItem('a/b', issue);
    assert.strictEqual(item.metadata.type, 'issue');
    assert.strictEqual(item.metadata.repo, 'a/b');
    assert.strictEqual(item.metadata.syncedBy, 'ecc-work-items-sync-github');
  });

  console.log(`\nResults: ${passed} passed, ${failed} failed\n`);
  return { passed, failed };
}

const { failed } = runTests();
process.exit(failed > 0 ? 1 : 0);
