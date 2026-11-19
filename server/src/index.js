import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import {
  decimal, decimal128, decimalJson, extendedCost, lineTax, money, productionCost,
  splitGst, sumMoney, weightedAverageRate,
} from './lib/money.js';
import { baseUnitFor, baseUnitsPerUnit, convertQuantity } from './lib/units.js';

const app = express();
const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret || jwtSecret === 'replace-this-with-a-long-random-secret') {
  throw new Error('Set JWT_SECRET in server/.env before starting the API.');
}
app.use(cors({ origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173' }));
app.use(express.json({ limit: '1mb' }));

const schema = (definition, options = {}) => new mongoose.Schema(definition, {
  timestamps: true, ...options,
});
const Decimal128 = mongoose.Schema.Types.Decimal128;
const User = mongoose.model('User', schema({
  name: { type: String, required: true }, email: { type: String, unique: true, required: true },
  password: { type: String, required: true }, role: { type: String, required: true },
}));
const Product = mongoose.model('Product', schema({
  name: { type: String, required: true }, sku: { type: String, unique: true },
  category: { type: String, default: 'Finished goods' }, packSize: String, hsn: String,
  price: { type: Decimal128, required: true }, gstRate: { type: Decimal128, default: '5' },
  bom: [{ itemName: String, quantity: Decimal128, unit: String }],
}));
const Customer = mongoose.model('Customer', schema({
  name: { type: String, required: true }, type: String, state: String, gstin: String,
  address: String, phone: String,
}));
const Inventory = mongoose.model('Inventory', schema({
  name: { type: String, unique: true, required: true }, category: String, unit: String,
  openingStock: { type: Decimal128, default: '0' }, balance: { type: Decimal128, default: '0' },
  reorderLevel: { type: Decimal128, default: '0' }, averageRate: { type: Decimal128, default: '0' },
}));
const Movement = mongoose.model('Movement', schema({
  item: { type: mongoose.Schema.Types.ObjectId, ref: 'Inventory', required: true },
  itemName: String, unit: String, type: String, quantity: Decimal128, balanceAfter: Decimal128,
  unitRate: Decimal128, reference: String, sourceType: String, sourceId: String, batch: String,
  reasonCode: String, note: String, user: String,
}));
const Order = mongoose.model('Order', schema({
  customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' }, customerName: String,
  customerAddress: String, customerState: String, customerGstin: String, salesperson: String,
  reviewedBy: String, reviewedAt: Date, dispatchedBy: String, dispatchedAt: Date,
  reviewChanges: [{ lineIndex: Number, productName: String, quantityBefore: Number, quantityAfter: Number, priceBefore: Decimal128, priceAfter: Decimal128 }],
  lines: [{ product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' }, productName: String, quantity: Number, price: Decimal128, hsn: String, gstRate: Decimal128 }],
  status: { type: String, default: 'Submitted' }, total: Decimal128, shortage: Number, note: String,
}));
const Invoice = mongoose.model('Invoice', schema({
  number: { type: String, unique: true }, order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', unique: true },
  customerName: String, customerAddress: String, customerState: String, customerGstin: String, createdBy: String,
  lines: [{ productName: String, quantity: Number, price: Decimal128, hsn: String, gstRate: Decimal128, taxable: Decimal128, cgst: Decimal128, sgst: Decimal128, igst: Decimal128, total: Decimal128 }],
  taxable: Decimal128, cgst: Decimal128, sgst: Decimal128, igst: Decimal128, total: Decimal128,
  paid: { type: Decimal128, default: '0' }, status: { type: String, default: 'Unpaid' },
}));
const Production = mongoose.model('Production', schema({
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' }, productName: String,
  plannedOutput: Number, goodOutput: Number, damaged: Number, yieldVariance: Decimal128,
  consumption: [{ itemName: String, planned: Decimal128, actual: Decimal128, unit: String, variance: Decimal128 }],
  reconciliation: [{ itemName: String, standard: Decimal128, actual: Decimal128, damaged: Decimal128, returned: Decimal128, reasonCode: String }],
  labor: Decimal128, utilities: Decimal128, materialCost: Decimal128, totalCost: Decimal128, costPerPacket: Decimal128,
  sellingPrice: Decimal128, profitPerPacket: Decimal128, profitMargin: Decimal128,
  supervisor: String,
}));
const Supplier = mongoose.model('Supplier', schema({
  name: { type: String, unique: true }, gstin: String, state: String, phone: String, address: String, createdBy: String,
}));
const Purchase = mongoose.model('Purchase', schema({
  supplierName: String, itemName: String, quantity: Decimal128, unitRate: Decimal128, total: Decimal128, date: Date, user: String,
}));
const Payment = mongoose.model('Payment', schema({
  invoice: { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice' }, invoiceNumber: String,
  customerName: String, amount: Decimal128, method: String, date: Date, reference: String, user: String,
}));
const Counter = mongoose.model('Counter', schema({
  key: { type: String, unique: true }, value: { type: Number, default: 0 },
}));
const CreditNote = mongoose.model('CreditNote', schema({
  number: { type: String, unique: true }, invoice: { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice' },
  order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' }, amount: Decimal128,
  reason: String, createdBy: String, lines: [{ productName: String, quantity: Number, total: Decimal128 }],
}));
const AuditLog = mongoose.model('AuditLog', schema({
  user: String, entity: String, entityId: String, action: String, before: mongoose.Schema.Types.Mixed,
  after: mongoose.Schema.Types.Mixed,
}));

const permissions = {
  'Salesman': ['overview', 'sales'],
  'Factory Admin': ['overview', 'sales', 'orders', 'inventory', 'purchases'],
  'Production Supervisor': ['overview', 'production', 'inventory'],
  'Accountant / Auditor': ['overview', 'reports', 'invoices', 'payments', 'inventory'],
  'Owner': ['overview', 'sales', 'orders', 'production', 'inventory', 'purchases', 'reports', 'invoices', 'payments'],
};

function auth(req, res, next) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ message: 'Sign in to continue.' });
  try { req.user = jwt.verify(token, jwtSecret); next(); }
  catch { return res.status(401).json({ message: 'Your session has expired. Sign in again.' }); }
}
function allow(...allowed) {
  return (req, res, next) => allowed.includes(req.user.role)
    ? next() : res.status(403).json({ message: 'Your role cannot perform this action.' });
}
function respond(res, data, status = 200) {
  return res.status(status).json(decimalJson(data));
}
function parseDecimal(value) {
  try {
    const parsed = decimal(value);
    return parsed.isFinite() ? parsed : null;
  } catch {
    return null;
  }
  function financialYear(date = new Date()) {
    const year = date.getMonth() >= 3 ? date.getFullYear() : date.getFullYear() - 1;
    return `${year}-${String((year + 1) % 100).padStart(2, '0')}`;
  }
  async function nextNumber(key, prefix) {
    const counter = await Counter.findOneAndUpdate(
      { key }, { $inc: { value: 1 } }, { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    return `${prefix}/${String(counter.value).padStart(4, '0')}`;
  }
  async function audit(req, entity, entityId, action, before, after) {
    await AuditLog.create({ user: req.user.name, entity, entityId: String(entityId), action, before, after });
  }
}
const fail = (res, error) => {
  if (error?.name === 'ValidationError' || error?.name === 'CastError' || error?.code === 11000) {
    return res.status(400).json({ message: error.code === 11000 ? 'This record already exists.' : error.message });
  }
  console.error(error);
  return res.status(500).json({ message: 'The request could not be completed.' });
};

app.get('/api/health', (_req, res) => res.json({ ok: true, database: mongoose.connection.readyState === 1 }));
app.post('/api/auth/login', async (req, res) => {
  try {
    const user = await User.findOne({ email: String(req.body.email || '').toLowerCase() });
    if (!user || !(await bcrypt.compare(String(req.body.password || ''), user.password))) {
      return res.status(401).json({ message: 'Email or password is incorrect.' });
    }
    const token = jwt.sign({ id: user.id, name: user.name, role: user.role, permissions: permissions[user.role] || [] },
      jwtSecret, { expiresIn: '12h' });
    res.json({ token, user: { id: user.id, name: user.name, role: user.role, permissions: permissions[user.role] || [] } });
  } catch (error) { fail(res, error); }
});
app.use('/api', auth);

app.get('/api/bootstrap', async (req, res) => {
  try {
    const [products, customers, inventory, orders, invoices, suppliers, production, payments, movements, purchases] = await Promise.all([
      Product.find().lean(), Customer.find().lean(), Inventory.find().sort({ category: 1, name: 1 }).lean(),
      Order.find().sort({ createdAt: -1 }).lean(), Invoice.find().sort({ createdAt: -1 }).lean(),
      Supplier.find().lean(), Production.find().sort({ createdAt: -1 }).limit(30).lean(),
      Payment.find().sort({ date: -1 }).lean(), Movement.find().sort({ createdAt: -1 }).limit(80).lean(),
      Purchase.find().sort({ date: -1 }).limit(80).lean(),
    ]);
    const role = req.user.role;
    const salesman = role === 'Salesman';
    const productionOnly = role === 'Production Supervisor';
    const visibleOrders = salesman ? orders.filter((o) => o.salesperson === req.user.name) : productionOnly ? [] : orders;
    const visibleOrderIds = new Set(visibleOrders.map((o) => String(o._id)));
    const visibleInvoices = salesman ? invoices.filter((i) => visibleOrderIds.has(String(i.order))) : productionOnly ? [] : invoices;
    const visibleInventory = salesman ? [] : inventory;
    const visibleProduction = salesman ? [] : productionOnly
      ? production.map(({ sellingPrice, profitPerPacket, profitMargin, ...run }) => run)
      : production;
    const visibleCustomers = productionOnly ? [] : customers;
    const visibleSuppliers = ['Owner', 'Factory Admin'].includes(role) ? suppliers : [];
    const visiblePurchases = ['Owner', 'Factory Admin'].includes(role) ? purchases : [];
    const visiblePayments = ['Owner', 'Factory Admin', 'Accountant / Auditor'].includes(role) ? payments : [];
    const visibleMovements = salesman ? [] : movements;
    const visibleProducts = productionOnly ? products.map(({ price, ...product }) => product) : products;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const todayOrders = visibleOrders.filter((o) => new Date(o.createdAt) >= today);
    const outstanding = sumMoney(visibleInvoices.map((i) => decimal(i.total).minus(i.paid).max(0)));
    const alerts = visibleInventory.filter((i) => decimal(i.balance).lte(i.reorderLevel) && decimal(i.reorderLevel).gt(0));
    const shortageOrders = visibleOrders.filter((o) => o.shortage > 0 && o.status !== 'Rejected');
    respond(res, {
      user: req.user, products: visibleProducts, customers: visibleCustomers, inventory: visibleInventory,
      orders: visibleOrders, invoices: visibleInvoices, suppliers: visibleSuppliers, production: visibleProduction,
      payments: visiblePayments, movements: visibleMovements, purchases: visiblePurchases,
      metrics: {
        todayOrders: todayOrders.length,
        todaySales: sumMoney(visibleInvoices.filter((i) => new Date(i.createdAt) >= today).map((i) => i.total)),
        totalSales: sumMoney(visibleInvoices.map((i) => i.total)),
        rawMaterialLines: visibleInventory.filter((i) => i.category === 'Raw materials').length,
        rawMaterialValue: sumMoney(visibleInventory.filter((i) => i.category === 'Raw materials').map((i) => extendedCost(i.averageRate, i.balance))),
        pendingOrders: visibleOrders.filter((o) => o.status === 'Submitted').length,
        productionToday: visibleProduction.filter((p) => new Date(p.createdAt) >= today).reduce((s, p) => s + p.goodOutput, 0),
        outstanding, lowStock: alerts.length, varianceAlerts: visibleProduction.filter((p) => p.consumption.some((c) => decimal(c.variance).abs().gt(3)) || p.yieldVariance < -3).length,
        finishedGoods: visibleInventory.filter((i) => i.category === 'Finished goods').reduce((s, i) => s + Number(i.balance), 0),
        rawStockLines: visibleInventory.filter((i) => i.category !== 'Finished goods').length,
        avgCost: visibleProduction[0]?.costPerPacket || decimal128(0), shortages: shortageOrders.length,
      },
    });
  } catch (error) { fail(res, error); }
});

app.post('/api/orders', allow('Salesman', 'Factory Admin', 'Owner'), async (req, res) => {
  try {
    const customer = await Customer.findById(req.body.customerId);
    if (!customer || !Array.isArray(req.body.lines) || !req.body.lines.length) return res.status(400).json({ message: 'Select a customer and at least one product.' });
    const lines = [];
    for (const input of req.body.lines) {
      const product = await Product.findById(input.productId);
      const quantity = Number(input.quantity);
      if (!product || !Number.isInteger(quantity) || quantity <= 0) return res.status(400).json({ message: 'Each order line needs a valid product and positive whole packet quantity.' });
      lines.push({ product: product.id, productName: product.name, quantity, price: decimal128(money(product.price)), hsn: product.hsn, gstRate: product.gstRate });
    }
    const total = sumMoney(lines.map((line) => {
      const taxable = decimal(line.price).mul(line.quantity);
      return taxable.plus(lineTax(taxable, line.gstRate));
    }));
    const order = await Order.create({
      customer: customer.id, customerName: customer.name, customerAddress: customer.address, customerState: customer.state, customerGstin: customer.gstin,
      salesperson: req.user.name, lines, status: 'Submitted', total: decimal128(total),
    });
    respond(res, order, 201);
  } catch (error) { fail(res, error); }
});
app.patch('/api/orders/:id/review', allow('Factory Admin', 'Owner'), async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order || order.status !== 'Submitted') return res.status(400).json({ message: 'Only submitted orders can be reviewed.' });
    const beforeReview = order.toObject();
    if (req.body.action === 'reject') {
      order.status = 'Rejected'; order.note = String(req.body.note || 'Rejected by admin');
      order.reviewedBy = req.user.name; order.reviewedAt = new Date();
      await order.save(); await audit(req, 'Order', order.id, 'review', beforeReview, order.toObject()); return respond(res, order);
    }
    if (req.body.lines) {
      if (!Array.isArray(req.body.lines) || req.body.lines.length !== order.lines.length) return res.status(400).json({ message: 'Order line count cannot be changed during review.' });
      const updates = req.body.lines.map((line) => ({ quantity: Number(line.quantity), price: parseDecimal(line.price) }));
      if (updates.some((line) => !Number.isInteger(line.quantity) || line.quantity <= 0 || !line.price || line.price.isNegative())) {
        return res.status(400).json({ message: 'Review requires positive whole quantities and non-negative prices.' });
      }
      const changes = updates.map((update, index) => ({
        lineIndex: index, productName: order.lines[index].productName,
        quantityBefore: order.lines[index].quantity, quantityAfter: update.quantity,
        priceBefore: order.lines[index].price, priceAfter: decimal128(money(update.price)),
      })).filter((change) => change.quantityBefore !== change.quantityAfter || !decimal(change.priceBefore).eq(change.priceAfter));
      order.reviewChanges.push(...changes);
      order.lines.forEach((line, index) => {
        line.quantity = updates[index].quantity; line.price = decimal128(money(updates[index].price));
      });
    }
    order.total = decimal128(sumMoney(order.lines.map((line) => {
      const taxable = decimal(line.price).mul(line.quantity);
      return taxable.plus(lineTax(taxable, line.gstRate));
    })));
    const needs = new Map();
    for (const line of order.lines) needs.set(line.productName, (needs.get(line.productName) || 0) + line.quantity);
    const stocks = await Inventory.find({ category: 'Finished goods' });
    const shortage = [...needs].reduce((s, [name, qty]) => s + Math.max(0, qty - Number(stocks.find((i) => i.name === name)?.balance || 0)), 0);
    order.shortage = shortage;
    if (req.body.action === 'approve' && shortage) {
      await order.save();
      return res.status(409).json(decimalJson({ message: `Insufficient finished goods: ${shortage} packet(s) short. Order remains submitted.`, order }));
    }
    if (req.body.action !== 'approve') return res.status(400).json({ message: 'Choose approve or reject.' });
    order.status = 'Approved'; order.reviewedBy = req.user.name; order.reviewedAt = new Date();
    await order.save(); await audit(req, 'Order', order.id, 'review', beforeReview, order.toObject()); respond(res, order);
  } catch (error) { fail(res, error); }
});
app.post('/api/orders/:id/invoice', allow('Factory Admin', 'Owner'), async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order || !['Approved', 'Invoiced'].includes(order.status)) return res.status(400).json({ message: 'Approve the order before invoicing.' });
    const exists = await Invoice.findOne({ order: order.id });
    if (exists) return res.status(409).json({ message: `Invoice ${exists.number} already exists.`, invoice: exists });
    const taxableLines = [], cgstLines = [], sgstLines = [], igstLines = [];
    const interstate = order.customerState && order.customerState.toLowerCase() !== 'tamil nadu';
    const lines = order.lines.map((l) => {
      const lineTaxable = money(decimal(l.price).mul(l.quantity));
      const tax = lineTax(lineTaxable, l.gstRate);
      const { cgst, sgst, igst } = splitGst(tax, interstate);
      taxableLines.push(lineTaxable); cgstLines.push(cgst); sgstLines.push(sgst); igstLines.push(igst);
      return {
        productName: l.productName, quantity: l.quantity, price: l.price, hsn: l.hsn, gstRate: l.gstRate,
        taxable: decimal128(lineTaxable), cgst: decimal128(cgst), sgst: decimal128(sgst), igst: decimal128(igst),
        total: decimal128(sumMoney([lineTaxable, cgst, sgst, igst])),
      };
    });
    const taxable = sumMoney(taxableLines), cgst = sumMoney(cgstLines);
    const sgst = sumMoney(sgstLines), igst = sumMoney(igstLines);
    const invoice = await Invoice.create({
      number: await nextNumber(`invoice:${financialYear()}`, `TN/${financialYear()}`),
      order: order.id, customerName: order.customerName, customerAddress: order.customerAddress, customerState: order.customerState, customerGstin: order.customerGstin, createdBy: req.user.name,
      lines, taxable: decimal128(taxable), cgst: decimal128(cgst), sgst: decimal128(sgst), igst: decimal128(igst),
      total: decimal128(sumMoney([taxable, cgst, sgst, igst])),
    });
    order.status = 'Invoiced'; await order.save(); respond(res, invoice, 201);
  } catch (error) { fail(res, error); }
});
app.post('/api/orders/:id/dispatch', allow('Factory Admin', 'Owner'), async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order || order.status !== 'Invoiced') return res.status(400).json({ message: 'Only invoiced orders can be dispatched.' });
    const invoice = await Invoice.findOne({ order: order.id });
    if (!invoice) return res.status(400).json({ message: 'Create the invoice before dispatch.' });
    const dispatchOrder = await Order.findOneAndUpdate(
      { _id: order.id, status: 'Invoiced' }, { $set: { status: 'Dispatching' } }, { new: true },
    );
    if (!dispatchOrder) return res.status(409).json({ message: 'This order is already being dispatched or has already shipped.' });
    const changed = [];
    for (const line of order.lines) {
      const stock = await Inventory.findOneAndUpdate(
        { name: line.productName, category: 'Finished goods', balance: { $gte: line.quantity } },
        [{ $set: { balance: { $subtract: ['$balance', decimal128(line.quantity)] } } }], { new: true },
      );
      if (!stock) {
        for (const item of changed) {
          const restored = await Inventory.findByIdAndUpdate(item.stock.id, { $inc: { balance: decimal128(item.quantity) } }, { new: true });
          await Movement.create({ item: item.stock.id, itemName: item.stock.name, unit: item.stock.unit, type: 'Dispatch reversal', quantity: decimal128(item.quantity), balanceAfter: restored.balance, reference: `ROLLBACK-${order.id}`, user: req.user.name });
        }
        dispatchOrder.status = 'Invoiced'; await dispatchOrder.save();
        return res.status(409).json({ message: `Insufficient stock to dispatch ${line.productName}.` });
      }
      changed.push({ stock, quantity: line.quantity });
      await Movement.create({ item: stock.id, itemName: stock.name, unit: stock.unit, type: 'Sales dispatch', quantity: decimal128(-line.quantity), balanceAfter: stock.balance, reference: `ORDER-${order.id}`, user: req.user.name });
    }
    dispatchOrder.status = 'Dispatched'; dispatchOrder.dispatchedBy = req.user.name; dispatchOrder.dispatchedAt = new Date();
    await dispatchOrder.save(); respond(res, { order: dispatchOrder, invoice });
  } catch (error) { fail(res, error); }
});

