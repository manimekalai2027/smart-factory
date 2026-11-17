import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

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
const User = mongoose.model('User', schema({
  name: { type: String, required: true }, email: { type: String, unique: true, required: true },
  password: { type: String, required: true }, role: { type: String, required: true },
}));
const Product = mongoose.model('Product', schema({
  name: { type: String, required: true }, sku: { type: String, unique: true },
  category: { type: String, default: 'Finished goods' }, packSize: String, hsn: String,
  price: { type: Number, required: true }, gstRate: { type: Number, default: 5 },
  bom: [{ itemName: String, quantity: Number, unit: String }],
}));
const Customer = mongoose.model('Customer', schema({
  name: { type: String, required: true }, type: String, state: String, gstin: String,
  address: String, phone: String,
}));
const Inventory = mongoose.model('Inventory', schema({
  name: { type: String, unique: true, required: true }, category: String, unit: String,
  openingStock: { type: Number, default: 0 }, balance: { type: Number, default: 0 },
  reorderLevel: { type: Number, default: 0 }, averageRate: { type: Number, default: 0 },
}));
const Movement = mongoose.model('Movement', schema({
  item: { type: mongoose.Schema.Types.ObjectId, ref: 'Inventory', required: true },
  itemName: String, type: String, quantity: Number, balanceAfter: Number,
  unitRate: Number, reference: String, note: String, user: String,
}));
const Order = mongoose.model('Order', schema({
  customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' }, customerName: String,
  customerAddress: String, customerState: String, customerGstin: String, salesperson: String,
  reviewedBy: String, reviewedAt: Date, dispatchedBy: String, dispatchedAt: Date,
  reviewChanges: [{ lineIndex: Number, productName: String, quantityBefore: Number, quantityAfter: Number, priceBefore: Number, priceAfter: Number }],
  lines: [{ product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' }, productName: String, quantity: Number, price: Number, hsn: String, gstRate: Number }],
  status: { type: String, default: 'Submitted' }, total: Number, shortage: Number, note: String,
}));
const Invoice = mongoose.model('Invoice', schema({
  number: { type: String, unique: true }, order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', unique: true },
  customerName: String, customerAddress: String, customerState: String, customerGstin: String, createdBy: String,
  lines: [{ productName: String, quantity: Number, price: Number, hsn: String, gstRate: Number, taxable: Number, cgst: Number, sgst: Number, igst: Number, total: Number }],
  taxable: Number, cgst: Number, sgst: Number, igst: Number, total: Number,
  paid: { type: Number, default: 0 }, status: { type: String, default: 'Unpaid' },
}));
const Production = mongoose.model('Production', schema({
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' }, productName: String,
  plannedOutput: Number, goodOutput: Number, damaged: Number, yieldVariance: Number,
  consumption: [{ itemName: String, planned: Number, actual: Number, unit: String, variance: Number }],
  labor: Number, utilities: Number, materialCost: Number, totalCost: Number, costPerPacket: Number,
  sellingPrice: Number, profitPerPacket: Number, profitMargin: Number,
  supervisor: String,
}));
const Supplier = mongoose.model('Supplier', schema({
  name: { type: String, unique: true }, gstin: String, state: String, phone: String, address: String, createdBy: String,
}));
const Purchase = mongoose.model('Purchase', schema({
  supplierName: String, itemName: String, quantity: Number, unitRate: Number, total: Number, date: Date, user: String,
}));
const Payment = mongoose.model('Payment', schema({
  invoice: { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice' }, invoiceNumber: String,
  customerName: String, amount: Number, method: String, date: Date, reference: String, user: String,
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
const money = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
const round = (value, places = 3) => Number(Number(value).toFixed(places));
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
    const outstanding = visibleInvoices.reduce((sum, i) => sum + Math.max(0, i.total - i.paid), 0);
    const alerts = visibleInventory.filter((i) => i.balance <= i.reorderLevel && i.reorderLevel > 0);
    const shortageOrders = visibleOrders.filter((o) => o.shortage > 0 && o.status !== 'Rejected');
    res.json({
      user: req.user, products: visibleProducts, customers: visibleCustomers, inventory: visibleInventory,
      orders: visibleOrders, invoices: visibleInvoices, suppliers: visibleSuppliers, production: visibleProduction,
      payments: visiblePayments, movements: visibleMovements, purchases: visiblePurchases,
      metrics: {
        todayOrders: todayOrders.length,
        todaySales: money(visibleInvoices.filter((i) => new Date(i.createdAt) >= today).reduce((s, i) => s + i.total, 0)),
        totalSales: money(visibleInvoices.reduce((s, i) => s + i.total, 0)),
        rawMaterialLines: visibleInventory.filter((i) => i.category === 'Raw materials').length,
        rawMaterialValue: money(visibleInventory.filter((i) => i.category === 'Raw materials').reduce((s, i) => s + i.balance * i.averageRate, 0)),
        pendingOrders: visibleOrders.filter((o) => o.status === 'Submitted').length,
        productionToday: visibleProduction.filter((p) => new Date(p.createdAt) >= today).reduce((s, p) => s + p.goodOutput, 0),
        outstanding: money(outstanding), lowStock: alerts.length, varianceAlerts: visibleProduction.filter((p) => p.consumption.some((c) => Math.abs(c.variance) > 3) || p.yieldVariance < -3).length,
        finishedGoods: visibleInventory.filter((i) => i.category === 'Finished goods').reduce((s, i) => s + i.balance, 0),
        rawStockLines: visibleInventory.filter((i) => i.category !== 'Finished goods').length,
        avgCost: visibleProduction[0]?.costPerPacket || 0, shortages: shortageOrders.length,
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
      lines.push({ product: product.id, productName: product.name, quantity, price: money(product.price), hsn: product.hsn, gstRate: product.gstRate });
    }
    const order = await Order.create({
      customer: customer.id, customerName: customer.name, customerAddress: customer.address, customerState: customer.state, customerGstin: customer.gstin,
      salesperson: req.user.name, lines, status: 'Submitted', total: money(lines.reduce((s, l) => s + l.quantity * l.price * (1 + l.gstRate / 100), 0)),
    });
    res.status(201).json(order);
  } catch (error) { fail(res, error); }
});
app.patch('/api/orders/:id/review', allow('Factory Admin', 'Owner'), async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order || order.status !== 'Submitted') return res.status(400).json({ message: 'Only submitted orders can be reviewed.' });
    if (req.body.action === 'reject') {
      order.status = 'Rejected'; order.note = String(req.body.note || 'Rejected by admin');
      order.reviewedBy = req.user.name; order.reviewedAt = new Date();
      await order.save(); return res.json(order);
    }
    if (req.body.lines) {
      if (!Array.isArray(req.body.lines) || req.body.lines.length !== order.lines.length) return res.status(400).json({ message: 'Order line count cannot be changed during review.' });
      const updates = req.body.lines.map((line) => ({ quantity: Number(line.quantity), price: Number(line.price) }));
      if (updates.some((line) => !Number.isInteger(line.quantity) || line.quantity <= 0 || !Number.isFinite(line.price) || line.price < 0)) {
        return res.status(400).json({ message: 'Review requires positive whole quantities and non-negative prices.' });
      }
      const changes = updates.map((update, index) => ({
        lineIndex: index, productName: order.lines[index].productName,
        quantityBefore: order.lines[index].quantity, quantityAfter: update.quantity,
        priceBefore: order.lines[index].price, priceAfter: money(update.price),
      })).filter((change) => change.quantityBefore !== change.quantityAfter || change.priceBefore !== change.priceAfter);
      order.reviewChanges.push(...changes);
      order.lines.forEach((line, index) => {
        line.quantity = updates[index].quantity; line.price = money(updates[index].price);
      });
    }
    order.total = money(order.lines.reduce((s, l) => s + l.quantity * l.price * (1 + l.gstRate / 100), 0));
    const needs = new Map();
    for (const line of order.lines) needs.set(line.productName, (needs.get(line.productName) || 0) + line.quantity);
    const stocks = await Inventory.find({ category: 'Finished goods' });
    const shortage = [...needs].reduce((s, [name, qty]) => s + Math.max(0, qty - (stocks.find((i) => i.name === name)?.balance || 0)), 0);
    order.shortage = shortage;
    if (req.body.action === 'approve' && shortage) {
      await order.save();
      return res.status(409).json({ message: `Insufficient finished goods: ${shortage} packet(s) short. Order remains submitted.`, order });
    }
    if (req.body.action !== 'approve') return res.status(400).json({ message: 'Choose approve or reject.' });
    order.status = 'Approved'; order.reviewedBy = req.user.name; order.reviewedAt = new Date();
    await order.save(); res.json(order);
  } catch (error) { fail(res, error); }
});
app.post('/api/orders/:id/invoice', allow('Factory Admin', 'Owner'), async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order || !['Approved', 'Invoiced'].includes(order.status)) return res.status(400).json({ message: 'Approve the order before invoicing.' });
    const exists = await Invoice.findOne({ order: order.id });
    if (exists) return res.status(409).json({ message: `Invoice ${exists.number} already exists.`, invoice: exists });
    let taxable = 0, cgst = 0, sgst = 0, igst = 0;
    const interstate = order.customerState && order.customerState.toLowerCase() !== 'tamil nadu';
    const lines = order.lines.map((l) => {
      const lineTaxable = money(l.quantity * l.price);
      const tax = money(lineTaxable * l.gstRate / 100);
      const lineCgst = interstate ? 0 : money(tax / 2);
      const lineSgst = interstate ? 0 : money(tax - lineCgst);
      const line = { productName: l.productName, quantity: l.quantity, price: l.price, hsn: l.hsn, gstRate: l.gstRate, taxable: lineTaxable, cgst: lineCgst, sgst: lineSgst, igst: interstate ? tax : 0, total: money(lineTaxable + tax) };
      taxable += lineTaxable; cgst += line.cgst; sgst += line.sgst; igst += line.igst; return line;
    });
    const invoice = await Invoice.create({
      number: `SF-${new Date().getFullYear()}-${String(await Invoice.countDocuments() + 1).padStart(4, '0')}`,
      order: order.id, customerName: order.customerName, customerAddress: order.customerAddress, customerState: order.customerState, customerGstin: order.customerGstin, createdBy: req.user.name,
      lines, taxable: money(taxable), cgst: money(cgst), sgst: money(sgst), igst: money(igst), total: money(taxable + cgst + sgst + igst),
    });
    order.status = 'Invoiced'; await order.save(); res.status(201).json(invoice);
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
        [{ $set: { balance: { $round: [{ $subtract: ['$balance', line.quantity] }, 3] } } }], { new: true },
      );
      if (!stock) {
        for (const item of changed) {
          const restored = await Inventory.findByIdAndUpdate(item.stock.id, { $inc: { balance: item.quantity } }, { new: true });
          await Movement.create({ item: item.stock.id, itemName: item.stock.name, type: 'Dispatch reversal', quantity: item.quantity, balanceAfter: restored.balance, reference: `ROLLBACK-${order.id}`, user: req.user.name });
        }
        dispatchOrder.status = 'Invoiced'; await dispatchOrder.save();
        return res.status(409).json({ message: `Insufficient stock to dispatch ${line.productName}.` });
      }
      changed.push({ stock, quantity: line.quantity });
      await Movement.create({ item: stock.id, itemName: stock.name, type: 'Sales dispatch', quantity: -line.quantity, balanceAfter: stock.balance, reference: `ORDER-${order.id}`, user: req.user.name });
    }
    dispatchOrder.status = 'Dispatched'; dispatchOrder.dispatchedBy = req.user.name; dispatchOrder.dispatchedAt = new Date();
    await dispatchOrder.save(); res.json({ order: dispatchOrder, invoice });
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
    const consumption = product.bom.map((bom) => {
      const planned = round(bom.quantity * batches);
      const actual = round(Number(actualValues[bom.itemName] ?? planned));
      return { itemName: bom.itemName, planned, actual, unit: bom.unit, variance: planned === 0 ? 0 : round((actual - planned) / planned * 100, 2) };
    });
    if (consumption.some((line) => !Number.isFinite(line.actual) || line.actual < 0)) {
      return res.status(400).json({ message: 'Actual consumption must be a non-negative number for each BOM material.' });
    }
    const labor = money(Number(req.body.labor || 0)), utilities = money(Number(req.body.utilities || 0));
    if (!Number.isFinite(labor) || labor < 0 || !Number.isFinite(utilities) || utilities < 0) {
      return res.status(400).json({ message: 'Production expenses must be valid non-negative amounts.' });
    }
    const finished = await Inventory.findOne({ name: product.name, category: 'Finished goods' });
    if (!finished) return res.status(400).json({ message: `Finished goods inventory for ${product.name} is not configured.` });
    const runId = new mongoose.Types.ObjectId();
    const movements = [];
    for (const line of consumption) {
      const current = await Inventory.findOne({ name: line.itemName });
      const stock = current && await Inventory.findOneAndUpdate(
        { _id: current.id, balance: { $gte: line.actual } },
        [{ $set: { balance: { $round: [{ $subtract: ['$balance', line.actual] }, 3] } } }], { new: true },
      );
      if (!stock) {
        for (const prior of movements) {
          const restored = await Inventory.findByIdAndUpdate(prior.stock.id, { $inc: { balance: prior.qty } }, { new: true });
          await Movement.create({ item: prior.stock.id, itemName: prior.stock.name, type: 'Production reversal', quantity: prior.qty, balanceAfter: restored.balance, reference: `ROLLBACK-${runId}`, user: req.user.name });
        }
        return res.status(409).json({ message: `Insufficient ${line.itemName} stock. Available: ${current?.balance ?? 0} ${line.unit}; required: ${line.actual} ${line.unit}.` });
      }
      movements.push({ stock, qty: line.actual });
      await Movement.create({ item: stock.id, itemName: stock.name, type: 'Production issue', quantity: -line.actual, balanceAfter: stock.balance, reference: `RUN-${runId}`, user: req.user.name });
    }
    const materialCost = money(consumption.reduce((sum, line) => sum + line.actual * (movements.find((m) => m.stock.name === line.itemName)?.stock.averageRate || 0), 0));
    const totalCost = money(materialCost + labor + utilities);
    const costPerPacket = goodOutput ? money(totalCost / goodOutput) : 0;
    const finishedUpdated = await Inventory.findOneAndUpdate(
      { _id: finished.id },
      [{ $set: {
        balance: { $round: [{ $add: ['$balance', goodOutput] }, 3] },
        averageRate: { $cond: [
          { $gt: [{ $add: ['$balance', goodOutput] }, 0] },
          goodOutput > 0
            ? { $round: [{ $divide: [{ $add: [{ $multiply: ['$balance', '$averageRate'] }, totalCost] }, { $add: ['$balance', goodOutput] }] }, 2] }
            : '$averageRate',
          0,
        ] },
      } }], { new: true },
    );
    const run = await Production.create({
      _id: runId,
      product: product.id, productName: product.name, plannedOutput, goodOutput, damaged,
      yieldVariance: plannedOutput ? round((goodOutput - plannedOutput) / plannedOutput * 100, 2) : 0,
      consumption, labor, utilities, materialCost, totalCost, costPerPacket, supervisor: req.user.name,
      sellingPrice: product.price,
      profitPerPacket: goodOutput ? money(product.price - costPerPacket) : 0,
      profitMargin: goodOutput && product.price ? money((product.price - costPerPacket) / product.price * 100) : 0,
    });
    await Movement.create({ item: finishedUpdated.id, itemName: finishedUpdated.name, type: 'Production output', quantity: goodOutput, balanceAfter: finishedUpdated.balance, reference: `RUN-${run.id}`, user: req.user.name });
    res.status(201).json(run);
  } catch (error) { fail(res, error); }
});

