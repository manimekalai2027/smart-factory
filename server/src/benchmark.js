import assert from 'node:assert/strict';
import Decimal from 'decimal.js';

const api = process.env.API_URL || 'http://localhost:4000/api';
const password = 'Factory@123';

async function request(path, token, options = {}) {
  const response = await fetch(`${api}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  const body = await response.json();
  return { response, body };
}
async function login(email) {
  const { response, body } = await request('/auth/login', null, {
    method: 'POST', body: JSON.stringify({ email, password }),
  });
  assert.equal(response.status, 200, body.message);
  return body.token;
}
async function call(path, token, method = 'GET', body, expectedStatus = 200) {
  const result = await request(path, token, { method, body: body === undefined ? undefined : JSON.stringify(body) });
  assert.equal(result.response.status, expectedStatus, result.body.message);
  return result.body;
}
function amount(value) { return new Decimal(value); }
function inventory(data, name) { return data.inventory.find((item) => item.name === name); }

const admin = await login('admin@smartfactory.local');
const sales = await login('sales@smartfactory.local');
const production = await login('production@smartfactory.local');
let data = await call('/bootstrap', admin);
const flour = inventory(data, 'Flour');
const murukku = data.products.find((item) => item.name === 'Murukku 200 g');
const retailer = data.customers.find((item) => item.name === 'Retailer A');
const distributor = data.customers.find((item) => item.name === 'Distributor B');

await call('/purchases', admin, 'POST', { supplierName: 'Sri Lakshmi Flour Mills', itemName: 'Flour', quantity: '60', unitRate: '45' }, 201);
await call('/production', production, 'POST', {
  productId: murukku._id, batches: 1,
  actual: { Flour: '40', 'Cooking Oil': '10.5', 'Spice Mix': '1.2', Pouches: '194', Cartons: '9' },
  goodOutput: 188, damaged: 6, labor: '1200', utilities: '600',
}, 201);

const retailerOrder = await call('/orders', sales, 'POST', {
  customerId: retailer._id, lines: [{ productId: murukku._id, quantity: 150 }],
}, 201);
await call(`/orders/${retailerOrder._id}/review`, admin, 'PATCH', { action: 'approve' });
const invoice = await call(`/orders/${retailerOrder._id}/invoice`, admin, 'POST', {}, 201);
await call(`/orders/${retailerOrder._id}/dispatch`, admin, 'POST', {}, 200);

const distributorOrder = await call('/orders', sales, 'POST', {
  customerId: distributor._id, lines: [{ productId: murukku._id, quantity: 120 }],
}, 201);
const shortage = await call(`/orders/${distributorOrder._id}/review`, admin, 'PATCH', { action: 'approve' }, 409);
await call('/payments', admin, 'POST', { invoiceId: invoice._id, amount: '4000', method: 'Bank transfer' }, 201);

data = await call('/bootstrap', admin);
assert.equal(inventory(data, 'Flour').balance, '120');
assert.equal(inventory(data, 'Cooking Oil').balance, '19.5');
assert.equal(inventory(data, 'Pouches').balance, '306');
assert.equal(inventory(data, 'Murukku 200 g').balance, '88');
assert.equal(invoice.total, '7875');
assert.equal(shortage.order.shortage, 32);
assert.equal(data.production[0].materialCost, '4055');
assert.equal(data.production[0].totalCost, '5855');
assert.equal(data.production[0].costPerPacket, '31.14');
assert.equal(amount(invoice.total).minus(4000).toString(), '3875');
console.log('Benchmark passed: stock, GST invoice, shortage, receivable and costing values match the specification.');
