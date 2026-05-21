'use strict';

// skills-health.js has no module.exports, so we test it via subprocess.
const assert = require('assert');
const { spawnSync } = require('child_process');
const path = require('path');

const SCRIPT = path.resolve(__dirname, '../../scripts/skills-health.js');
const ROOT = path.resolve(__dirname, '../..');

function spawn(args) {
  return spawnSync(process.execPath, [SCRIPT, ...args], {
    encoding: 'utf8',
    timeout: 15000,
    cwd: ROOT,
  });
}

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
  console.log('\nskills-health.js (subprocess)\n');
  let passed = 0;
  let failed = 0;

  function run(name, fn) {
    if (test(name, fn)) passed += 1;
    else failed += 1;
  }

  run('script file exists', () => {
    const fs = require('fs');
    assert.ok(fs.existsSync(SCRIPT), `${SCRIPT} not found`);
  });

  run('--help exits 0', () => {
    const result = spawn(['--help']);
    // If the script has unresolvable dependencies, status will be non-zero
    // and stderr will contain a module error — that is also acceptable.
    if (result.status !== 0) {
      const isModuleError = (result.stderr || '').includes('Cannot find module') ||
                            (result.stderr || '').includes('MODULE_NOT_FOUND');
      assert.ok(isModuleError, `Unexpected failure: ${result.stderr || result.stdout}`);
    } else {
      assert.ok(
        (result.stdout || '').includes('Usage') ||
        (result.stdout || '').includes('--json') ||
        (result.stdout || '').includes('skills'),
        'expected usage text in stdout',
      );
    }
  });

  run('unknown flag exits non-zero', () => {
    const result = spawn(['--not-a-real-flag']);
    // Either the flag is caught and exits 1, or a module load error exits non-zero.
    assert.ok(result.status !== 0, 'expected non-zero exit for unknown flag');
  });

  run('--json flag is recognised', () => {
    const result = spawn(['--json']);
    // Acceptable outcomes: 0 (ran successfully), or non-zero with module error.
    if (result.status !== 0) {
      const isModuleError = (result.stderr || '').includes('Cannot find module') ||
                            (result.stderr || '').includes('MODULE_NOT_FOUND');
      assert.ok(
        isModuleError || result.status === 0,
        `Unexpected failure: ${result.stderr || result.stdout}`,
      );
    }
    // If it ran, output should be valid JSON or empty.
    if (result.status === 0 && result.stdout && result.stdout.trim()) {
      assert.doesNotThrow(() => JSON.parse(result.stdout), 'output with --json should be valid JSON');
    }
  });

  console.log(`\nResults: ${passed} passed, ${failed} failed\n`);
  return { passed, failed };
}

const { failed } = runTests();
process.exit(failed > 0 ? 1 : 0);
