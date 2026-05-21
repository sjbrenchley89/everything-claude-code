'use strict';

const assert = require('assert');
const { parseArgs } = require('../../scripts/sessions-cli');

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
  console.log('\nsessions-cli.js\n');
  let passed = 0;
  let failed = 0;

  function run(name, fn) {
    if (test(name, fn)) passed += 1;
    else failed += 1;
  }

  run('parseArgs returns defaults', () => {
    const opts = parseArgs(['node', 'sessions-cli.js']);
    assert.strictEqual(opts.dbPath, null);
    assert.strictEqual(opts.json, false);
    assert.strictEqual(opts.limit, 10);
    assert.strictEqual(opts.sessionId, null);
    assert.strictEqual(opts.help, false);
  });

  run('parseArgs --json flag', () => {
    const opts = parseArgs(['node', 'sessions-cli.js', '--json']);
    assert.strictEqual(opts.json, true);
  });

  run('parseArgs --db captures value', () => {
    const opts = parseArgs(['node', 'sessions-cli.js', '--db', '/tmp/test.db']);
    assert.strictEqual(opts.dbPath, '/tmp/test.db');
  });

  run('parseArgs --limit captures value', () => {
    const opts = parseArgs(['node', 'sessions-cli.js', '--limit', '25']);
    assert.strictEqual(opts.limit, '25');
  });

  run('parseArgs --help sets flag', () => {
    const opts = parseArgs(['node', 'sessions-cli.js', '--help']);
    assert.strictEqual(opts.help, true);
  });

  run('parseArgs -h alias sets help', () => {
    const opts = parseArgs(['node', 'sessions-cli.js', '-h']);
    assert.strictEqual(opts.help, true);
  });

  run('parseArgs positional becomes sessionId', () => {
    const opts = parseArgs(['node', 'sessions-cli.js', 'sess-abc-123']);
    assert.strictEqual(opts.sessionId, 'sess-abc-123');
  });

  run('parseArgs positional after flags becomes sessionId', () => {
    const opts = parseArgs(['node', 'sessions-cli.js', '--json', 'sess-xyz']);
    assert.strictEqual(opts.sessionId, 'sess-xyz');
    assert.strictEqual(opts.json, true);
  });

  run('parseArgs all flags together', () => {
    const opts = parseArgs([
      'node', 'sessions-cli.js',
      '--db', '/data/state.db',
      '--json',
      '--limit', '5',
      'my-session-id',
    ]);
    assert.strictEqual(opts.dbPath, '/data/state.db');
    assert.strictEqual(opts.json, true);
    assert.strictEqual(opts.limit, '5');
    assert.strictEqual(opts.sessionId, 'my-session-id');
  });

  run('parseArgs first positional is sessionId, second is ignored by design', () => {
    const opts = parseArgs(['node', 'sessions-cli.js', 'first-id']);
    assert.strictEqual(opts.sessionId, 'first-id');
  });

  run('parseArgs throws on unknown flag', () => {
    assert.throws(
      () => parseArgs(['node', 'sessions-cli.js', '--unknown']),
      /Unknown argument/,
    );
  });

  console.log(`\nResults: ${passed} passed, ${failed} failed\n`);
  return { passed, failed };
}

const { failed } = runTests();
process.exit(failed > 0 ? 1 : 0);