app.post('/api/purchases', allow('Factory Admin', 'Owner'), async (req, res) => {
  try {
    const { supplierName, itemName } = req.body;
    const quantity = round(Number(req.body.quantity)), unitRate = money(Number(req.body.unitRate));
    if (!supplierName || !itemName || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(unitRate) || unitRate < 0) return res.status(400).json({ message: 'Enter supplier, material, positive quantity and a valid purchase rate.' });
    if (!await Supplier.exists({ name: supplierName })) return res.status(400).json({ message: 'Choose a configured supplier.' });
    const item = await Inventory.findOne({ name: itemName });
    if (!item || item.category === 'Finished goods') return res.status(400).json({ message: 'Choose a configured raw or packaging inventory item.' });
    const total = money(quantity * unitRate);
    const received = await Inventory.findOneAndUpdate(
      { _id: item.id },
      [{ $set: {
        balance: { $round: [{ $add: ['$balance', quantity] }, 3] },
        averageRate: { $cond: [
          { $gt: [{ $add: ['$balance', quantity] }, 0] },
          { $round: [{ $divide: [{ $add: [{ $multiply: ['$balance', '$averageRate'] }, total] }, { $add: ['$balance', quantity] }] }, 2] },
          unitRate,
        ] },
      } }], { new: true },
    );
    const purchase = await Purchase.create({ supplierName, itemName, quantity, unitRate, total, date: new Date(), user: req.user.name });
    await Movement.create({ item: item.id, itemName, type: 'Purchase receipt', quantity, balanceAfter: received.balance, unitRate, reference: `PURCHASE-${purchase.id}`, user: req.user.name });
    res.status(201).json(purchase);
  } catch (error) { fail(res, error); }
});
app.post('/api/suppliers', allow('Factory Admin', 'Owner'), async (req, res) => {
  try {
    if (!String(req.body.name || '').trim()) return res.status(400).json({ message: 'Supplier name is required.' });
    res.status(201).json(await Supplier.create({ ...req.body, createdBy: req.user.name }));
  } catch (error) { fail(res, error); }
});
app.post('/api/inventory/:id/adjustments', allow('Factory Admin', 'Owner'), async (req, res) => {
  try {
    const delta = round(Number(req.body.delta));
    const reason = String(req.body.reason || '').trim();
    if (!Number.isFinite(delta) || delta === 0 || !reason) {
      return res.status(400).json({ message: 'Enter a non-zero adjustment quantity and its reason.' });
    }
    const item = await Inventory.findOneAndUpdate(
      { _id: req.params.id, ...(delta < 0 ? { balance: { $gte: Math.abs(delta) } } : {}) },
      [{ $set: { balance: { $round: [{ $add: ['$balance', delta] }, 3] } } }], { new: true },
    );
    if (!item) {
      const exists = await Inventory.exists({ _id: req.params.id });
      return res.status(exists ? 409 : 404).json({ message: exists ? 'Adjustment would reduce stock below zero.' : 'Inventory item not found.' });
    }
    const reference = `ADJ-${new mongoose.Types.ObjectId()}`;
    const movement = await Movement.create({
      item: item.id, itemName: item.name, type: 'Stock adjustment', quantity: round(delta),
      balanceAfter: item.balance, reference, note: reason, user: req.user.name,
    });
    res.status(201).json(movement);
  } catch (error) { fail(res, error); }
});
app.post('/api/payments', allow('Factory Admin', 'Owner'), async (req, res) => {
  try {
    const amount = money(Number(req.body.amount));
    if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ message: 'Choose an invoice and enter a positive payment amount.' });
    const invoice = await Invoice.findOneAndUpdate(
      { _id: req.body.invoiceId, $expr: { $gte: [{ $subtract: ['$total', '$paid'] }, amount] } },
      [
        { $set: { paid: { $round: [{ $add: ['$paid', amount] }, 2] } } },
        { $set: { status: { $cond: [{ $gte: ['$paid', '$total'] }, 'Paid', 'Part-paid'] } } },
      ], { new: true },
    );
    if (!invoice) {
      const exists = await Invoice.exists({ _id: req.body.invoiceId });
      return res.status(exists ? 400 : 404).json({ message: exists ? 'Payment exceeds the invoice outstanding balance.' : 'Invoice not found.' });
    }
    const payment = await Payment.create({ invoice: invoice.id, invoiceNumber: invoice.number, customerName: invoice.customerName, amount, method: req.body.method || 'Bank transfer', date: new Date(), reference: req.body.reference || '', user: req.user.name });
    res.status(201).json({ payment, invoice });
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
    res.json({ invoices, purchases, production, payments, movements });
  } catch (error) { fail(res, error); }
});
app.get('/api/audit', allow('Accountant / Auditor', 'Owner'), async (_req, res) => {
  try {
    const [movements, orders, invoices, production, payments, purchases] = await Promise.all([
      Movement.find().sort({ createdAt: -1 }).limit(250).lean(), Order.find().sort({ updatedAt: -1 }).limit(100).lean(),
      Invoice.find().sort({ createdAt: -1 }).limit(100).lean(), Production.find().sort({ createdAt: -1 }).limit(100).lean(),
      Payment.find().sort({ date: -1 }).limit(100).lean(), Purchase.find().sort({ date: -1 }).limit(100).lean(),
    ]);
    res.json({ movements, orders, invoices, production, payments, purchases });
  } catch (error) { fail(res, error); }
});
app.use((error, _req, res, _next) => fail(res, error));

const port = Number(process.env.PORT || 4000);
await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/smartfactory_erp');
app.listen(port, () => console.log(`SmartFactory API listening on http://localhost:${port}`));