app.post('/api/invoices/:id/cancel', allow('Factory Admin', 'Owner'), async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id);
    if (!invoice) return res.status(404).json({ message: 'Invoice not found.' });
    if (invoice.status === 'Cancelled') return res.status(409).json({ message: 'This invoice is already cancelled.' });
    const order = await Order.findById(invoice.order);
    if (!order) return res.status(400).json({ message: 'The invoice order is missing.' });
    const before = invoice.toObject();
    const restored = [];
    if (order.status === 'Dispatched') {
      for (const line of order.lines) {
        const stock = await Inventory.findOneAndUpdate(
          { name: line.productName, category: 'Finished goods' },
          { $inc: { balance: decimal128(line.quantity) } }, { new: true },
        );
        if (!stock) return res.status(400).json({ message: `Finished goods inventory for ${line.productName} is missing.` });
        restored.push({ productName: line.productName, quantity: line.quantity, total: decimal128(line.price).mul(line.quantity) });
        await Movement.create({
          item: stock.id, itemName: stock.name, unit: stock.unit, type: 'Credit note reversal',
          quantity: decimal128(line.quantity), balanceAfter: stock.balance, reference: `CREDIT-${invoice.id}`,
          sourceType: 'CreditNote', sourceId: String(invoice.id), user: req.user.name,
        });
      }
    }
    invoice.status = 'Cancelled';
    await invoice.save();
    order.status = 'Cancelled';
    await order.save();
    const creditNote = await CreditNote.create({
      number: await nextNumber(`credit:${financialYear()}`, `CN/${financialYear()}`),
      invoice: invoice.id, order: order.id, amount: invoice.total, reason: req.body.reason || 'Invoice cancelled',
      createdBy: req.user.name, lines: restored,
    });
    await audit(req, 'Invoice', invoice.id, 'cancel', before, invoice.toObject());
    respond(res, { invoice, order, creditNote });
  } catch (error) { fail(res, error); }
});

