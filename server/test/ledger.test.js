import assert from 'node:assert/strict';
import test from 'node:test';
import { balanceFromMovements, isBalanceReconciled } from '../src/lib/ledger.js';

test('stock balance reconciles to opening balance plus signed movements', () => {
  const movements = [
    { quantity: '100' },
    { quantity: '60' },
    { quantity: '-40' },
    { quantity: '-10.5' },
  ];
  assert.equal(balanceFromMovements('0', movements).toString(), '109.5');
  assert.equal(isBalanceReconciled('109.5', '0', movements), true);
  assert.equal(isBalanceReconciled('110', '0', movements), false);
});
