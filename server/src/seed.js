import 'dotenv/config';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const schema = (definition) => new mongoose.Schema(definition, { timestamps: true });
const User = mongoose.model('User', schema({ name: String, email: { type: String, unique: true }, password: String, role: String }));
const Product = mongoose.model('Product', schema({ name: String, sku: String, category: String, packSize: String, hsn: String, price: Number, gstRate: Number, bom: [{ itemName: String, quantity: Number, unit: String }] }));
const Customer = mongoose.model('Customer', schema({ name: String, type: String, state: String, gstin: String, address: String, phone: String }));
const Inventory = mongoose.model('Inventory', schema({ name: String, category: String, unit: String, openingStock: Number, balance: Number, reorderLevel: Number, averageRate: Number }));
const Movement = mongoose.model('Movement', schema({ item: mongoose.Schema.Types.ObjectId, itemName: String, type: String, quantity: Number, balanceAfter: Number, unitRate: Number, reference: String, note: String, user: String }));
const Supplier = mongoose.model('Supplier', schema({ name: { type: String, unique: true }, gstin: String, state: String, phone: String, address: String, createdBy: String }));
const Purchase = mongoose.model('Purchase', schema({ supplierName: String, itemName: String, quantity: Number, unitRate: Number, total: Number, date: Date, user: String }));
const Production = mongoose.model('Production', schema({ product: mongoose.Schema.Types.ObjectId, productName: String, plannedOutput: Number, goodOutput: Number, damaged: Number, yieldVariance: Number, consumption: [{ itemName: String, planned: Number, actual: Number, unit: String, variance: Number }], labor: Number, utilities: Number, materialCost: Number, totalCost: Number, costPerPacket: Number, sellingPrice: Number, profitPerPacket: Number, profitMargin: Number, supervisor: String }));
const Order = mongoose.model('Order', schema({ customer: mongoose.Schema.Types.ObjectId, customerName: String, customerAddress: String, customerState: String, customerGstin: String, salesperson: String, reviewedBy: String, reviewedAt: Date, dispatchedBy: String, dispatchedAt: Date, reviewChanges: [{ lineIndex: Number, productName: String, quantityBefore: Number, quantityAfter: Number, priceBefore: Number, priceAfter: Number }], lines: [{ product: mongoose.Schema.Types.ObjectId, productName: String, quantity: Number, price: Number, hsn: String, gstRate: Number }], status: String, total: Number, shortage: Number, note: String }));
const Invoice = mongoose.model('Invoice', schema({ number: String, order: { type: mongoose.Schema.Types.ObjectId, unique: true }, customerName: String, customerAddress: String, customerState: String, customerGstin: String, createdBy: String, lines: [{ productName: String, quantity: Number, price: Number, hsn: String, gstRate: Number, taxable: Number, cgst: Number, sgst: Number, igst: Number, total: Number }], taxable: Number, cgst: Number, sgst: Number, igst: Number, total: Number, paid: Number, status: String }));
const Payment = mongoose.model('Payment', schema({ invoice: mongoose.Schema.Types.ObjectId, invoiceNumber: String, customerName: String, amount: Number, method: String, date: Date, reference: String, user: String }));

await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/smartfactory_erp');
await Promise.all([User, Product, Customer, Inventory, Movement, Supplier, Purchase, Production, Order, Invoice, Payment].map((model) => model.deleteMany({})));

const roles = [
  ['sales@smartfactory.local', 'Salesman', 'Arun Sales'],
  ['admin@smartfactory.local', 'Factory Admin', 'Meena Admin'],
  ['production@smartfactory.local', 'Production Supervisor', 'Kumar Production'],
  ['accounts@smartfactory.local', 'Accountant / Auditor', 'Priya Accounts'],
  ['owner@smartfactory.local', 'Owner', 'R. Srinivasan'],
];
const password = await bcrypt.hash('Factory@123', 10);
await User.insertMany(roles.map(([email, role, name]) => ({ email, role, name, password })));

