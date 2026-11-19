import { decimal } from './money.js';

export function balanceFromMovements(openingBalance, movements) {
  return movements.reduce((balance, movement) => balance.plus(decimal(movement.quantity)), decimal(openingBalance));
}

export function isBalanceReconciled(cachedBalance, openingBalance, movements) {
  return decimal(cachedBalance).eq(balanceFromMovements(openingBalance, movements));
}
