import mongoose from 'mongoose';
import Decimal from 'decimal.js';

Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

export function decimal(value) {
  if (value && typeof value === 'object' && '$numberDecimal' in value) {
    return new Decimal(value.$numberDecimal);
  }
  if (value === null || value === undefined || value === '') return new Decimal(0);
  return new Decimal(value.toString());
}

export function money(value) {
  return decimal(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

export function moneyString(value) {
  return money(value).toFixed(2);
}

export function decimalString(value, places = 12) {
  return decimal(value).toDecimalPlaces(places, Decimal.ROUND_HALF_UP).toString();
}

export function decimal128(value) {
  return mongoose.Types.Decimal128.fromString(decimalString(value));
}

export function sumMoney(values) {
  return money(values.reduce((sum, value) => sum.plus(decimal(value)), new Decimal(0)));
}

export function extendedCost(unitRate, quantity, quantityPerRateUnit = 1) {
  if (decimal(quantityPerRateUnit).lte(0)) throw new RangeError('Rate-unit conversion must be positive.');
  return money(decimal(unitRate).mul(quantity).div(quantityPerRateUnit));
}

export function weightedAverageRate(oldQuantity, oldRate, receivedQuantity, receivedRate) {
  const totalQuantity = decimal(oldQuantity).plus(receivedQuantity);
  if (totalQuantity.isZero()) return new Decimal(0);
  if (totalQuantity.isNegative()) throw new RangeError('Weighted-average quantity cannot be negative.');
  return decimal(oldQuantity).mul(oldRate).plus(decimal(receivedQuantity).mul(receivedRate)).div(totalQuantity);
}

export function lineTax(taxable, ratePercent) {
  return money(decimal(taxable).mul(ratePercent).div(100));
}

export function splitGst(lineTaxAmount, interstate) {
  const tax = money(lineTaxAmount);
  if (interstate) return { cgst: money(0), sgst: money(0), igst: tax };
  const cgst = money(tax.div(2));
  return { cgst, sgst: money(tax.minus(cgst)), igst: money(0) };
}

export function productionCost({ materialCosts, labor, utilities, goodOutput, sellingPrice }) {
  const materialCost = sumMoney(materialCosts);
  const laborCost = money(labor);
  const utilitiesCost = money(utilities);
  const totalCost = sumMoney([materialCost, laborCost, utilitiesCost]);
  const output = decimal(goodOutput);
  const unitCost = output.gt(0) ? money(totalCost.div(output)) : money(0);
  const selling = money(sellingPrice);
  const profitPerPacket = output.gt(0) ? money(selling.minus(unitCost)) : money(0);
  const profitMargin = selling.gt(0) && output.gt(0)
    ? money(profitPerPacket.div(selling).mul(100))
    : money(0);
  return { materialCost, laborCost, utilitiesCost, totalCost, unitCost, selling, profitPerPacket, profitMargin };
}

export function decimalJson(value) {
  if (value instanceof mongoose.Types.Decimal128 || value?._bsontype === 'Decimal128') {
    return value.toString();
  }
  if (value instanceof mongoose.Types.ObjectId) return value.toString();
  if (value instanceof Date || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(decimalJson);
  if (typeof value.toObject === 'function') return decimalJson(value.toObject({ depopulate: true }));
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, decimalJson(child)]));
}
