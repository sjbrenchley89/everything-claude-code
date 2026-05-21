'use strict';

/**
 * Integration tests: multi-module data flows.
 *
 * These tests verify that data produced by one module is structurally
 * compatible with what downstream modules consume — no live database required.
 */

const assert = require('assert');
const {
  buildGithubPrWorkItem,
  buildGithubIssueWorkItem,
  buildUpsertPayload,
  parseArgs: workItemsParseArgs,
} = require('../../scripts/work-items');
const { parseArgs: statusParseArgs, renderMarkdown } = require('../../scripts/status');

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
  console.log('\nintegration: work-items → status pipeline\n');
  let passed = 0;
  let failed = 0;

  function run(name, fn) {
    if (test(name, fn)) passed += 1;
    else failed += 1;
  }

  // ── PR → work item → upsert payload round-trip ──

  run('PR work item can be fed directly into buildUpsertPayload as existing', () => {
    const pr = {
      number: 7, title: 'Add feature', isDraft: false, mergeStateStatus: 'CLEAN',
      url: 'https://github.com/org/repo/pull/7', updatedAt: '2024-06-01T12:00:00Z',
      headRefName: 'feat/add', author: { login: 'dev1' },
    };
    const workItem = buildGithubPrWorkItem('org/repo', pr, { repoRoot: '/workspace/repo' });

    // Simulate passing the built item as the "existing" record in an upsert
    const payload = buildUpsertPayload({ id: workItem.id, positionals: [] }, workItem);

    assert.strictEqual(payload.id, workItem.id);
    assert.strictEqual(payload.title, workItem.title);
    assert.strictEqual(payload.source, 'github-pr');
    assert.strictEqual(payload.status, workItem.status);
    assert.strictEqual(payload.owner, 'dev1');
  });

  run('Issue work item can be fed into buildUpsertPayload as existing', () => {
    const issue = {
      number: 23, title: 'Bug: crash on empty input',
      url: 'https://github.com/org/repo/issues/23',
      updatedAt: '2024-06-01T10:00:00Z',
      labels: [{ name: 'bug' }],
      author: { login: 'reporter' },
    };
    const workItem = buildGithubIssueWorkItem('org/repo', issue);
    const payload = buildUpsertPayload({ id: workItem.id, positionals: [] }, workItem);

    assert.strictEqual(payload.source, 'github-issue');
    assert.strictEqual(payload.title, 'Issue #23: Bug: crash on empty input');
    assert.strictEqual(payload.status, 'needs-review');
  });

  run('status options override existing work item fields in upsert', () => {
    const pr = {
      number: 3, title: 'Draft PR', isDraft: true, mergeStateStatus: 'CLEAN',
      url: null, updatedAt: null, headRefName: null, author: null,
    };
    const workItem = buildGithubPrWorkItem('a/b', pr);
    assert.strictEqual(workItem.status, 'blocked');

    // Operator manually escalates to done
    const payload = buildUpsertPayload(
      { id: workItem.id, status: 'done', positionals: [] },
      workItem,
    );
    assert.strictEqual(payload.status, 'done');
    assert.strictEqual(payload.source, 'github-pr', 'source should be inherited');
  });

  // ── work items → renderMarkdown pipeline ──

  run('work items produced by builders render correctly through renderMarkdown', () => {
    const pr = {
      number: 55, title: 'Refactor auth', isDraft: false, mergeStateStatus: 'CLEAN',
      url: 'https://github.com/org/repo/pull/55', updatedAt: '2024-06-01T09:00:00Z',
      headRefName: 'refactor', author: { login: 'eng' },
    };
    const issue = {
      number: 12, title: 'Add dark mode', url: null,
      updatedAt: '2024-06-01T08:00:00Z', labels: [], author: null,
    };
    const prItem = buildGithubPrWorkItem('org/repo', pr);
    const issueItem = buildGithubIssueWorkItem('org/repo', issue);

    const statusPayload = {
      generatedAt: '2024-06-01T12:00:00Z',
      dbPath: '/tmp/state.db',
      readiness: {
        status: 'needs-attention',
        attentionCount: 1,
        activeSessions: 0,
        failedSkillRuns: 0,
        warningInstallations: 0,
        pendingGovernanceEvents: 0,
        blockedWorkItems: 1,
      },
      activeSessions: { activeCount: 0, sessions: [] },
      skillRuns: {
        windowSize: 20,
        summary: { successCount: 3, failureCount: 0, unknownCount: 0, successRate: 100, failureRate: 0 },
        recent: [],
      },
      installHealth: { status: 'ok', totalCount: 1, healthyCount: 1, warningCount: 0, installations: [] },
      governance: { pendingCount: 0, events: [] },
      workItems: {
        openCount: 2,
        blockedCount: 1,
        closedCount: 0,
        items: [
          { ...prItem, updatedAt: '2024-06-01T09:00:00Z' },
          { ...issueItem, updatedAt: '2024-06-01T08:00:00Z' },
        ],
      },
    };

    const md = renderMarkdown(statusPayload);
    assert.ok(md.includes('Refactor auth'), 'PR title should appear in markdown');
    assert.ok(md.includes('Add dark mode'), 'Issue title should appear in markdown');
    assert.ok(md.includes('Status: needs-attention'), 'readiness status should appear');
    assert.ok(md.includes('Open: 2'), 'open count should appear');
  });

  // ── parseArgs cross-module structural consistency ──

  run('status and work-items parseArgs both accept --db and --json flags', () => {
    const statusOpts = statusParseArgs(['node', 'status.js', '--db', '/tmp/s.db', '--json']);
    const wiOpts = workItemsParseArgs(['node', 'work-items.js', '--db', '/tmp/s.db', '--json']);

    assert.strictEqual(statusOpts.dbPath, '/tmp/s.db');
    assert.strictEqual(wiOpts.dbPath, '/tmp/s.db');
    assert.strictEqual(statusOpts.json, true);
    assert.strictEqual(wiOpts.json, true);
  });

  run('github work item ids are deterministic across repeated calls', () => {
    const pr = {
      number: 1, title: 'T', isDraft: false, mergeStateStatus: 'CLEAN',
      url: null, updatedAt: null, headRefName: null, author: null,
    };
    const id1 = buildGithubPrWorkItem('my-org/my-repo', pr).id;
    const id2 = buildGithubPrWorkItem('my-org/my-repo', pr).id;
    assert.strictEqual(id1, id2, 'work item id must be deterministic');
    assert.strictEqual(id1, 'github-my-org-my-repo-pr-1');
  });

  run('github work item ids are unique per repo and type', () => {
    const pr = { number: 1, title: 'T', isDraft: false, mergeStateStatus: 'CLEAN', url: null, updatedAt: null, headRefName: null, author: null };
    const issue = { number: 1, title: 'T', url: null, updatedAt: null, labels: [], author: null };

    const prId = buildGithubPrWorkItem('org/repo', pr).id;
    const issueId = buildGithubIssueWorkItem('org/repo', issue).id;
    const otherRepoId = buildGithubPrWorkItem('org/other', pr).id;

    assert.notStrictEqual(prId, issueId, 'PR and issue with same number must have different ids');
    assert.notStrictEqual(prId, otherRepoId, 'Same PR number in different repos must have different ids');
  });

  console.log(`\nResults: ${passed} passed, ${failed} failed\n`);
  return { passed, failed };
}

const { failed } = runTests();
process.exit(failed > 0 ? 1 : 0);