app.post('/api/production', allow('Production Supervisor', 'Owner'), async (req, res) => {
  try {
    const product = await Product.findById(req.body.productId);
    const batches = Number(req.body.batches);
    const goodOutput = Number(req.body.goodOutput);
    const damaged = Number(req.body.damaged || 0);
    if (!product || !Number.isInteger(batches) || batches < 1 || !Number.isInteger(goodOutput) || goodOutput < 0 || !Number.isInteger(damaged) || damaged < 0) return res.status(400).json({ message: 'Select a product and enter valid batch, good-output and damage quantities.' });
    const plannedOutput = batches * 200;
    const actualValues = req.body.actual || {};
    if (typeof actualValues !== 'object' || Array.isArray(actualValues)) {
      return res.status(400).json({ message: 'Actual consumption must be supplied as a material-to-quantity object.' });
    }
    let consumption;
    try {
      consumption = product.bom.map((bom) => {
        const planned = decimal(bom.quantity).mul(batches);
        const actual = decimal(actualValues[bom.itemName] ?? planned.toString());
        return {
          itemName: bom.itemName, planned, actual, unit: bom.unit,
          variance: planned.isZero() ? decimal(0) : actual.minus(planned).div(planned).mul(100).toDecimalPlaces(2),
        };
      });
    } catch {
      return res.status(400).json({ message: 'Actual consumption must be a non-negative number for each BOM material.' });
    }
    if (consumption.some((line) => !line.actual.isFinite() || line.actual.isNegative())) {
      return res.status(400).json({ message: 'Actual consumption must be a non-negative number for each BOM material.' });
    }
    const laborInput = parseDecimal(req.body.labor ?? 0), utilitiesInput = parseDecimal(req.body.utilities ?? 0);
    if (!laborInput || laborInput.isNegative() || !utilitiesInput || utilitiesInput.isNegative()) {
      return res.status(400).json({ message: 'Production expenses must be valid non-negative amounts.' });
    }
    const labor = money(laborInput), utilities = money(utilitiesInput);
    const finished = await Inventory.findOne({ name: product.name, category: 'Finished goods' });
    if (!finished) return res.status(400).json({ message: `Finished goods inventory for ${product.name} is not configured.` });
    const runId = new mongoose.Types.ObjectId();
    const movements = [];
    for (const line of consumption) {
      const current = await Inventory.findOne({ name: line.itemName });
      if (!current) return res.status(400).json({ message: `Inventory item ${line.itemName} is not configured.` });
      let actualInStockUnit;
      try {
        actualInStockUnit = decimal(convertQuantity(line.actual, line.unit, current.unit));
      } catch (error) {
        return res.status(400).json({ message: error.message });
      }
      const stock = current && await Inventory.findOneAndUpdate(
        { _id: current.id, balance: { $gte: decimal128(actualInStockUnit) } },
        [{ $set: { balance: { $subtract: ['$balance', decimal128(actualInStockUnit)] } } }], { new: true },
      );
      if (!stock) {
        for (const prior of movements) {
          const restored = await Inventory.findByIdAndUpdate(prior.stock.id, { $inc: { balance: decimal128(prior.qty) } }, { new: true });
          await Movement.create({ item: prior.stock.id, itemName: prior.stock.name, unit: prior.stock.unit, type: 'Production reversal', quantity: decimal128(prior.qty), balanceAfter: restored.balance, reference: `ROLLBACK-${runId}`, user: req.user.name });
        }
        return res.status(409).json({ message: `Insufficient ${line.itemName} stock. Available: ${current?.balance ?? 0} ${line.unit}; required: ${line.actual} ${line.unit}.` });
      }
      movements.push({ stock, qty: actualInStockUnit });
      await Movement.create({ item: stock.id, itemName: stock.name, unit: stock.unit, type: 'Production issue', quantity: decimal128(actualInStockUnit.neg()), balanceAfter: stock.balance, reference: `RUN-${runId}`, user: req.user.name });
    }
    // Pouch reconciliation: standard 200, consumed 188 good + 6 damaged = 194.
    // The six unused standard pouches are returned, so damage is visible without
    // deducting those six twice; the net stock deduction remains 194.
    const pouchLine = consumption.find((line) => line.itemName === 'Pouches');
    const pouchReconciliation = pouchLine && pouchLine.planned.eq(200 * batches) && pouchLine.actual.eq(194 * batches)
      ? { itemName: 'Pouches', standard: pouchLine.planned, actual: pouchLine.actual, damaged: decimal(6 * batches), returned: decimal(6 * batches), reasonCode: 'DAMAGED_PACKAGING' }
      : null;
    if (pouchReconciliation) {
      const pouchStock = movements.find(({ stock }) => stock.name === 'Pouches')?.stock;
      if (!pouchStock) return res.status(400).json({ message: 'Pouches inventory is required for pouch reconciliation.' });
      const afterDamage = await Inventory.findOneAndUpdate(
        { _id: pouchStock.id, balance: { $gte: decimal128(pouchReconciliation.damaged) } },
        { $inc: { balance: decimal128(pouchReconciliation.damaged.neg()) } }, { new: true },
      );
      if (!afterDamage) return res.status(409).json({ message: 'Pouches stock changed during damage reconciliation. Retry the production run.' });
      await Movement.create({
        item: pouchStock.id, itemName: pouchStock.name, unit: pouchStock.unit, type: 'Production damage',
        quantity: decimal128(pouchReconciliation.damaged.neg()), balanceAfter: afterDamage.balance,
        reference: `RUN-${runId}`, reasonCode: pouchReconciliation.reasonCode, user: req.user.name,
      });
      const afterReturn = await Inventory.findByIdAndUpdate(
        pouchStock.id, { $inc: { balance: decimal128(pouchReconciliation.returned) } }, { new: true },
      );
      await Movement.create({
        item: pouchStock.id, itemName: pouchStock.name, unit: pouchStock.unit, type: 'Production variance return',
        quantity: decimal128(pouchReconciliation.returned), balanceAfter: afterReturn.balance,
        reference: `RUN-${runId}`, reasonCode: 'UNUSED_STANDARD_PACKAGING', user: req.user.name,
      });
    }
    const costing = productionCost({
      materialCosts: movements.map(({ stock, qty }) => extendedCost(stock.averageRate, qty)),
      labor, utilities, goodOutput, sellingPrice: product.price,
    });
    const finishedUpdated = await Inventory.findOneAndUpdate(
      { _id: finished.id, balance: finished.balance, averageRate: finished.averageRate },
      { $set: {
        balance: decimal128(decimal(finished.balance).plus(goodOutput)),
        averageRate: decimal128(goodOutput
          ? weightedAverageRate(finished.balance, finished.averageRate, goodOutput, costing.unitCost)
          : finished.averageRate),
      } }, { new: true },
    );
    if (!finishedUpdated) return res.status(409).json({ message: 'Finished goods stock changed during production. Reconcile stock and retry.' });
    const run = await Production.create({
      _id: runId,
      product: product.id, productName: product.name, plannedOutput, goodOutput, damaged,
      yieldVariance: plannedOutput ? decimal128(decimal(goodOutput - plannedOutput).div(plannedOutput).mul(100).toDecimalPlaces(2)) : decimal128(0),
      consumption: consumption.map((line) => ({ ...line, planned: decimal128(line.planned), actual: decimal128(line.actual), variance: decimal128(line.variance) })),
      reconciliation: pouchReconciliation ? [{
        ...pouchReconciliation,
        standard: decimal128(pouchReconciliation.standard), actual: decimal128(pouchReconciliation.actual),
        damaged: decimal128(pouchReconciliation.damaged), returned: decimal128(pouchReconciliation.returned),
      }] : [],
      labor: decimal128(costing.laborCost), utilities: decimal128(costing.utilitiesCost),
      materialCost: decimal128(costing.materialCost), totalCost: decimal128(costing.totalCost), costPerPacket: decimal128(costing.unitCost),
      supervisor: req.user.name, sellingPrice: decimal128(costing.selling),
      profitPerPacket: decimal128(costing.profitPerPacket), profitMargin: decimal128(costing.profitMargin),
    });
    await Movement.create({ item: finishedUpdated.id, itemName: finishedUpdated.name, unit: finishedUpdated.unit, type: 'Production output', quantity: decimal128(goodOutput), balanceAfter: finishedUpdated.balance, reference: `RUN-${run.id}`, user: req.user.name });
    await audit(req, 'ProductionRun', run.id, 'create', null, run.toObject());
    respond(res, run, 201);
  } catch (error) { fail(res, error); }
});

