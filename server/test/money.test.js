import test from 'node:test';
import assert from 'node:assert/strict';
import {
  decimal, decimal128, extendedCost, lineTax, money, moneyString, productionCost,
  splitGst, sumMoney, weightedAverageRate,
} from '../src/lib/money.js';

test('money rounds half up and preserves exact decimal inputs', () => {
  assert.equal(moneyString('1.005'), '1.01');
  assert.equal(moneyString('-1.005'), '-1.01');
  assert.equal(moneyString('1.004'), '1.00');
  assert.equal(sumMoney(['0.1', '0.2']).toFixed(2), '0.30');
  assert.equal(decimal('0.1').plus('0.2').toString(), '0.3');
});

test('Decimal128 conversion preserves decimal text', () => {
  assert.equal(decimal128('43.125').toString(), '43.125');
  assert.equal(decimal128('5855.00').toString(), '5855');
});

test('Decimal128 values are normalized before arithmetic and comparison', () => {
  const balance = decimal(decimal128('10'));
  const reorderLevel = decimal(decimal128('10'));
  assert.equal(balance.lte(reorderLevel), true);
  assert.equal(decimal(decimal128('25')).minus(decimal(decimal128('8'))).toString(), '17');
  assert.equal(extendedCost(decimal128('30'), decimal128('10')).toFixed(2), '300.00');
  assert.equal(weightedAverageRate(
    decimal128('100'), decimal128('42'), decimal128('60'), decimal128('45'),
  ).toString(), '43.125');
  assert.equal(lineTax(decimal128('100'), decimal128('5')).toFixed(2), '5.00');
});

test('weighted-average rate keeps the half-paisa average exact', () => {
  assert.equal(weightedAverageRate(100, '42', 60, '45').toString(), '43.125');
  assert.equal(extendedCost(weightedAverageRate(100, '42', 60, '45'), 40).toFixed(2), '1725.00');
});

test('GST rounds each line to paisa and conserves split tax', () => {
  assert.equal(lineTax('7500.00', 5).toFixed(2), '375.00');
  const local = splitGst('0.01', false);
  assert.equal(local.cgst.toFixed(2), '0.01');
  assert.equal(local.sgst.toFixed(2), '0.00');
  assert.equal(local.cgst.plus(local.sgst).toFixed(2), '0.01');
  assert.equal(splitGst('375.00', true).igst.toFixed(2), '375.00');
});

test('benchmark production costing uses final-step ROUND_HALF_UP', () => {
  const materials = [
    extendedCost('43.125', 40),
    extendedCost('140', '10.5'),
    extendedCost('200', '1.2'),
    extendedCost('2.5', 194),
    extendedCost('15', 9),
  ];
  assert.deepEqual(materials.map((value) => value.toFixed(2)), ['1725.00', '1470.00', '240.00', '485.00', '135.00']);
  const result = productionCost({
    materialCosts: materials, labor: '1200', utilities: '600', goodOutput: 188, sellingPrice: '50',
  });
  assert.equal(result.materialCost.toFixed(2), '4055.00');
  assert.equal(result.totalCost.toFixed(2), '5855.00');
  assert.equal(result.unitCost.toFixed(2), '31.14');
  assert.equal(result.profitPerPacket.toFixed(2), '18.86');
  assert.equal(result.profitMargin.toFixed(2), '37.72');
});