const products = await Product.insertMany([
  { name: 'Murukku 200 g', sku: 'MUR-200', category: 'Finished goods', packSize: '200 g', hsn: '19059030', price: 50, gstRate: 5, bom: [
    { itemName: 'Flour', quantity: 40, unit: 'kg' }, { itemName: 'Cooking Oil', quantity: 10, unit: 'L' }, { itemName: 'Spice Mix', quantity: 1.2, unit: 'kg' }, { itemName: 'Pouches', quantity: 200, unit: 'pcs' }, { itemName: 'Cartons', quantity: 10, unit: 'pcs' },
  ] },
  { name: 'Mixture 200 g', sku: 'MIX-200', category: 'Finished goods', packSize: '200 g', hsn: '21069099', price: 55, gstRate: 5, bom: [
    { itemName: 'Flour', quantity: 30, unit: 'kg' }, { itemName: 'Cooking Oil', quantity: 12, unit: 'L' }, { itemName: 'Spice Mix', quantity: 2, unit: 'kg' }, { itemName: 'Pouches', quantity: 200, unit: 'pcs' }, { itemName: 'Cartons', quantity: 10, unit: 'pcs' },
  ] },
  { name: 'Potato Chips 100 g', sku: 'CHP-100', category: 'Finished goods', packSize: '100 g', hsn: '20052000', price: 30, gstRate: 5, bom: [
    { itemName: 'Cooking Oil', quantity: 8, unit: 'L' }, { itemName: 'Spice Mix', quantity: 0.8, unit: 'kg' }, { itemName: 'Pouches', quantity: 200, unit: 'pcs' }, { itemName: 'Cartons', quantity: 8, unit: 'pcs' },
  ] },
  { name: 'Assorted Sweets 250 g', sku: 'SWT-250', category: 'Finished goods', packSize: '250 g', hsn: '17049090', price: 90, gstRate: 5, bom: [
    { itemName: 'Flour', quantity: 20, unit: 'kg' }, { itemName: 'Cooking Oil', quantity: 5, unit: 'L' }, { itemName: 'Spice Mix', quantity: 0.5, unit: 'kg' }, { itemName: 'Pouches', quantity: 200, unit: 'pcs' }, { itemName: 'Cartons', quantity: 12, unit: 'pcs' },
  ] },
]);
const stockSeed = [
  ['Flour', 'Raw materials', 'kg', 100, 0, 45, 50],
  ['Cooking Oil', 'Raw materials', 'L', 30, 0, 110, 10],
  ['Spice Mix', 'Raw materials', 'kg', 5, 0, 180, 2],
  ['Pouches', 'Packaging materials', 'pcs', 500, 0, 1.5, 100],
  ['Cartons', 'Packaging materials', 'pcs', 30, 0, 18, 10],
  ['Murukku 200 g', 'Finished goods', 'packets', 50, 0, 0, 40],
  ['Mixture 200 g', 'Finished goods', 'packets', 0, 0, 0, 20],
  ['Potato Chips 100 g', 'Finished goods', 'packets', 0, 0, 0, 20],
  ['Assorted Sweets 250 g', 'Finished goods', 'packets', 0, 0, 0, 10],
];
const stocks = await Inventory.insertMany(stockSeed.map(([name, category, unit, openingStock, balance, averageRate, reorderLevel]) => ({ name, category, unit, openingStock, balance: openingStock + balance, averageRate, reorderLevel })));
for (const item of stocks) await Movement.create({ item: item.id, itemName: item.name, type: 'Opening balance', quantity: item.openingStock, balanceAfter: item.openingStock, unitRate: item.averageRate, reference: `OPENING-${item.name.toUpperCase().replace(/\W+/g, '-')}`, user: 'System' });
const customers = await Customer.insertMany([
  { name: 'Retailer A', type: 'Retailer', state: 'Tamil Nadu', gstin: '33AABCU9603R1ZM', address: '12 Market Road, Coimbatore, Tamil Nadu', phone: '+91 98400 10001' },
  { name: 'Distributor B', type: 'Distributor', state: 'Karnataka', gstin: '29AABCU9603R1ZQ', address: '44 Wholesale Market, Bengaluru, Karnataka', phone: '+91 98400 10002' },
  { name: 'Retailer C', type: 'Retailer', state: 'Tamil Nadu', gstin: '33AABCU9603R1ZN', address: '8 Bazaar Street, Madurai, Tamil Nadu', phone: '+91 98400 10003' },
]);
const supplier = await Supplier.create({ name: 'Sri Lakshmi Flour Mills', gstin: '33AABFS1234D1ZA', state: 'Tamil Nadu', phone: '+91 422 221 1000', address: 'Coimbatore, Tamil Nadu' });
const flour = stocks.find((item) => item.name === 'Flour');
flour.balance = 160; flour.averageRate = 45; await flour.save();
const purchase = await Purchase.create({ supplierName: supplier.name, itemName: 'Flour', quantity: 60, unitRate: 45, total: 2700, date: new Date(), user: 'System' });
await Movement.create({ item: flour.id, itemName: 'Flour', type: 'Purchase receipt', quantity: 60, balanceAfter: 160, unitRate: 45, reference: `PURCHASE-${purchase.id}`, user: 'System' });
const actuals = [
  ['Flour', 40, 40, 'kg', 0], ['Cooking Oil', 10, 10.5, 'L', 5],
  ['Spice Mix', 1.2, 1.2, 'kg', 0], ['Pouches', 200, 194, 'pcs', -3],
  ['Cartons', 10, 9, 'pcs', -10],
];
const murukku = products.find((item) => item.name === 'Murukku 200 g');
const production = await Production.create({
  product: murukku.id, productName: murukku.name, plannedOutput: 200, goodOutput: 188, damaged: 6,
  yieldVariance: -6, consumption: actuals.map(([itemName, planned, actual, unit, variance]) => ({ itemName, planned, actual, unit, variance })),
  labor: 1200, utilities: 600, materialCost: 3624, totalCost: 5424, costPerPacket: 28.85, supervisor: 'Kumar Production',
  sellingPrice: 50, profitPerPacket: 21.15, profitMargin: 42.3,
});
for (const [name, planned, actual] of actuals) {
  const item = stocks.find((candidate) => candidate.name === name);
  item.balance -= actual; await item.save();
  await Movement.create({ item: item.id, itemName: item.name, type: 'Production issue', quantity: -actual, balanceAfter: item.balance, reference: `RUN-${production.id}`, user: 'Kumar Production' });
}
const finished = stocks.find((item) => item.name === murukku.name);
finished.balance = 238; finished.averageRate = 22.79; await finished.save();
await Movement.create({ item: finished.id, itemName: finished.name, type: 'Production output', quantity: 188, balanceAfter: 238, reference: `RUN-${production.id}`, user: 'Kumar Production' });

