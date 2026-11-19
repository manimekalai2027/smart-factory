import test from 'node:test';
import assert from 'node:assert/strict';
import { baseUnitFor, convertQuantity, quantityFromBase, quantityToBase } from '../src/lib/units.js';

test('converts kg, g, litre, ml, piece, packet and carton to integer base units', () => {
  assert.equal(quantityToBase('1', 'kg'), '1000');
  assert.equal(quantityToBase('1000', 'g'), '1000');
  assert.equal(quantityToBase('1', 'litre'), '1000');
  assert.equal(quantityToBase('1000', 'ml'), '1000');
  assert.equal(quantityToBase('1', 'piece'), '1');
  assert.equal(quantityToBase('12', 'packets'), '12');
  assert.equal(quantityToBase('3', 'carton'), '3');
  assert.equal(baseUnitFor('kg'), 'g');
});

test('round-trips fractional quantities without binary floating-point arithmetic', () => {
  assert.equal(quantityToBase('10.5', 'L'), '10500');
  assert.equal(quantityFromBase(10500, 'L'), '10.5');
  assert.equal(quantityToBase('1.234', 'kg'), '1234');
  assert.equal(convertQuantity('500', 'g', 'kg'), '0.5');
  assert.equal(convertQuantity('2500', 'ml', 'L'), '2.5');
  assert.throws(() => convertQuantity('1', 'carton', 'piece'), /Cannot convert/);
});
