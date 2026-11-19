import Decimal from 'decimal.js';

const units = new Map([
  ['kg', { base: 'g', factor: 1000, dimension: 'mass' }],
  ['g', { base: 'g', factor: 1, dimension: 'mass' }],
  ['l', { base: 'ml', factor: 1000, dimension: 'volume' }],
  ['litre', { base: 'ml', factor: 1000, dimension: 'volume' }],
  ['litres', { base: 'ml', factor: 1000, dimension: 'volume' }],
  ['ml', { base: 'ml', factor: 1, dimension: 'volume' }],
  ['pc', { base: 'piece', factor: 1, dimension: 'piece' }],
  ['pcs', { base: 'piece', factor: 1, dimension: 'piece' }],
  ['piece', { base: 'piece', factor: 1, dimension: 'piece' }],
  ['pieces', { base: 'piece', factor: 1, dimension: 'piece' }],
  ['packet', { base: 'packet', factor: 1, dimension: 'packet' }],
  ['packets', { base: 'packet', factor: 1, dimension: 'packet' }],
  ['carton', { base: 'carton', factor: 1, dimension: 'carton' }],
  ['cartons', { base: 'carton', factor: 1, dimension: 'carton' }],
]);

function unitInfo(unit) {
  const result = units.get(String(unit).trim().toLowerCase());
  if (!result) throw new RangeError(`Unsupported unit: ${unit}`);
  return result;
}

export function baseUnitFor(unit) {
  return unitInfo(unit).base;
}

export function quantityToBase(value, unit) {
  const { factor } = unitInfo(unit);
  const baseQuantity = new Decimal(value.toString()).mul(factor);
  return baseQuantity.toString();
}

export function quantityFromBase(value, unit) {
  const { factor } = unitInfo(unit);
  return new Decimal(value).div(factor).toString();
}

export function baseUnitsPerUnit(unit) {
  return unitInfo(unit).factor;
}

export function convertQuantity(value, fromUnit, toUnit) {
  const from = unitInfo(fromUnit);
  const to = unitInfo(toUnit);
  if (from.dimension !== to.dimension) throw new RangeError(`Cannot convert ${fromUnit} to ${toUnit}.`);
  return new Decimal(value.toString()).mul(from.factor).div(to.factor).toString();
}