async function seedSale(customer, quantity, salesperson) {
  const taxable = quantity * murukku.price, tax = taxable * murukku.gstRate / 100;
  const order = await Order.create({
    customer: customer.id, customerName: customer.name, customerAddress: customer.address, customerState: customer.state, customerGstin: customer.gstin, salesperson,
    lines: [{ product: murukku.id, productName: murukku.name, quantity, price: murukku.price, hsn: murukku.hsn, gstRate: murukku.gstRate }],
    status: 'Dispatched', total: taxable + tax, shortage: 0,
  });
  const interstate = customer.state !== 'Tamil Nadu';
  const invoice = await Invoice.create({
    number: `SF-${new Date().getFullYear()}-${customer.name === 'Retailer A' ? '0001' : '0002'}`, order: order.id,
    customerName: customer.name, customerAddress: customer.address, customerState: customer.state, customerGstin: customer.gstin, createdBy: 'System',
    lines: [{ productName: murukku.name, quantity, price: murukku.price, hsn: murukku.hsn, gstRate: 5, taxable, cgst: interstate ? 0 : tax / 2, sgst: interstate ? 0 : tax / 2, igst: interstate ? tax : 0, total: taxable + tax }],
    taxable, cgst: interstate ? 0 : tax / 2, sgst: interstate ? 0 : tax / 2, igst: interstate ? tax : 0, total: taxable + tax, paid: 0, status: 'Unpaid',
  });
  const stock = stocks.find((item) => item.name === murukku.name);
  stock.balance -= quantity; await stock.save();
  await Movement.create({ item: stock.id, itemName: stock.name, type: 'Sales dispatch', quantity: -quantity, balanceAfter: stock.balance, reference: `ORDER-${order.id}`, user: 'Meena Admin' });
  return { order, invoice };
}
const retailerSale = await seedSale(customers.find((customer) => customer.name === 'Retailer A'), 150, 'Arun Sales');
const distributor = customers.find((customer) => customer.name === 'Distributor B');
await Order.create({
  customer: distributor.id, customerName: distributor.name, customerState: distributor.state, customerGstin: distributor.gstin, salesperson: 'Arun Sales',
  lines: [{ product: murukku.id, productName: murukku.name, quantity: 120, price: 50, hsn: murukku.hsn, gstRate: 5 }],
  status: 'Submitted', total: 6300, shortage: 32, note: '32 packets short; waiting for next production run.',
});
const invoice = retailerSale.invoice;
invoice.paid = 4000; invoice.status = 'Part-paid'; await invoice.save();
await Payment.create({ invoice: invoice.id, invoiceNumber: invoice.number, customerName: invoice.customerName, amount: 4000, method: 'Bank transfer', date: new Date(), reference: 'DEMO-RETAILER-A-4000', user: 'System' });

console.log('Seed complete: benchmark stock, production, sales, GST invoices and payment loaded.');
console.log('Logins: sales@smartfactory.local, admin@smartfactory.local, production@smartfactory.local, accounts@smartfactory.local, owner@smartfactory.local');
console.log('Password for every demo user: Factory@123');
await mongoose.disconnect();
