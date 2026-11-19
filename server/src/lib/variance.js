import { decimal } from './money.js';

export function percentageVariance(actual, planned) {
  const expected = decimal(planned);
  return expected.isZero() ? decimal(0) : decimal(actual).minus(expected).div(expected).mul(100);
}

export function isVarianceFlagged(variance, tolerance = 3) {
  return decimal(variance).abs().gt(tolerance);
}
