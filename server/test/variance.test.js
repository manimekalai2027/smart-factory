import assert from 'node:assert/strict';
import test from 'node:test';
import { isVarianceFlagged, percentageVariance } from '../src/lib/variance.js';

test('variance flags values beyond the three percent tolerance', () => {
  assert.equal(percentageVariance(188, 200).toFixed(0), '-6');
  assert.equal(isVarianceFlagged(percentageVariance(188, 200)), true);
  assert.equal(percentageVariance('10.5', '10').toFixed(0), '5');
  assert.equal(isVarianceFlagged(percentageVariance('10.5', '10')), true);
  assert.equal(isVarianceFlagged('3'), false);
});
