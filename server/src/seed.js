import 'dotenv/config';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { decimal, decimal128, extendedCost, lineTax, money, productionCost, weightedAverageRate } from './lib/money.js';

const schema = (definition) => new mongoose.Schema(definition, { timestamps: true });
const User = mongoose.model('User', schema({ name: String, email: { type: String, unique: true }, password: String, role: String }));
const Decimal128 = mongoose.Schema.Types.Decimal128;
const Product = mongoose.model('Product', schema({ name: String, sku: String, category: String, packSize: String, hsn: String, price: Decimal128, gstRate: Decimal128, bom: [{ itemName: String, quantity: Decimal128, unit: String }] }));
const Customer = mongoose.model('Customer', schema({ name: String, type: String, state: String, gstin: String, address: String, phone: String }));
const Inventory = mongoose.model('Inventory', schema({ name: String, category: String, unit: String, openingStock: Decimal128, balance: Decimal128, reorderLevel: Decimal128, averageRate: Decimal128 }));
const Movement = mongoose.model('Movement', schema({ item: mongoose.Schema.Types.ObjectId, itemName: String, unit: String, type: String, quantity: Decimal128, balanceAfter: Decimal128, unitRate: Decimal128, reference: String, note: String, user: String }));
const Supplier = mongoose.model('Supplier', schema({ name: { type: String, unique: true }, gstin: String, state: String, phone: String, address: String, createdBy: String }));
const Purchase = mongoose.model('Purchase', schema({ supplierName: String, itemName: String, quantity: Decimal128, unitRate: Decimal128, total: Decimal128, date: Date, user: String }));
const Production = mongoose.model('Production', schema({ product: mongoose.Schema.Types.ObjectId, productName: String, plannedOutput: Number, goodOutput: Number, damaged: Number, yieldVariance: Decimal128, consumption: [{ itemName: String, planned: Decimal128, actual: Decimal128, unit: String, variance: Decimal128 }], labor: Decimal128, utilities: Decimal128, materialCost: Decimal128, totalCost: Decimal128, costPerPacket: Decimal128, sellingPrice: Decimal128, profitPerPacket: Decimal128, profitMargin: Decimal128, supervisor: String }));
const Order = mongoose.model('Order', schema({ customer: mongoose.Schema.Types.ObjectId, customerName: String, customerAddress: String, customerState: String, customerGstin: String, salesperson: String, reviewedBy: String, reviewedAt: Date, dispatchedBy: String, dispatchedAt: Date, reviewChanges: [{ lineIndex: Number, productName: String, quantityBefore: Number, quantityAfter: Number, priceBefore: Decimal128, priceAfter: Decimal128 }], lines: [{ product: mongoose.Schema.Types.ObjectId, productName: String, quantity: Number, price: Decimal128, hsn: String, gstRate: Decimal128 }], status: String, total: Decimal128, shortage: Number, note: String }));
const Invoice = mongoose.model('Invoice', schema({ number: String, order: { type: mongoose.Schema.Types.ObjectId, unique: true }, customerName: String, customerAddress: String, customerState: String, customerGstin: String, createdBy: String, lines: [{ productName: String, quantity: Number, price: Decimal128, hsn: String, gstRate: Decimal128, taxable: Decimal128, cgst: Decimal128, sgst: Decimal128, igst: Decimal128, total: Decimal128 }], taxable: Decimal128, cgst: Decimal128, sgst: Decimal128, igst: Decimal128, total: Decimal128, paid: Decimal128, status: String }));
const Payment = mongoose.model('Payment', schema({ invoice: mongoose.Schema.Types.ObjectId, invoiceNumber: String, customerName: String, amount: Decimal128, method: String, date: Date, reference: String }));

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
  ['Flour', 'Raw materials', 'kg', 100, 0, 42, 50],
  ['Cooking Oil', 'Raw materials', 'L', 30, 0, 140, 10],
  ['Spice Mix', 'Raw materials', 'kg', 5, 0, 200, 2],
  ['Pouches', 'Packaging materials', 'pcs', 500, 0, 2.5, 100],
  ['Cartons', 'Packaging materials', 'pcs', 30, 0, 15, 10],
  ['Murukku 200 g', 'Finished goods', 'packets', 50, 0, 0, 40],
  ['Mixture 200 g', 'Finished goods', 'packets', 0, 0, 0, 20],
  ['Potato Chips 100 g', 'Finished goods', 'packets', 0, 0, 0, 20],
  ['Assorted Sweets 250 g', 'Finished goods', 'packets', 0, 0, 0, 10],
];
const stocks = await Inventory.insertMany(stockSeed.map(([name, category, unit, openingStock, balance, averageRate, reorderLevel]) => ({ name, category, unit, openingStock: decimal128(openingStock), balance: decimal128(openingStock + balance), averageRate: decimal128(averageRate), reorderLevel: decimal128(reorderLevel) })));
for (const item of stocks) await Movement.create({ item: item.id, itemName: item.name, unit: item.unit, type: 'Opening balance', quantity: item.openingStock, balanceAfter: item.openingStock, unitRate: item.averageRate, reference: `OPENING-${item.name.toUpperCase().replace(/\W+/g, '-')}`, user: 'System' });
const customers = await Customer.insertMany([
  { name: 'Retailer A', type: 'Retailer', state: 'Tamil Nadu', gstin: '33AABCU9603R1ZM', address: '12 Market Road, Coimbatore, Tamil Nadu', phone: '+91 98400 10001' },
  { name: 'Distributor B', type: 'Distributor', state: 'Karnataka', gstin: '29AABCU9603R1ZQ', address: '44 Wholesale Market, Bengaluru, Karnataka', phone: '+91 98400 10002' },
  { name: 'Retailer C', type: 'Retailer', state: 'Tamil Nadu', gstin: '33AABCU9603R1ZN', address: '8 Bazaar Street, Madurai, Tamil Nadu', phone: '+91 98400 10003' },
]);
await Supplier.create({ name: 'Sri Lakshmi Flour Mills', gstin: '33AABFS1234D1ZA', state: 'Tamil Nadu', phone: '+91 422 221 1000', address: 'Coimbatore, Tamil Nadu' });

console.log('Seed complete: master data, users, customers, supplier and opening balances loaded.');
console.log('Logins: sales@smartfactory.local, admin@smartfactory.local, production@smartfactory.local, accounts@smartfactory.local, owner@smartfactory.local');
console.log('Password for every demo user: Factory@123');
await mongoose.disconnect();