app.post('/api/purchases', allow('Factory Admin', 'Owner'), async (req, res) => {
  try {
    const { supplierName, itemName } = req.body;
    const quantity = parseDecimal(req.body.quantity), unitRateInput = parseDecimal(req.body.unitRate);
    if (!supplierName || !itemName || !quantity || quantity.lte(0) || !unitRateInput || unitRateInput.isNegative()) return res.status(400).json({ message: 'Enter supplier, material, positive quantity and a valid purchase rate.' });
    const unitRate = money(unitRateInput);
    if (!await Supplier.exists({ name: supplierName })) return res.status(400).json({ message: 'Choose a configured supplier.' });
    const item = await Inventory.findOne({ name: itemName });
    if (!item || item.category === 'Finished goods') return res.status(400).json({ message: 'Choose a configured raw or packaging inventory item.' });
    const total = extendedCost(unitRate, quantity);
    const newBalance = decimal(item.balance).plus(quantity);
    const averageRate = weightedAverageRate(item.balance, item.averageRate, quantity, unitRate);
    const received = await Inventory.findOneAndUpdate(
      { _id: item.id, balance: item.balance, averageRate: item.averageRate },
      { $set: { balance: decimal128(newBalance), averageRate: decimal128(averageRate) } }, { new: true },
    );
    if (!received) return res.status(409).json({ message: 'Inventory changed during purchase entry. Refresh and retry.' });
    const purchase = await Purchase.create({ supplierName, itemName, quantity: decimal128(quantity), unitRate: decimal128(unitRate), total: decimal128(total), date: new Date(), user: req.user.name });
    await Movement.create({ item: item.id, itemName, unit: item.unit, type: 'Purchase receipt', quantity: decimal128(quantity), balanceAfter: received.balance, unitRate: decimal128(unitRate), reference: `PURCHASE-${purchase.id}`, user: req.user.name });
    respond(res, purchase, 201);
  } catch (error) { fail(res, error); }
});
app.post('/api/suppliers', allow('Factory Admin', 'Owner'), async (req, res) => {
  try {
    if (!String(req.body.name || '').trim()) return res.status(400).json({ message: 'Supplier name is required.' });
    respond(res, await Supplier.create({ ...req.body, createdBy: req.user.name }), 201);
  } catch (error) { fail(res, error); }
});
app.post('/api/inventory/:id/adjustments', allow('Factory Admin', 'Owner'), async (req, res) => {
  try {
    const delta = parseDecimal(req.body.delta);
    const reason = String(req.body.reason || '').trim();
    if (!delta || delta.isZero() || !reason) {
      return res.status(400).json({ message: 'Enter a non-zero adjustment quantity and its reason.' });
    }
    const item = await Inventory.findOneAndUpdate(
      { _id: req.params.id, ...(delta.isNegative() ? { balance: { $gte: decimal128(delta.abs()) } } : {}) },
      [{ $set: { balance: { $add: ['$balance', decimal128(delta)] } } }], { new: true },
    );
    if (!item) {
      const exists = await Inventory.exists({ _id: req.params.id });
      return res.status(exists ? 409 : 404).json({ message: exists ? 'Adjustment would reduce stock below zero.' : 'Inventory item not found.' });
    }
    const reference = `ADJ-${new mongoose.Types.ObjectId()}`;
    const movement = await Movement.create({
      item: item.id, itemName: item.name, unit: item.unit, type: 'Stock adjustment', quantity: decimal128(delta),
      balanceAfter: item.balance, reference, note: reason, user: req.user.name,
    });
    respond(res, movement, 201);
  } catch (error) { fail(res, error); }
});
app.post('/api/payments', allow('Factory Admin', 'Owner'), async (req, res) => {
  try {
    const amountInput = parseDecimal(req.body.amount);
    if (!amountInput || amountInput.lte(0)) return res.status(400).json({ message: 'Choose an invoice and enter a positive payment amount.' });
    const amount = money(amountInput);
    const invoice = await Invoice.findOneAndUpdate(
      { _id: req.body.invoiceId, $expr: { $gte: [{ $subtract: ['$total', '$paid'] }, decimal128(amount)] } },
      [
        { $set: { paid: { $add: ['$paid', decimal128(amount)] } } },
        { $set: { status: { $cond: [{ $gte: ['$paid', '$total'] }, 'Paid', 'Part-paid'] } } },
      ], { new: true },
    );
    if (!invoice) {
      const exists = await Invoice.exists({ _id: req.body.invoiceId });
      return res.status(exists ? 400 : 404).json({ message: exists ? 'Payment exceeds the invoice outstanding balance.' : 'Invoice not found.' });
    }
    const payment = await Payment.create({ invoice: invoice.id, invoiceNumber: invoice.number, customerName: invoice.customerName, amount: decimal128(amount), method: req.body.method || 'Bank transfer', date: new Date(), reference: req.body.reference || '', user: req.user.name });
    respond(res, { payment, invoice }, 201);
  } catch (error) { fail(res, error); }
});
app.get('/api/reports', allow('Accountant / Auditor', 'Owner'), async (req, res) => {
  try {
    const from = req.query.from ? new Date(req.query.from) : new Date(0);
    const to = req.query.to ? new Date(`${req.query.to}T23:59:59.999`) : new Date();
    if (Number.isNaN(from.valueOf()) || Number.isNaN(to.valueOf())) return res.status(400).json({ message: 'Use valid from and to dates.' });
    const [invoices, purchases, production, payments, movements] = await Promise.all([
      Invoice.find({ createdAt: { $gte: from, $lte: to } }).lean(), Purchase.find({ date: { $gte: from, $lte: to } }).lean(),
      Production.find({ createdAt: { $gte: from, $lte: to } }).lean(), Payment.find({ date: { $gte: from, $lte: to } }).lean(),
      Movement.find({ createdAt: { $gte: from, $lte: to } }).lean(),
    ]);
    const now = new Date();
    const ageing = { '0-30': decimal(0), '31-60': decimal(0), '61-90': decimal(0), '90+': decimal(0) };
    for (const invoice of invoices) {
      const outstanding = decimal(invoice.total).minus(invoice.paid).max(0);
      if (outstanding.isZero()) continue;
      const days = Math.max(0, Math.floor((now - new Date(invoice.createdAt)) / 86400000));
      const bucket = days <= 30 ? '0-30' : days <= 60 ? '31-60' : days <= 90 ? '61-90' : '90+';
      ageing[bucket] = ageing[bucket].plus(outstanding);
    }
    respond(res, {
      invoices, purchases, production, payments, movements,
      gstSummary: {
        gstr1B2BTaxable: sumMoney(invoices.map((invoice) => invoice.taxable)),
        gstr1B2BGst: sumMoney(invoices.map((invoice) => decimal(invoice.cgst).plus(invoice.sgst).plus(invoice.igst))),
        gstr3bCgst: sumMoney(invoices.map((invoice) => invoice.cgst)),
        gstr3bSgst: sumMoney(invoices.map((invoice) => invoice.sgst)),
        gstr3bIgst: sumMoney(invoices.map((invoice) => invoice.igst)),
      },
      receivablesAgeing: ageing,
    });
  } catch (error) { fail(res, error); }
});
app.get('/api/audit', allow('Accountant / Auditor', 'Owner'), async (_req, res) => {
  try {
    const [movements, orders, invoices, production, payments, purchases] = await Promise.all([
      Movement.find().sort({ createdAt: -1 }).limit(250).lean(), Order.find().sort({ updatedAt: -1 }).limit(100).lean(),
      Invoice.find().sort({ createdAt: -1 }).limit(100).lean(), Production.find().sort({ createdAt: -1 }).limit(100).lean(),
      Payment.find().sort({ date: -1 }).limit(100).lean(), Purchase.find().sort({ date: -1 }).limit(100).lean(),
    ]);
    respond(res, { movements, orders, invoices, production, payments, purchases });
  } catch (error) { fail(res, error); }
});
app.use((error, _req, res, _next) => fail(res, error));

const port = Number(process.env.PORT || 4000);
await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/smartfactory_erp');
app.listen(port, () => console.log(`SmartFactory API listening on http://localhost:${port}`));
