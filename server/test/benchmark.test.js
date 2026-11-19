import assert from 'node:assert/strict';
import test from 'node:test';
import { decimal, productionCost, weightedAverageRate } from '../src/lib/money.js';
import { balanceFromMovements } from '../src/lib/ledger.js';

test('benchmark balances, receivable and costing remain exact', () => {
  assert.equal(balanceFromMovements('100', [{ quantity: '60' }, { quantity: '-40' }]).toString(), '120');
  assert.equal(balanceFromMovements('30', [{ quantity: '-10.5' }]).toString(), '19.5');
  assert.equal(balanceFromMovements('500', [{ quantity: '-194' }]).toString(), '306');
  assert.equal(balanceFromMovements('50', [{ quantity: '188' }]).toString(), '238');
  assert.equal(balanceFromMovements('238', [{ quantity: '-150' }]).toString(), '88');
  assert.equal(decimal('7875').minus(4000).toString(), '3875');
  assert.equal(decimal('120').minus(88).toString(), '32');

  const flourRate = weightedAverageRate(100, 42, 60, 45);
  const costing = productionCost({
    materialCosts: [
      flourRate.mul(40), decimal('10.5').mul(140), decimal('1.2').mul(200),
      decimal(194).mul('2.5'), decimal(9).mul(15),
    ],
    labor: 1200, utilities: 600, goodOutput: 188, sellingPrice: 50,
  });
  assert.equal(costing.materialCost.toFixed(2), '4055.00');
  assert.equal(costing.totalCost.toFixed(2), '5855.00');
  assert.equal(costing.unitCost.toFixed(2), '31.14');
});
