'use strict';

const assert = require('assert');
const { parseArgs, renderMarkdown } = require('../../scripts/status');

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

function minimalPayload(overrides) {
  return Object.assign({
    generatedAt: '2024-01-01T00:00:00.000Z',
    dbPath: '/tmp/ecc-test.db',
    readiness: {
      status: 'ok',
      attentionCount: 0,
      activeSessions: 0,
      failedSkillRuns: 0,
      warningInstallations: 0,
      pendingGovernanceEvents: 0,
      blockedWorkItems: 0,
    },
    activeSessions: { activeCount: 0, sessions: [] },
    skillRuns: {
      windowSize: 20,
      summary: {
        successCount: 5,
        failureCount: 1,
        unknownCount: 0,
        successRate: 83,
        failureRate: 17,
      },
      recent: [],
    },
    installHealth: {
      status: 'ok',
      totalCount: 2,
      healthyCount: 2,
      warningCount: 0,
      installations: [],
    },
    governance: { pendingCount: 0, events: [] },
    workItems: { openCount: 0, blockedCount: 0, closedCount: 0, items: [] },
  }, overrides || {});
}

function runTests() {
  console.log('\nstatus.js\n');
  let passed = 0;
  let failed = 0;

  function run(name, fn) {
    if (test(name, fn)) passed += 1;
    else failed += 1;
  }

  // parseArgs defaults
  run('parseArgs returns default values', () => {
    const opts = parseArgs(['node', 'status.js']);
    assert.strictEqual(opts.dbPath, null);
    assert.strictEqual(opts.json, false);
    assert.strictEqual(opts.markdown, false);
    assert.strictEqual(opts.exitCode, false);
    assert.strictEqual(opts.help, false);
    assert.strictEqual(opts.limit, 5);
  });

  run('parseArgs --json sets flag', () => {
    const opts = parseArgs(['node', 'status.js', '--json']);
    assert.strictEqual(opts.json, true);
  });

  run('parseArgs --markdown sets flag', () => {
    const opts = parseArgs(['node', 'status.js', '--markdown']);
    assert.strictEqual(opts.markdown, true);
  });

  run('parseArgs --db captures value', () => {
    const opts = parseArgs(['node', 'status.js', '--db', '/tmp/test.db']);
    assert.strictEqual(opts.dbPath, '/tmp/test.db');
  });

  run('parseArgs --limit captures value', () => {
    const opts = parseArgs(['node', 'status.js', '--limit', '20']);
    assert.strictEqual(opts.limit, '20');
  });

  run('parseArgs --exit-code sets flag', () => {
    const opts = parseArgs(['node', 'status.js', '--exit-code']);
    assert.strictEqual(opts.exitCode, true);
  });

  run('parseArgs --write captures path', () => {
    const opts = parseArgs(['node', 'status.js', '--markdown', '--write', '/tmp/out.md']);
    assert.strictEqual(opts.writePath, '/tmp/out.md');
  });

  run('parseArgs --help sets flag', () => {
    const opts = parseArgs(['node', 'status.js', '--help']);
    assert.strictEqual(opts.help, true);
  });

  run('parseArgs -h alias sets help', () => {
    const opts = parseArgs(['node', 'status.js', '-h']);
    assert.strictEqual(opts.help, true);
  });

  run('parseArgs throws on both --json and --markdown', () => {
    assert.throws(
      () => parseArgs(['node', 'status.js', '--json', '--markdown']),
      /Choose only one output format/,
    );
  });

  run('parseArgs throws on unknown argument', () => {
    assert.throws(
      () => parseArgs(['node', 'status.js', '--unknown']),
      /Unknown argument/,
    );
  });

  run('parseArgs throws when --db has no value', () => {
    assert.throws(
      () => parseArgs(['node', 'status.js', '--db']),
      /Missing value for --db/,
    );
  });

  run('parseArgs throws when --write has no value', () => {
    assert.throws(
      () => parseArgs(['node', 'status.js', '--write']),
      /Missing value for --write/,
    );
  });

  run('parseArgs throws when --limit has no value', () => {
    assert.throws(
      () => parseArgs(['node', 'status.js', '--limit']),
      /Missing value for --limit/,
    );
  });

  // renderMarkdown
  run('renderMarkdown returns a string', () => {
    const output = renderMarkdown(minimalPayload());
    assert.strictEqual(typeof output, 'string');
  });

  run('renderMarkdown includes ECC Status header', () => {
    const output = renderMarkdown(minimalPayload());
    assert.ok(output.includes('# ECC Status'), 'missing # ECC Status');
  });

  run('renderMarkdown includes readiness status', () => {
    const output = renderMarkdown(minimalPayload());
    assert.ok(output.includes('Status: ok'), 'missing readiness status');
  });

  run('renderMarkdown includes skill run counts', () => {
    const output = renderMarkdown(minimalPayload());
    assert.ok(output.includes('Success: 5'), 'missing success count');
    assert.ok(output.includes('Failure: 1'), 'missing failure count');
  });

  run('renderMarkdown formats dbPath as code', () => {
    const output = renderMarkdown(minimalPayload());
    assert.ok(output.includes('`/tmp/ecc-test.db`'), 'db path not formatted as inline code');
  });

  run('renderMarkdown ends with newline', () => {
    const output = renderMarkdown(minimalPayload());
    assert.ok(output.endsWith('\n'), 'output should end with newline');
  });

  run('renderMarkdown null successRate renders as n/a', () => {
    const payload = minimalPayload({
      skillRuns: {
        windowSize: 20,
        summary: { successCount: 0, failureCount: 0, unknownCount: 0, successRate: null, failureRate: null },
        recent: [],
      },
    });
    const output = renderMarkdown(payload);
    assert.ok(output.includes('n/a'), 'null rate should render as n/a');
  });

  run('renderMarkdown includes active session details when present', () => {
    const payload = minimalPayload({
      activeSessions: {
        activeCount: 1,
        sessions: [{
          id: 'sess-abc',
          harness: 'default',
          adapterId: 'claude',
          state: 'active',
          repoRoot: '/repo',
          startedAt: '2024-01-01T00:00:00Z',
          workerCount: 2,
        }],
      },
    });
    const output = renderMarkdown(payload);
    assert.ok(output.includes('sess-abc'), 'missing session id');
    assert.ok(output.includes('default/claude'), 'missing harness/adapter');
  });

  run('renderMarkdown includes work item title when present', () => {
    const payload = minimalPayload({
      workItems: {
        openCount: 1,
        blockedCount: 0,
        closedCount: 0,
        items: [{
          id: 'wi-1',
          source: 'github-pr',
          sourceId: '42',
          title: 'Fix the critical bug',
          status: 'open',
          owner: 'alice',
          updatedAt: '2024-01-01T00:00:00Z',
          url: null,
        }],
      },
    });
    const output = renderMarkdown(payload);
    assert.ok(output.includes('Fix the critical bug'), 'missing work item title');
  });

  run('renderMarkdown includes install health status', () => {
    const output = renderMarkdown(minimalPayload());
    assert.ok(output.includes('Install health: ok'), 'missing install health');
  });

  run('renderMarkdown includes governance section', () => {
    const output = renderMarkdown(minimalPayload());
    assert.ok(output.includes('## Governance'), 'missing governance section');
    assert.ok(output.includes('Pending governance events: 0'));
  });

  console.log(`\nResults: ${passed} passed, ${failed} failed\n`);
  return { passed, failed };
}

const { failed } = runTests();
process.exit(failed > 0 ? 1 : 0);
