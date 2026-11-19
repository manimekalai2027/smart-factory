import { useCallback, useEffect, useState } from 'react';
import {
  Activity, ArrowDownToLine, ArrowUpRight, Boxes, ChartNoAxesCombined, Check, ChevronDown, CircleAlert,
  ClipboardList, CreditCard, Factory, FileBarChart, FileText, LayoutDashboard, LogOut, Menu, Package,
  Plus, Search, ShieldCheck, ShoppingCart, Truck, Users, X,
} from 'lucide-react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import Decimal from 'decimal.js';

const API = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';
const roles = [
  { role: 'Owner', email: 'owner@smartfactory.local' },
  { role: 'Factory Admin', email: 'admin@smartfactory.local' },
  { role: 'Salesman', email: 'sales@smartfactory.local' },
  { role: 'Production Supervisor', email: 'production@smartfactory.local' },
  { role: 'Accountant / Auditor', email: 'accounts@smartfactory.local' },
];
const navItems = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard, permissions: ['overview'] },
  { id: 'sales', label: 'Sales & orders', icon: ShoppingCart, permissions: ['sales', 'orders'] },
  { id: 'production', label: 'Production', icon: Factory, permissions: ['production'] },
  { id: 'inventory', label: 'Inventory', icon: Boxes, permissions: ['inventory'] },
  { id: 'purchases', label: 'Purchasing', icon: Package, permissions: ['purchases'] },
  { id: 'reports', label: 'Reports & audit', icon: FileBarChart, permissions: ['reports'] },
  { id: 'payments', label: 'Receivables', icon: CreditCard, permissions: ['payments', 'invoices'] },
];
const dec = (n) => { try { return new Decimal(n ?? 0); } catch { return new Decimal(0); } };
const fmt = (n) => new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(dec(n).toNumber());
const rupees = (n) => `₹${fmt(n)}`;
const pdfMoney = (n) => `INR ${fmt(n)}`;
const moneyRound = (n) => dec(n).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();
const dateText = (date) => new Date(date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

async function request(path, token, options = {}) {
  const response = await fetch(`${API}${path}`, {
    ...options, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(options.headers || {}) },
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || `Request failed (${response.status}).`);
  return data;
}

function App() {
  const [session, setSession] = useState(() => {
    try { return JSON.parse(localStorage.getItem('sf-session') || 'null'); } catch { return null; }
  });
  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [page, setPage] = useState('overview');
  const [mobileMenu, setMobileMenu] = useState(false);
  const [toast, setToast] = useState('');
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');

  const refresh = useCallback(async () => {
    if (!session?.token) return;
    try { setData(await request('/bootstrap', session.token)); setLoadError(''); }
    catch (error) { setLoadError(error.message); notify(error.message); }
  }, [session]);
  function notify(message) {
    setToast(message);
    window.clearTimeout(window.__sfToast);
    window.__sfToast = window.setTimeout(() => setToast(''), 4000);
  }
  async function act(path, method, body, success) {
    setBusy(true);
    try {
      const result = await request(path, session.token, { method, body: body === undefined ? undefined : JSON.stringify(body) });
      notify(success); await refresh(); return result;
    } catch (error) { notify(error.message); await refresh(); return null; }
    finally { setBusy(false); }
  }
  function signOut() { localStorage.removeItem('sf-session'); setSession(null); setData(null); setLoadError(''); }
  useEffect(() => { if (session?.token) refresh(); }, [session, refresh]);

  if (!session) return <Login onLogin={(value) => { localStorage.setItem('sf-session', JSON.stringify(value)); setSession(value); }} />;
  if (!data && loadError) return <div className="loading-screen loading-error"><div className="brand-mark"><CircleAlert size={20} /></div><div><b>Could not load your workspace</b><span>{loadError}</span><button className="primary-btn" onClick={refresh}>Try again</button></div></div>;
  if (!data) return <div className="loading-screen"><div className="brand-mark"><Factory size={22} /></div><span>Connecting to your factory…</span></div>;
  const allowed = navItems.filter((item) => item.permissions.some((permission) => session.user.permissions.includes(permission)));
  const active = allowed.find((item) => item.id === page) || allowed[0];
  const auditor = session.user.role === 'Accountant / Auditor';
  return (
    <div className="app-shell">
      {mobileMenu && <button className="mobile-backdrop" aria-label="Close navigation" onClick={() => setMobileMenu(false)} />}
      <aside className={`sidebar ${mobileMenu ? 'sidebar-open' : ''}`}>
        <div className="brand-lockup"><div className="brand-mark"><Factory size={20} /></div><div><b>smartfactory</b><span>ERP · SOUTH INDIA</span></div><button className="icon-btn sidebar-close" onClick={() => setMobileMenu(false)}><X size={18} /></button></div>
        <div className="workspace-label">WORKSPACE</div>
        <div className="factory-picker"><span className="factory-avatar">SF</span><span className="factory-name"><b>Sri Lakshmi Foods</b><small>Coimbatore, Tamil Nadu</small></span><ChevronDown size={15} /></div>
        <div className="workspace-label menu-label">OPERATIONS</div>
        <nav className="side-nav">
          {allowed.map(({ id, label, icon: Icon }) => <button key={id} className={`nav-link ${page === id ? 'selected' : ''}`} onClick={() => { setPage(id); setMobileMenu(false); }}><Icon size={18} /><span>{label}</span>{id === 'sales' && data.metrics.pendingOrders > 0 && <em>{data.metrics.pendingOrders}</em>}</button>)}
        </nav>
        <div className="sidebar-bottom">
          <div className="health-chip"><span className="health-dot" /><span>Systems operational</span><span className="health-live">LIVE</span></div>
          <div className="profile-card"><div className="profile-avatar">{session.user.name.split(' ').map((part) => part[0]).slice(0, 2).join('')}</div><div className="profile-text"><b>{session.user.name}</b><small>{session.user.role}</small></div><button className="icon-btn logout-btn" onClick={signOut} title="Sign out"><LogOut size={17} /></button></div>
        </div>
      </aside>
      <main className="main-area">
        <header className="topbar"><button className="icon-btn menu-toggle" onClick={() => setMobileMenu(true)}><Menu size={20} /></button><div className="breadcrumbs">Workspace <span>/</span> <b>{active?.label}</b></div><div className="topbar-actions"><div className="topbar-date">{new Date().toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}</div><div className="top-user"><span>{session.user.name.slice(0, 1)}</span></div></div></header>
        <section className="page-content">
          {page === 'overview' && <Overview data={data} setPage={setPage} />}
          {page === 'sales' && <Sales data={data} session={session} act={act} busy={busy} search={search} setSearch={setSearch} />}
          {page === 'production' && <ProductionPage data={data} act={act} busy={busy} />}
          {page === 'inventory' && <InventoryPage data={data} session={session} act={act} busy={busy} search={search} setSearch={setSearch} />}
          {page === 'purchases' && <PurchasesPage data={data} act={act} busy={busy} />}
          {page === 'reports' && <ReportsPage data={data} session={session} />}
          {page === 'payments' && <PaymentsPage data={data} session={session} act={act} busy={busy} auditor={auditor} />}
        </section>
      </main>
      {toast && <div className="toast"><span className="toast-dot" />{toast}<button onClick={() => setToast('')}><X size={15} /></button></div>}
    </div>
  );
}

function Login({ onLogin }) {
  const [email, setEmail] = useState(roles[0].email);
  const [password, setPassword] = useState('Factory@123');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  async function submit(event) {
    event.preventDefault(); setLoading(true); setError('');
    try {
      const response = await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || 'Unable to sign in.');
      onLogin(result);
    } catch (err) { setError(err.message || 'Could not connect to the ERP server.'); }
    finally { setLoading(false); }
  }
  return <div className="login-page"><div className="login-decoration decoration-one" /><div className="login-decoration decoration-two" />
    <div className="login-story"><div className="brand-lockup login-brand"><div className="brand-mark"><Factory size={20} /></div><div><b>smartfactory</b><span>ERP · SOUTH INDIA</span></div></div><div className="story-copy"><div className="eyebrow-light"><span /> THE FACTORY, IN SYNC</div><h1>Good food.<br /><span>Great operations.</span></h1><p>One connected workspace for every order, batch and balance.</p></div><div className="story-footer"><span>BUILT FOR THE WAY YOU MAKE</span><div className="story-products"><span>Murukku</span><i /> <span>Mixture</span><i /> <span>Chips</span><i /> <span>Sweets</span></div></div></div>
    <div className="login-panel"><form onSubmit={submit} className="login-card"><div className="eyebrow">WELCOME BACK</div><h2>Sign in to your workspace</h2><p className="login-subtitle">Use a seeded demo role to explore the live prototype.</p>
      <label className="field-label">Workspace role</label><div className="role-picker">{roles.map((item) => <button type="button" className={`role-option ${email === item.email ? 'role-active' : ''}`} key={item.role} onClick={() => setEmail(item.email)}>{item.role}</button>)}</div>
      <label className="field-label" htmlFor="email">Email address</label><input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      <label className="field-label" htmlFor="password">Password</label><input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      {error && <div className="form-error"><CircleAlert size={16} />{error}</div>}<button className="primary-btn login-submit" disabled={loading}>{loading ? 'Connecting…' : 'Sign in'}<ArrowUpRight size={17} /></button><div className="demo-hint"><ShieldCheck size={16} /> Demo password for all roles: <b>Factory@123</b></div></form><div className="login-copyright">© 2026 SmartFactory ERP <span>·</span> Secure business workspace</div></div>
  </div>;
}

function PageTitle({ eyebrow, title, description, children }) {
  return <div className="page-title-row"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1>{description && <p>{description}</p>}</div>{children && <div className="title-actions">{children}</div>}</div>;
}
function MetricCard({ label, value, note, icon: Icon, tone = 'blue', suffix }) {
  return <div className="metric-card"><div className={`metric-icon ${tone}`}><Icon size={19} /></div><span className="metric-label">{label}</span><div className="metric-value">{value}{suffix && <small>{suffix}</small>}</div><div className="metric-note">{note}</div></div>;
}
function makeChartData(data) {
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(); date.setHours(0, 0, 0, 0); date.setDate(date.getDate() - 6 + index);
    return { date, day: date.toLocaleDateString('en-IN', { weekday: 'short' }), sales: 0, production: 0 };
  });
  const keyFor = (value) => {
    const date = new Date(value); date.setHours(0, 0, 0, 0); return date.getTime();
  };
  for (const invoice of data.invoices) {
    const day = days.find((item) => item.date.getTime() === keyFor(invoice.createdAt));
    if (day) day.sales += invoice.total;
  }
  for (const run of data.production) {
    const day = days.find((item) => item.date.getTime() === keyFor(run.createdAt));
    if (day) day.production += run.goodOutput;
  }
  return days;
}
function Overview({ data, setPage }) {
  const m = data.metrics;
  const chartData = makeChartData(data);
  const recent = [...data.orders].slice(0, 5);
  const permissions = data.user.permissions || [];
  const salesman = data.user.role === 'Salesman';
  const productionUser = data.user.role === 'Production Supervisor';
  const metrics = salesman ? [
    { label: "Today's orders", value: m.todayOrders, note: `${m.pendingOrders} awaiting approval`, icon: ShoppingCart },
    { label: "Today's invoiced sales", value: rupees(m.todaySales), note: `${rupees(m.totalSales)} invoiced overall`, icon: ChartNoAxesCombined, tone: 'violet' },
    { label: 'Pending orders', value: m.pendingOrders, note: 'Waiting for factory approval', icon: ClipboardList, tone: 'amber' },
    { label: 'Your outstanding', value: rupees(m.outstanding), note: 'Across your customer invoices', icon: CreditCard, tone: 'green' },
  ] : productionUser ? [
    { label: 'Raw material stock', value: rupees(m.rawMaterialValue), note: `${m.rawMaterialLines} tracked material lines`, icon: Boxes, tone: 'amber' },
    { label: 'Finished goods', value: fmt(m.finishedGoods), note: 'Packets ready to dispatch', icon: Package, tone: 'green' },
    { label: 'Produced today', value: fmt(m.productionToday), note: 'Good packets posted to stock', icon: Factory, tone: 'green' },
    { label: 'Cost per packet', value: rupees(m.avgCost), note: 'Latest production run', icon: Activity },
    { label: 'Low-stock alerts', value: m.lowStock, note: 'Items at reorder level', icon: CircleAlert, tone: 'amber' },
    { label: 'Variance alerts', value: m.varianceAlerts, note: 'Consumption or yield above 3%', icon: Activity, tone: 'violet' },
  ] : [
    { label: "Today's orders", value: m.todayOrders, note: `${m.pendingOrders} awaiting approval`, icon: ShoppingCart },
    { label: "Today's sales", value: rupees(m.todaySales), note: `${rupees(m.totalSales)} invoiced overall`, icon: ChartNoAxesCombined, tone: 'violet' },
    { label: 'Raw material stock', value: rupees(m.rawMaterialValue), note: `${m.rawMaterialLines} tracked material lines · weighted average`, icon: Boxes, tone: 'amber' },
    { label: 'Finished goods', value: fmt(m.finishedGoods), note: 'Packets ready to dispatch', icon: Package, tone: 'green' },
    { label: 'Pending orders', value: m.pendingOrders, note: 'Submitted, awaiting admin review', icon: ClipboardList, tone: 'amber' },
    { label: 'Produced today', value: fmt(m.productionToday), note: 'Good packets posted to stock', icon: Factory, tone: 'green' },
    { label: 'Outstanding', value: rupees(m.outstanding), note: `${data.invoices.filter((i) => i.status !== 'Paid').length} open invoices`, icon: CreditCard, tone: 'violet' },
    { label: 'Cost per packet', value: rupees(m.avgCost), note: 'Latest production run · weighted average', icon: Activity },
  ];
  return <>
    <PageTitle eyebrow="YOUR FACTORY AT A GLANCE" title="Good morning, team." description="Here’s what’s happening across your operations today.">
      {permissions.includes('reports') && <button className="secondary-btn" onClick={() => setPage('reports')}><FileBarChart size={16} /> View reports</button>}
      {(permissions.includes('sales') || permissions.includes('orders')) && <button className="primary-btn" onClick={() => setPage('sales')}><Plus size={17} /> New order</button>}
    </PageTitle>
    <div className={`metric-grid ${salesman ? 'sales-metric-grid' : ''}`}>{metrics.map((item) => <MetricCard key={item.label} {...item} />)}</div>
    <div className="overview-grid">
      <section className="panel sales-chart-panel"><div className="panel-heading"><div><h2>Business pulse</h2><p>Sales &amp; production · this week</p></div><span className="period-chip">THIS WEEK <ChevronDown size={13} /></span></div>
        <div className="chart-legend"><span><i className="legend-sales" /> Sales <b>{rupees(m.todaySales)}</b> today</span><span><i className="legend-production" /> Production</span></div>
        <div className="chart-wrap">        <ResponsiveContainer width="100%" height="100%"><AreaChart data={chartData} margin={{ top: 8, right: 6, left: -18, bottom: 0 }}><defs><linearGradient id="salesFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#2d6dea" stopOpacity={0.19} /><stop offset="95%" stopColor="#2d6dea" stopOpacity={0} /></linearGradient></defs><CartesianGrid vertical={false} stroke="#edf0f4" /><XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fill: '#8892a2', fontSize: 11 }} dy={9} /><YAxis axisLine={false} tickLine={false} tick={{ fill: '#8892a2', fontSize: 10 }} tickFormatter={(v) => `₹${v / 1000}k`} /><YAxis yAxisId={1} orientation="right" hide domain={[0, 'dataMax + 100']} /><Tooltip formatter={(value, name) => [name === 'sales' ? rupees(value) : `${value} packets`, name === 'sales' ? 'Sales' : 'Production']} contentStyle={{ borderRadius: 10, border: '1px solid #e8ebf0', fontSize: 12 }} /><Area type="monotone" dataKey="sales" stroke="#2867df" strokeWidth={2.2} fill="url(#salesFill)" /><Area type="monotone" dataKey="production" yAxisId={1} stroke="#1da982" strokeWidth={2} fill="none" /></AreaChart></ResponsiveContainer></div>
      </section>
      <section className="panel attention-panel"><div className="panel-heading"><div><h2>Needs your attention</h2><p>Items worth a closer look</p></div><span className="attention-count">{data.metrics.lowStock + data.metrics.varianceAlerts + data.metrics.shortages}</span></div>
        {data.metrics.lowStock === 0 && data.metrics.varianceAlerts === 0 && data.metrics.shortages === 0 ? <div className="empty-inline"><Check size={17} /> Nothing needs attention right now</div> : <div className="alert-list">
          {data.inventory.filter((i) => i.reorderLevel > 0 && i.balance <= i.reorderLevel).slice(0, 3).map((item) => <div className="alert-item" key={item._id}><span className="alert-icon orange"><Package size={16} /></span><div><b>Low stock · {item.name}</b><small>{fmt(item.balance)} {item.unit} remaining · reorder at {fmt(item.reorderLevel)}</small></div><ArrowUpRight size={16} /></div>)}
          {data.production.filter((run) => run.yieldVariance < -3 || run.consumption.some((c) => Math.abs(c.variance) > 3)).slice(0, 2).map((run) => <div className="alert-item" key={run._id}><span className="alert-icon red"><Activity size={16} /></span><div><b>Production variance · {run.productName}</b><small>{[...run.consumption.filter((c) => Math.abs(c.variance) > 3).map((c) => `${c.itemName} ${c.variance > 0 ? '+' : ''}${c.variance}%`), ...(run.yieldVariance < -3 ? [`Yield ${run.yieldVariance}%`] : [])].join(' · ')}</small></div><ArrowUpRight size={16} /></div>)}
          {data.orders.filter((order) => order.shortage > 0 && order.status !== 'Rejected').slice(0, 2).map((order) => <div className="alert-item" key={order._id}><span className="alert-icon orange"><Truck size={16} /></span><div><b>Order shortage · {order.customerName}</b><small>{fmt(order.shortage)} packets short</small></div><ArrowUpRight size={16} /></div>)}
        </div>}
        {permissions.includes('inventory') && <button className="text-link" onClick={() => setPage('inventory')}>Go to inventory <ArrowUpRight size={14} /></button>}
      </section>
    </div>
    <section className="panel table-panel"><div className="panel-heading"><div><h2>Recent orders</h2><p>Latest activity from your sales team</p></div>{(permissions.includes('sales') || permissions.includes('orders')) && <button className="text-link" onClick={() => setPage('sales')}>All orders <ArrowUpRight size={14} /></button>}</div>
      <OrderTable orders={recent} empty="No orders yet. Orders appear here when the sales team submits one." />
    </section>
  </>;
}
function Status({ children }) {
  const key = String(children).toLowerCase().replace(/[^a-z]+/g, '-');
  return <span className={`status status-${key}`}>{children}</span>;
}
function OrderTable({ orders, onReview, onInvoice, onDispatch, viewerRole }) {
  if (!orders.length) return <div className="empty-state"><ClipboardList size={23} /><b>No orders found</b><span>New submitted orders will show up here.</span></div>;
  return <div className="table-scroll"><table><thead><tr><th>ORDER / CUSTOMER</th><th>ITEMS</th><th>ORDER VALUE</th><th>STATUS</th><th>DATE</th>{(onReview || onInvoice || onDispatch) && <th className="right">ACTION</th>}</tr></thead><tbody>
    {orders.map((order) => <tr key={order._id}><td><div className="order-customer"><b>#{order._id.slice(-6).toUpperCase()}</b><span>{order.customerName}</span></div></td><td>{order.lines.map((line) => `${line.productName} × ${line.quantity}`).join(', ')}</td><td className="strong-cell">{rupees(order.total)}</td><td><Status>{order.status}</Status>{order.shortage > 0 && <span className="shortage-pill">{order.shortage} short</span>}</td><td>{dateText(order.createdAt)}</td>
      {(onReview || onInvoice || onDispatch) && <td className="right action-cell">{order.status === 'Submitted' && onReview && <ReviewButton order={order} onReview={onReview} />}
        {order.status === 'Approved' && onInvoice && <button className="small-action" onClick={() => onInvoice(order)}>Create invoice</button>}
        {order.status === 'Invoiced' && onDispatch && <button className="small-action" onClick={() => onDispatch(order)}>Dispatch</button>}
        {!['Submitted', 'Approved', 'Invoiced'].includes(order.status) && <span className="subtle-text">{viewerRole === 'Salesman' ? 'View' : '—'}</span>}</td>}
    </tr>)}
  </tbody></table></div>;
}
function ReviewButton({ order, onReview }) {
  const [editing, setEditing] = useState(false);
  const [lines, setLines] = useState(order.lines.map((line) => ({ quantity: line.quantity, price: line.price })));
  if (!editing) return <button className="small-action" onClick={() => setEditing(true)}>Review order</button>;
  return <div className="review-actions">{order.lines.map((line, i) => <div key={line.product}><small>{line.productName}</small><input type="number" min="1" value={lines[i].quantity} onChange={(e) => setLines(lines.map((item, index) => index === i ? { ...item, quantity: Number(e.target.value) } : item))} /><input type="number" min="0" step=".01" value={lines[i].price} onChange={(e) => setLines(lines.map((item, index) => index === i ? { ...item, price: Number(e.target.value) } : item))} /></div>)}<button className="approve-btn" onClick={() => onReview(order, 'approve', lines)}>Approve</button><button className="reject-btn" onClick={() => onReview(order, 'reject')}>Reject</button><button className="quiet-btn" onClick={() => setEditing(false)}>Cancel</button></div>;
}
function Sales({ data, session, act, busy, search, setSearch }) {
  const isAdmin = ['Factory Admin', 'Owner'].includes(session.user.role);
  const [creating, setCreating] = useState(false);
  const [customerId, setCustomerId] = useState(data.customers[0]?._id || '');
  const [productId, setProductId] = useState(data.products[0]?._id || '');
  const [quantity, setQuantity] = useState(1);
  const [tab, setTab] = useState('All orders');
  const [historyCustomerId, setHistoryCustomerId] = useState(data.customers[0]?._id || '');
  const product = data.products.find((item) => item._id === productId);
  const customer = data.customers.find((item) => item._id === customerId);
  const historyCustomer = data.customers.find((item) => item._id === historyCustomerId);
  const customerOrders = data.orders.filter((order) => order.customerName === historyCustomer?.name);
  const customerInvoices = data.invoices.filter((invoice) => invoice.customerName === historyCustomer?.name);
  const customerSales = customerInvoices.reduce((sum, invoice) => sum.plus(dec(invoice.total)), dec(0));
  const orderTotal = product ? dec(quantity).mul(product.price).mul(dec(product.gstRate).div(100).plus(1)) : dec(0);
  const filtered = data.orders.filter((order) => `${order.customerName} ${order.status} ${order._id}`.toLowerCase().includes(search.toLowerCase()) && (tab === 'All orders' || order.status === tab));
  async function createOrder(e) { e.preventDefault(); const result = await act('/orders', 'POST', { customerId, lines: [{ productId, quantity: Number(quantity) }] }, 'Order submitted to factory admin.'); if (result) setCreating(false); }
  async function review(order, action, lines) {
    const body = { action }; if (lines) body.lines = lines;
    await act(`/orders/${order._id}/review`, 'PATCH', body, action === 'approve' ? 'Order approved.' : 'Order rejected.');
  }
  return <>
    <PageTitle eyebrow="CUSTOMER ORDERS" title="Sales & orders" description="Capture customer demand and move orders through approval to dispatch.">
      {!isAdmin && <button className="primary-btn" onClick={() => setCreating((v) => !v)}><Plus size={17} /> New order</button>}
    </PageTitle>
    {!isAdmin && creating && <form className="panel form-panel mobile-order-form" onSubmit={createOrder}><div className="panel-heading"><div><h2>Place a customer order</h2><p>Product pricing is pre-filled from your current price list.</p></div><button type="button" className="icon-btn" onClick={() => setCreating(false)}><X size={18} /></button></div><div className="form-grid"><label>Retailer or distributor<select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>{data.customers.map((c) => <option value={c._id} key={c._id}>{c.name} · {c.state}</option>)}</select></label><label>Product<select value={productId} onChange={(e) => setProductId(e.target.value)}>{data.products.map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}</select></label><label>Packet quantity<input type="number" min="1" step="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} required /></label><div className="price-summary"><span>Unit price</span><b>{rupees(product?.price)}</b><span>Order total (incl. GST)</span><b className="summary-total">{rupees(orderTotal)}</b></div></div><div className="form-footer"><span>Delivering to {customer?.state || '—'} · GST {product?.gstRate}%</span><button className="primary-btn" disabled={busy || !customerId || !productId}><Plus size={16} /> Submit order</button></div></form>}
    {isAdmin && <div className="stage-banner"><span className="stage-icon"><ClipboardList size={18} /></span><div><b>Order-to-dispatch workflow</b><span>Review quantities &amp; stock → approve → create GST invoice → record dispatch.</span></div><div className="stage-steps"><span>01 Review</span><i /> <span>02 Invoice</span><i /> <span>03 Dispatch</span></div></div>}
    {!isAdmin && <section className="panel customer-history"><div className="panel-heading"><div><h2>Customer sales history</h2><p>Review past orders and invoiced sales by account.</p></div><select aria-label="Select a customer for sales history" value={historyCustomerId} onChange={(e) => setHistoryCustomerId(e.target.value)}>{data.customers.map((c) => <option value={c._id} key={c._id}>{c.name}</option>)}</select></div><div className="history-summary"><div><span>Invoiced sales</span><b>{rupees(customerSales)}</b></div><div><span>Orders</span><b>{customerOrders.length}</b></div><div><span>Open balance</span><b>{rupees(customerInvoices.reduce((sum, invoice) => sum.plus(dec(invoice.total).minus(invoice.paid).max(0)), dec(0)))}</b></div></div><OrderTable orders={customerOrders.slice(0, 3)} /></section>}
    <div className="panel table-panel"><div className="panel-heading orders-heading"><div><h2>Order register <span className="count-badge">{filtered.length}</span></h2><p>{isAdmin ? 'Review incoming orders, invoice approved orders, and confirm dispatch.' : 'See submitted, approved, invoiced and dispatched orders.'}</p></div><div className="table-tools"><div className="search-field"><Search size={16} /><input placeholder="Search orders…" value={search} onChange={(e) => setSearch(e.target.value)} /></div></div></div>
      <div className="table-tabs">{['All orders', 'Submitted', 'Approved', 'Invoiced', 'Dispatched', 'Rejected'].map((value) => <button key={value} className={tab === value ? 'tab-active' : ''} onClick={() => setTab(value)}>{value}{value === 'Submitted' && data.metrics.pendingOrders > 0 && <em>{data.metrics.pendingOrders}</em>}</button>)}</div>
      <OrderTable orders={filtered} onReview={isAdmin ? review : null} onInvoice={isAdmin ? (order) => act(`/orders/${order._id}/invoice`, 'POST', {}, 'GST invoice created.') : null} onDispatch={isAdmin ? (order) => act(`/orders/${order._id}/dispatch`, 'POST', {}, 'Dispatch recorded; finished stock updated.') : null} viewerRole={session.user.role} />
    </div>
  </>;
}

function ProductionPage({ data, act, busy }) {
  const products = data.products;
  const [productId, setProductId] = useState(products[0]?._id || '');
  const [batches, setBatches] = useState(1);
  const [actual, setActual] = useState({});
  const [output, setOutput] = useState(188);
  const [damaged, setDamaged] = useState(6);
  const [labor, setLabor] = useState(1200);
  const [utilities, setUtilities] = useState(600);
  const product = products.find((p) => p._id === productId);
  const planned = (product?.bom || []).map((line) => ({ ...line, planned: dec(line.quantity).mul(batches || 1).toString(), value: actual[line.itemName] ?? dec(line.quantity).mul(batches || 1).toString() }));
  async function submit(e) {
    e.preventDefault();
    const result = await act('/production', 'POST', { productId, batches: Number(batches), actual, goodOutput: Number(output), damaged: Number(damaged), labor: Number(labor), utilities: Number(utilities) }, 'Production run saved; stock ledger and costing updated.');
    if (result) { setActual({}); setBatches(1); }
  }
  return <>
    <PageTitle eyebrow="SHOP FLOOR" title="Production" description="Plan batches from BOM standards, record actuals, and spot variance before it grows.">
      <span className="variance-legend"><i /> Within 3% <i className="variance-warning-dot" /> Above 3% variance</span>
    </PageTitle>
    <div className="production-grid"><form className="panel form-panel production-form" onSubmit={submit}><div className="panel-heading"><div><h2>Record a production run</h2><p>Material issues and good output post to inventory when saved.</p></div><span className="live-tag"><span /> LIVE STOCK</span></div>
      <div className="form-grid"><label>Finished product<select value={productId} onChange={(e) => { setProductId(e.target.value); setActual({}); }}>{products.map((p) => <option value={p._id} key={p._id}>{p.name} · {p.packSize}</option>)}</select></label><label>Batch count<input type="number" min="1" step="1" value={batches} onChange={(e) => setBatches(e.target.value)} /></label></div>
      <div className="bom-head"><span>RAW MATERIAL / PACKAGING</span><span>PLANNED</span><span>ACTUAL USED</span><span>VARIANCE</span></div>
      <div className="bom-list">{planned.map((line) => { const variance = dec(line.planned).isZero() ? dec(0) : dec(line.value).minus(line.planned).div(line.planned).mul(100); const flagged = variance.abs().gt(3); return <div className="bom-line" key={line.itemName}><div className="bom-material"><span className="material-square">{line.itemName.slice(0, 1)}</span><b>{line.itemName}</b><small>{line.unit}</small></div><span className="planned-qty">{fmt(line.planned)} <small>{line.unit}</small></span><input aria-label={`${line.itemName} actual quantity`} type="number" min="0" step="0.001" value={line.value} onChange={(e) => setActual({ ...actual, [line.itemName]: e.target.value })} /><span className={`variance-cell ${flagged ? 'variance-alert' : ''}`}>{variance.gt(0) ? '+' : ''}{variance.toFixed(1)}%{flagged && <CircleAlert size={14} />}</span></div>; })}</div>
      <div className="production-output"><label>Good packets produced<input type="number" min="0" step="1" value={output} onChange={(e) => setOutput(e.target.value)} required /></label><label>Damaged packets<input type="number" min="0" step="1" value={damaged} onChange={(e) => setDamaged(e.target.value)} /></label><div className={`yield-card ${Number(output) < Number(batches) * 194 ? 'yield-alert' : ''}`}><span>Yield vs {Number(batches) * 200} planned</span><b>{((Number(output || 0) - Number(batches) * 200) / (Number(batches) * 200) * 100).toFixed(1)}%</b><small>{Number(output || 0)} good packets</small></div></div>
      <div className="form-grid expense-grid"><label>Labour expense (₹)<input type="number" min="0" step=".01" value={labor} onChange={(e) => setLabor(e.target.value)} /></label><label>Gas &amp; power (₹)<input type="number" min="0" step=".01" value={utilities} onChange={(e) => setUtilities(e.target.value)} /></label></div>
      <div className="form-footer"><span>BOM planned output · {Number(batches) * 200} packets per run</span><button className="primary-btn" disabled={busy || !productId}><Check size={16} /> Save production run</button></div>
    </form>
      <aside className="production-aside"><div className="panel stock-preview"><div className="panel-heading"><div><h2>Current stock</h2><p>Material available to issue</p></div><Boxes size={17} /></div>{data.inventory.filter((i) => i.category !== 'Finished goods').map((item) => <div className="stock-row" key={item._id}><span>{item.name}</span><b className={item.balance <= item.reorderLevel ? 'stock-low' : ''}>{fmt(item.balance)} <small>{item.unit}</small></b></div>)}</div>
        <div className="variance-note"><div><Activity size={17} /><b>Variance watch</b></div><p>Consumption variance above <b>±3%</b> is flagged automatically. Material costing uses weighted average rates.</p><span>GOOD OUTPUT ADDS TO FINISHED STOCK</span></div>
      </aside>
    </div>
    <section className="panel table-panel"><div className="panel-heading"><div><h2>Recent production runs</h2><p>Actual consumption, output and unit cost</p></div></div><ProductionTable runs={data.production.slice(0, 8)} /></section>
  </>;
}
function ProductionTable({ runs }) {
  return <div className="table-scroll"><table><thead><tr><th>RUN / PRODUCT</th><th>PLANNED</th><th>GOOD OUTPUT</th><th>YIELD VARIANCE</th><th>COST / PACKET</th><th>RECORDED</th></tr></thead><tbody>{runs.map((run) => <tr key={run._id}><td><div className="order-customer"><b>#{run._id.slice(-6).toUpperCase()}</b><span>{run.productName}</span></div></td><td>{fmt(run.plannedOutput)}</td><td>{fmt(run.goodOutput)}</td><td><span className={`variance-label ${run.yieldVariance < -3 ? 'variance-alert' : ''}`}>{run.yieldVariance > 0 ? '+' : ''}{fmt(run.yieldVariance)}%</span></td><td className="strong-cell">{rupees(run.costPerPacket)}</td><td>{dateText(run.createdAt)}</td></tr>)}</tbody></table>{!runs.length && <div className="empty-state"><Factory size={23} /><b>No runs recorded yet</b></div>}</div>;
}

function InventoryPage({ data, session, act, busy, search, setSearch }) {
  const [category, setCategory] = useState('All stock');
  const [tab, setTab] = useState('Stock on hand');
  const [adjusting, setAdjusting] = useState(false);
  const [adjustmentId, setAdjustmentId] = useState(data.inventory[0]?._id || '');
  const [delta, setDelta] = useState('');
  const [reason, setReason] = useState('');
  const canAdjust = ['Factory Admin', 'Owner'].includes(session.user.role);
  const items = data.inventory.filter((item) => (category === 'All stock' || item.category === category) && item.name.toLowerCase().includes(search.toLowerCase()));
  async function submitAdjustment(e) {
    e.preventDefault();
    const result = await act(`/inventory/${adjustmentId}/adjustments`, 'POST', { delta: Number(delta), reason }, 'Stock adjustment posted to the inventory ledger.');
    if (result) { setDelta(''); setReason(''); setAdjusting(false); }
  }
  return <>
    <PageTitle eyebrow="STOCK CONTROL" title="Inventory" description="Trace every balance back to its opening stock, purchase, production run or dispatch.">
      <div className="title-actions">{canAdjust && <button className="secondary-btn" onClick={() => setAdjusting((v) => !v)}><Plus size={15} /> Stock adjustment</button>}<span className="ledger-note"><ShieldCheck size={16} /> Ledger-controlled stock</span></div>
    </PageTitle>
    {canAdjust && adjusting && <form className="panel adjustment-form" onSubmit={submitAdjustment}><div><b>Record a stock adjustment</b><span>Balance changes require a signed quantity and reason.</span></div><label>Item<select value={adjustmentId} onChange={(e) => setAdjustmentId(e.target.value)}>{data.inventory.map((item) => <option key={item._id} value={item._id}>{item.name} · {item.balance} {item.unit}</option>)}</select></label><label>Quantity change<input type="number" step=".001" value={delta} onChange={(e) => setDelta(e.target.value)} placeholder="e.g. -2 or 5" required /></label><label>Reason<input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Cycle count correction" required /></label><button className="primary-btn" disabled={busy || !adjustmentId}><Check size={15} /> Post adjustment</button></form>}
    <div className="inventory-kpis"><div><span>Total stock items</span><b>{data.inventory.length}</b><small>across 3 categories</small></div><div><span>Low stock alerts</span><b className={data.metrics.lowStock ? 'red-value' : ''}>{data.metrics.lowStock}</b><small>at or below reorder level</small></div><div><span>Movements recorded</span><b>{data.movements.length}</b><small>recent ledger entries</small></div><div><span>Finished goods</span><b>{fmt(data.metrics.finishedGoods)} <small>packets</small></b><small>available for dispatch</small></div></div>
    <section className="panel table-panel inventory-table"><div className="panel-heading"><div><h2>Stock ledger</h2><p>Balances only change through a recorded stock movement.</p></div><div className="table-tools"><div className="search-field"><Search size={16} /><input placeholder="Find an item…" value={search} onChange={(e) => setSearch(e.target.value)} /></div></div></div>
      <div className="table-tabs">{['Stock on hand', 'Movement history'].map((v) => <button className={tab === v ? 'tab-active' : ''} key={v} onClick={() => setTab(v)}>{v}</button>)}<span className="filter-spacer" />{['All stock', 'Raw materials', 'Packaging materials', 'Finished goods'].map((v) => <button className={`category-filter ${category === v ? 'category-active' : ''}`} key={v} onClick={() => setCategory(v)}>{v}</button>)}</div>
      {tab === 'Stock on hand' ? <div className="table-scroll"><table><thead><tr><th>ITEM</th><th>CATEGORY</th><th>OPENING</th><th>ON HAND</th><th>AVG. RATE</th><th>REORDER AT</th><th>STATUS</th></tr></thead><tbody>{items.map((item) => <tr key={item._id}><td className="strong-cell">{item.name}</td><td><span className="category-chip">{item.category}</span></td><td>{fmt(item.openingStock)} {item.unit}</td><td className="stock-qty">{fmt(item.balance)} <small>{item.unit}</small></td><td>{item.averageRate ? rupees(item.averageRate) : '—'}</td><td>{fmt(item.reorderLevel)} {item.unit}</td><td>{item.reorderLevel > 0 && item.balance <= item.reorderLevel ? <Status>Low stock</Status> : <Status>Healthy</Status>}</td></tr>)}</tbody></table>{!items.length && <div className="empty-state">No stock items match this filter.</div>}</div> :
        <div className="table-scroll"><table><thead><tr><th>DATE</th><th>ITEM</th><th>MOVEMENT</th><th>QUANTITY</th><th>BALANCE AFTER</th><th>REFERENCE</th><th>RECORDED BY</th></tr></thead><tbody>{data.movements.filter((m) => (category === 'All stock' || items.some((i) => i.name === m.itemName)) && m.itemName.toLowerCase().includes(search.toLowerCase())).map((move) => <tr key={move._id}><td>{dateText(move.createdAt)}</td><td className="strong-cell">{move.itemName}</td><td>{move.type}</td><td className={move.quantity < 0 ? 'negative-qty' : 'positive-qty'}>{move.quantity > 0 ? '+' : ''}{fmt(move.quantity)}</td><td>{fmt(move.balanceAfter)}</td><td className="mono-text">{move.reference}</td><td>{move.user}</td></tr>)}</tbody></table></div>}
    </section>
  </>;
}

function PurchasesPage({ data, act, busy }) {
  const [supplierName, setSupplierName] = useState(data.suppliers[0]?.name || '');
  const [itemName, setItemName] = useState(data.inventory.find((i) => i.category !== 'Finished goods')?.name || '');
  const [quantity, setQuantity] = useState('');
  const [unitRate, setUnitRate] = useState('');
  const [newSupplier, setNewSupplier] = useState(false);
  const [supplierDraft, setSupplierDraft] = useState('');
  const total = dec(quantity).mul(unitRate || 0);
  async function record(e) {
    e.preventDefault(); const result = await act('/purchases', 'POST', { supplierName, itemName, quantity: Number(quantity), unitRate: Number(unitRate) }, 'Purchase recorded; stock and weighted average valuation updated.');
    if (result) { setQuantity(''); setUnitRate(''); }
  }
  async function addSupplier(e) {
    e.preventDefault(); const result = await act('/suppliers', 'POST', { name: supplierDraft, state: 'Tamil Nadu' }, 'Supplier added.');
    if (result) { setSupplierName(supplierDraft); setSupplierDraft(''); setNewSupplier(false); }
  }
  return <>
    <PageTitle eyebrow="PROCUREMENT" title="Purchasing" description="Receive materials into stock, update weighted average valuation, and keep every receipt traceable." />
    <div className="purchase-layout"><form className="panel form-panel purchase-form" onSubmit={record}><div className="panel-heading"><div><h2>Record a purchase</h2><p>Posting a receipt updates the material ledger.</p></div><span className="purchase-icon"><Package size={17} /></span></div>
      <label>Supplier</label>{data.suppliers.length ? <select value={supplierName} onChange={(e) => setSupplierName(e.target.value)}>{data.suppliers.map((s) => <option key={s._id}>{s.name}</option>)}</select> : <div className="subtle-text">Add a supplier to continue</div>}
      {!newSupplier ? <button type="button" className="text-link add-supplier-link" onClick={() => setNewSupplier(true)}><Plus size={14} /> Add supplier</button> : <div className="inline-add"><input placeholder="Supplier name" value={supplierDraft} onChange={(e) => setSupplierDraft(e.target.value)} /><button type="button" className="quiet-btn" onClick={() => setNewSupplier(false)}>Cancel</button><button type="button" className="small-action" disabled={!supplierDraft || busy} onClick={addSupplier}>Save</button></div>}
      <div className="form-grid purchase-fields"><label>Raw / packaging item<select value={itemName} onChange={(e) => setItemName(e.target.value)}>{data.inventory.filter((i) => i.category !== 'Finished goods').map((i) => <option value={i.name} key={i._id}>{i.name} · {i.unit}</option>)}</select></label><label>Quantity<input type="number" min=".001" step=".001" value={quantity} onChange={(e) => setQuantity(e.target.value)} required /></label><label>Purchase rate (₹ / unit)<input type="number" min="0" step=".01" value={unitRate} onChange={(e) => setUnitRate(e.target.value)} required /></label><div className="purchase-total"><span>Purchase total</span><b>{rupees(total)}</b><small>Rate weighted with current stock value</small></div></div>
      <div className="form-footer"><span>Stock cannot be overwritten directly.</span><button className="primary-btn" disabled={busy || !supplierName}><Plus size={16} /> Post purchase</button></div>
    </form><div className="panel supplier-card"><div className="panel-heading"><div><h2>Supplier directory</h2><p>Approved material suppliers</p></div><Users size={18} /></div>{data.suppliers.map((supplier) => <div className="supplier-row" key={supplier._id}><span className="supplier-avatar">{supplier.name.slice(0, 1)}</span><div><b>{supplier.name}</b><small>{supplier.state || 'Location not set'} {supplier.gstin ? `· ${supplier.gstin}` : ''}</small></div></div>)}{!data.suppliers.length && <div className="empty-inline">No suppliers yet.</div>}<div className="supplier-footer"><ShieldCheck size={14} /> Purchase receipts are audit logged</div></div></div>
    <section className="panel table-panel"><div className="panel-heading"><div><h2>Purchase register</h2><p>Recent receipts and purchase valuation</p></div></div><div className="table-scroll"><table><thead><tr><th>RECEIPT / DATE</th><th>SUPPLIER</th><th>ITEM</th><th>QUANTITY</th><th>RATE</th><th>TOTAL</th></tr></thead><tbody>{data.purchases.map((purchase) => <tr key={purchase._id}><td><div className="order-customer"><b>#{purchase._id.slice(-6).toUpperCase()}</b><span>{dateText(purchase.date)}</span></div></td><td>{purchase.supplierName}</td><td>{purchase.itemName}</td><td>{fmt(purchase.quantity)}</td><td>{rupees(purchase.unitRate)}</td><td className="strong-cell">{rupees(purchase.total)}</td></tr>)}</tbody></table>{!data.purchases.length && <div className="empty-state">No purchases have been recorded.</div>}</div></section>
  </>;
}

function downloadInvoice(invoice) {
  const pdf = new jsPDF();
  pdf.setFillColor(16, 29, 50); pdf.rect(0, 0, 210, 42, 'F');
  pdf.setTextColor(255, 255, 255); pdf.setFontSize(19); pdf.text('SMARTFACTORY', 16, 20); pdf.setFontSize(9); pdf.text('TAX INVOICE  ·  SRI LAKSHMI FOODS', 16, 29);
  pdf.setFontSize(10); pdf.text(invoice.number, 151, 20); pdf.text(dateText(invoice.createdAt || new Date()), 151, 29);
  pdf.setTextColor(38, 48, 65); pdf.setFontSize(10); pdf.text('BILL TO', 16, 57); pdf.setFontSize(13); pdf.text(invoice.customerName, 16, 65); pdf.setFontSize(9);
  if (invoice.customerAddress) { pdf.text(invoice.customerAddress, 16, 78); pdf.text(`${invoice.customerState || ''}  ·  GSTIN ${invoice.customerGstin || 'Unregistered'}`, 16, 84); }
  else pdf.text(`${invoice.customerState || ''}  ·  GSTIN ${invoice.customerGstin || 'Unregistered'}`, 16, 78);
  pdf.setFontSize(8); pdf.text('SRI LAKSHMI FOODS  ·  GSTIN 33AABFS1234D1ZA  ·  Coimbatore, Tamil Nadu', 16, 91);
  let y = 108; pdf.setFillColor(241, 244, 249); pdf.rect(15, y - 7, 180, 11, 'F'); pdf.setFontSize(8); pdf.text('PRODUCT / HSN', 18, y); pdf.text('QTY', 106, y); pdf.text('RATE', 122, y); pdf.text('TAXABLE', 145, y); pdf.text('GST', 164, y); pdf.text('TOTAL', 182, y); y += 14;
  for (const line of invoice.lines) { pdf.setFontSize(8); pdf.text(`${line.productName} · ${line.hsn}`, 18, y); pdf.text(String(line.quantity), 106, y); pdf.text(pdfMoney(line.price), 122, y); pdf.text(pdfMoney(line.taxable), 145, y); pdf.text(`${line.gstRate}%`, 165, y); pdf.text(pdfMoney(line.total), 182, y); y += 11; }
  y += 6; pdf.line(115, y, 195, y); y += 9; pdf.text('Taxable amount', 120, y); pdf.text(pdfMoney(invoice.taxable), 178, y); y += 8;
  if (invoice.cgst) { pdf.text('CGST', 120, y); pdf.text(pdfMoney(invoice.cgst), 178, y); y += 8; pdf.text('SGST', 120, y); pdf.text(pdfMoney(invoice.sgst), 178, y); y += 8; }
  if (invoice.igst) { pdf.text('IGST', 120, y); pdf.text(pdfMoney(invoice.igst), 178, y); y += 8; }
  pdf.setFontSize(12); pdf.setFont(undefined, 'bold'); pdf.text('Invoice total', 120, y + 3); pdf.text(pdfMoney(invoice.total), 178, y + 3);
  pdf.setFont(undefined, 'normal'); pdf.setFontSize(8); pdf.text('Thank you for your business.', 16, 270); pdf.save(`${invoice.number}.pdf`);
}
function PaymentsPage({ data, session, act, busy, auditor }) {
  const canPay = ['Factory Admin', 'Owner'].includes(session.user.role);
  const [invoiceId, setInvoiceId] = useState(data.invoices.find((i) => i.paid < i.total)?._id || '');
  const [amount, setAmount] = useState('');
  const open = data.invoices.filter((invoice) => invoice.paid < invoice.total);
  const selected = open.find((invoice) => invoice._id === invoiceId);
  async function submit(e) {
    e.preventDefault();
    const result = await act('/payments', 'POST', { invoiceId, amount: Number(amount), method: 'Bank transfer' }, 'Payment recorded and outstanding recalculated.');
    if (result) setAmount('');
  }
  return <>
    <PageTitle eyebrow="ACCOUNTS RECEIVABLE" title="Receivables" description="Track collections against invoices, customer balances and payment history." />
    <div className="receivable-kpis"><div className="receivable-card"><span>Outstanding receivables</span><b>{rupees(data.metrics.outstanding)}</b><small>across {open.length} unpaid or part-paid invoices</small></div><div className="receivable-card"><span>Collections recorded</span><b>{rupees(data.payments.reduce((s, p) => s.plus(dec(p.amount)), dec(0)))}</b><small>{data.payments.length} payment transactions</small></div><div className="receivable-card"><span>Overdue invoices</span><b>{data.invoices.filter((i) => dec(i.paid).lt(i.total) && (Date.now() - new Date(i.createdAt).getTime()) > 30 * 86400000).length}</b><small>outstanding for over 30 days</small></div></div>
    {canPay && <form className="panel payment-entry" onSubmit={submit}><div><div className="eyebrow">NEW COLLECTION</div><h2>Record a customer payment</h2><p>Payment is linked to an invoice and cannot exceed its remaining balance.</p></div><label>Invoice<select value={invoiceId} onChange={(e) => setInvoiceId(e.target.value)}>{open.map((i) => <option key={i._id} value={i._id}>{i.number} · {i.customerName} · due {rupees(i.total - i.paid)}</option>)}</select></label><label>Amount (₹)<input type="number" min=".01" max={selected ? selected.total - selected.paid : undefined} step=".01" value={amount} onChange={(e) => setAmount(e.target.value)} required /></label><button className="primary-btn" disabled={busy || !invoiceId}><Plus size={16} /> Record payment</button></form>}
    <div className="panel table-panel"><div className="panel-heading"><div><h2>Invoice register</h2><p>GST invoices, payment status and downloadable copies</p></div></div><div className="table-scroll"><table><thead><tr><th>INVOICE</th><th>CUSTOMER</th><th>INVOICE TOTAL</th><th>PAID</th><th>OUTSTANDING</th><th>STATUS</th><th className="right">PDF</th></tr></thead><tbody>{data.invoices.map((invoice) => <tr key={invoice._id}><td className="strong-cell">{invoice.number}</td><td><div className="order-customer"><span>{invoice.customerName}</span><small>{invoice.customerState} · {invoice.customerGstin}</small></div></td><td>{rupees(invoice.total)}</td><td className="positive-qty">{rupees(invoice.paid)}</td><td className="strong-cell">{rupees(Math.max(0, invoice.total - invoice.paid))}</td><td><Status>{invoice.status}</Status></td><td className="right"><button className="icon-btn download-btn" title="Download invoice PDF" onClick={() => downloadInvoice(invoice)}><ArrowDownToLine size={17} /></button></td></tr>)}</tbody></table>{!data.invoices.length && <div className="empty-state">GST invoices appear here after order approval.</div>}</div></div>
    <div className="panel table-panel"><div className="panel-heading"><div><h2>Payment history</h2><p>{auditor ? 'Read-only audit trail of customer collections.' : 'All collections applied to customer invoices.'}</p></div></div><div className="table-scroll"><table><thead><tr><th>DATE</th><th>CUSTOMER</th><th>INVOICE</th><th>METHOD</th><th>REFERENCE</th><th>AMOUNT</th></tr></thead><tbody>{data.payments.map((p) => <tr key={p._id}><td>{dateText(p.date)}</td><td>{p.customerName}</td><td>{p.invoiceNumber}</td><td>{p.method}</td><td className="mono-text">{p.reference || '—'}</td><td className="strong-cell positive-qty">{rupees(p.amount)}</td></tr>)}</tbody></table>{!data.payments.length && <div className="empty-state">No customer payments recorded yet.</div>}</div></div>
  </>;
}

function ReportsPage({ data, session }) {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [report, setReport] = useState(null);
  const [audit, setAudit] = useState(null);
  const [loading, setLoading] = useState(false);
  const readOnly = session.user.role === 'Accountant / Auditor';
  async function load(e) {
    e?.preventDefault(); setLoading(true);
    try {
      const query = new URLSearchParams(); if (from) query.set('from', from); if (to) query.set('to', to);
      const [nextReport, nextAudit] = await Promise.all([
        request(`/reports?${query}`, session.token), request('/audit', session.token),
      ]);
      setReport(nextReport); setAudit(nextAudit);
    } catch (error) { window.alert(error.message); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);
  const current = report || { invoices: [], purchases: [], production: [], payments: [], movements: [] };
  const invoices = current.invoices || [], purchases = current.purchases || [], production = current.production || [], payments = current.payments || [];
  const gstTotal = invoices.reduce((s, i) => s.plus(dec(i.cgst).plus(i.sgst).plus(i.igst)), dec(0));
  const salesRows = invoices.map((i) => ({ Type: 'Sales invoice', Date: dateText(i.createdAt), Reference: i.number, Customer: i.customerName, Product: i.lines.map((l) => l.productName).join(', '), Taxable: i.taxable, GST: dec(i.cgst).plus(i.sgst).plus(i.igst).toString(), Total: i.total }));
  const customerTotals = new Map();
  for (const invoice of invoices) {
    const row = customerTotals.get(invoice.customerName) || { taxable: dec(0), gst: dec(0), total: dec(0), paid: dec(0) };
    row.taxable = row.taxable.plus(invoice.taxable); row.gst = row.gst.plus(invoice.cgst).plus(invoice.sgst).plus(invoice.igst); row.total = row.total.plus(invoice.total); row.paid = row.paid.plus(invoice.paid);
    customerTotals.set(invoice.customerName, row);
  }
  const customerRows = [...customerTotals].map(([Customer, totals]) => ({ Type: 'Customer sales', Date: '', Reference: 'CUSTOMER SUMMARY', Customer, Product: 'All products', Taxable: moneyRound(totals.taxable), GST: moneyRound(totals.gst), Total: moneyRound(totals.total), Paid: moneyRound(totals.paid), Outstanding: moneyRound(totals.total - totals.paid) }));
  const productTotals = new Map();
  for (const invoice of invoices) for (const line of invoice.lines) {
    const row = productTotals.get(line.productName) || { quantity: 0, taxable: dec(0), gst: dec(0), total: dec(0) };
    row.quantity += line.quantity; row.taxable = row.taxable.plus(line.taxable); row.gst = row.gst.plus(line.cgst).plus(line.sgst).plus(line.igst); row.total = row.total.plus(line.total);
    productTotals.set(line.productName, row);
  }
  const productRows = [...productTotals].map(([Product, totals]) => ({ Type: 'Product sales', Date: '', Reference: 'PRODUCT SUMMARY', Customer: 'All customers', Product: `${Product} · ${totals.quantity} packets`, Taxable: moneyRound(totals.taxable), GST: moneyRound(totals.gst), Total: moneyRound(totals.total) }));
  const gstRows = invoices.flatMap((invoice) => invoice.lines.map((line) => ({ Type: 'GST summary', Date: dateText(invoice.createdAt), Reference: invoice.number, Customer: invoice.customerName, Product: `${line.productName} · ${line.gstRate}%`, Taxable: line.taxable, GST: moneyRound(dec(line.cgst).plus(line.sgst).plus(line.igst)), CGST: line.cgst, SGST: line.sgst, IGST: line.igst, Total: line.total })));
  const purchaseRows = purchases.map((p) => ({ Type: 'Purchase', Date: dateText(p.date), Reference: p._id.slice(-6).toUpperCase(), Customer: p.supplierName, Product: p.itemName, Taxable: p.total, GST: 0, Total: p.total, Quantity: p.quantity, Rate: p.unitRate }));
  const productionRows = production.map((p) => ({ Type: 'Production', Date: dateText(p.createdAt), Reference: p._id.slice(-6).toUpperCase(), Customer: p.supervisor, Product: `${p.productName} · ${p.goodOutput} good / ${p.plannedOutput} planned`, Taxable: p.materialCost, GST: '', Total: p.totalCost, 'Cost / packet': p.costPerPacket, 'Yield variance': p.yieldVariance, 'Consumption variance': p.consumption.map((c) => `${c.itemName} ${c.variance > 0 ? '+' : ''}${c.variance}%`).join(', ') }));
  const wastageRows = production.map((p) => ({ Type: 'Wastage', Date: dateText(p.createdAt), Reference: p._id.slice(-6).toUpperCase(), Customer: p.supervisor, Product: p.productName, Taxable: p.damaged, GST: '', Total: p.plannedOutput - p.goodOutput, 'Damaged packets': p.damaged, 'Yield variance': p.yieldVariance }));
  const costRows = production.map((p) => ({ Type: 'Cost per packet', Date: dateText(p.createdAt), Reference: p._id.slice(-6).toUpperCase(), Customer: p.supervisor, Product: p.productName, 'Material cost': p.materialCost, Labour: p.labor, 'Gas & power': p.utilities, 'Total production cost': p.totalCost, 'Good output': p.goodOutput, 'Cost / packet': p.costPerPacket, 'Selling price': p.sellingPrice, 'Profit / packet': p.profitPerPacket, 'Profit margin %': p.profitMargin, Total: p.totalCost }));
  const paymentRows = payments.map((p) => ({ Type: 'Payment', Date: dateText(p.date), Reference: p.invoiceNumber, Customer: p.customerName, Product: p.method, Taxable: p.amount, GST: '', Total: p.amount, 'Payment reference': p.reference || '' }));
  const outstandingRows = invoices.filter((invoice) => dec(invoice.total).gt(invoice.paid)).map((invoice) => ({ Type: 'Outstanding', Date: dateText(invoice.createdAt), Reference: invoice.number, Customer: invoice.customerName, Product: invoice.lines.map((line) => line.productName).join(', '), Taxable: invoice.taxable, GST: moneyRound(dec(invoice.cgst).plus(invoice.sgst).plus(invoice.igst)), Total: moneyRound(dec(invoice.total).minus(invoice.paid)), 'Invoice total': invoice.total, Paid: invoice.paid, Outstanding: moneyRound(dec(invoice.total).minus(invoice.paid)) }));
  const stockRows = (current.movements || []).map((move) => ({ Type: move.type, Date: dateText(move.createdAt), Reference: move.reference, Customer: move.user, Product: move.itemName, Quantity: move.quantity, Rate: move.unitRate ?? '', Total: move.balanceAfter }));
  const auditWindowStart = from ? new Date(`${from}T00:00:00`) : new Date(0);
  const auditWindowEnd = to ? new Date(`${to}T23:59:59.999`) : new Date();
  const auditRows = audit ? [
    ...audit.movements.map((item) => ({ Type: 'Stock movement · ' + item.type, At: item.createdAt, Reference: item.reference, Customer: item.user, Product: `${item.itemName} · ${item.quantity > 0 ? '+' : ''}${fmt(item.quantity)}`, Total: item.balanceAfter })),
    ...audit.orders.flatMap((item) => [
      { Type: 'Order submitted', At: item.createdAt, Reference: item._id.slice(-6).toUpperCase(), Customer: item.salesperson, Product: item.customerName, Total: item.total },
      ...(item.reviewedAt ? [{ Type: `Order ${item.status === 'Rejected' ? 'rejected' : 'approved'}`, At: item.reviewedAt, Reference: item._id.slice(-6).toUpperCase(), Customer: item.reviewedBy, Product: item.customerName, Total: item.total }] : []),
      ...(item.reviewChanges?.length ? [{ Type: 'Order terms edited', At: item.reviewedAt, Reference: item._id.slice(-6).toUpperCase(), Customer: item.reviewedBy, Product: item.reviewChanges.map((change) => `${change.productName}: ${change.quantityBefore} to ${change.quantityAfter} pkts, ${pdfMoney(change.priceBefore)} to ${pdfMoney(change.priceAfter)}`).join('; '), Total: item.total }] : []),
      ...(item.dispatchedAt ? [{ Type: 'Order dispatched', At: item.dispatchedAt, Reference: item._id.slice(-6).toUpperCase(), Customer: item.dispatchedBy, Product: item.customerName, Total: item.total }] : []),
    ]),
    ...audit.invoices.map((item) => ({ Type: 'Invoice created', At: item.createdAt, Reference: item.number, Customer: item.createdBy || 'System', Product: item.customerName, Total: item.total })),
    ...audit.purchases.map((item) => ({ Type: 'Purchase recorded', At: item.date, Reference: item._id.slice(-6).toUpperCase(), Customer: item.user, Product: `${item.itemName} · ${item.quantity}`, Total: item.total })),
    ...audit.production.map((item) => ({ Type: 'Production recorded', At: item.createdAt, Reference: item._id.slice(-6).toUpperCase(), Customer: item.supervisor, Product: item.productName, Total: item.totalCost })),
    ...audit.payments.map((item) => ({ Type: 'Payment recorded', At: item.date, Reference: item.invoiceNumber, Customer: item.user, Product: item.customerName, Total: item.amount })),
  ].filter((item) => { const at = new Date(item.At); return at >= auditWindowStart && at <= auditWindowEnd; })
    .sort((a, b) => new Date(b.At) - new Date(a.At))
    .map((item) => ({ Type: item.Type, Date: dateText(item.At), Reference: item.Reference, Customer: item.Customer, Product: item.Product, Total: item.Total })) : [];
  const reportSets = {
    sales: salesRows, customers: customerRows, products: productRows, gst: gstRows, purchases: purchaseRows,
    production: productionRows, wastage: wastageRows, costs: costRows, payments: paymentRows,
    outstanding: outstandingRows, stock: stockRows, audit: auditRows,
  };
  const [selectedReport, setSelectedReport] = useState('sales');
  const reportRows = reportSets[selectedReport] || salesRows;
  function exportFile(format) {
    const sheet = XLSX.utils.json_to_sheet(reportRows);
    const book = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(book, sheet, 'ERP Report');
    XLSX.writeFile(book, `smartfactory-${selectedReport}.${format === 'csv' ? 'csv' : 'xlsx'}`, format === 'csv' ? { bookType: 'csv' } : undefined);
  }
  function exportPdf() {
    const pdf = new jsPDF({ orientation: 'landscape' }); pdf.setFontSize(18); pdf.text('SmartFactory ERP · Period report', 14, 17); pdf.setFontSize(9); pdf.text(`${from || 'All time'} — ${to || 'Today'} · Generated ${dateText(new Date())}`, 14, 24);
    const header = (y) => {
      pdf.setFont(undefined, 'bold'); pdf.text('TYPE', 14, y); pdf.text('DATE', 45, y); pdf.text('REFERENCE', 74, y); pdf.text('CUSTOMER / OWNER', 110, y); pdf.text('DETAIL', 166, y); pdf.text('TOTAL', 260, y); pdf.setFont(undefined, 'normal');
    };
    let y = 34; header(y);
    for (const row of reportRows) {
      if (y > 190) { pdf.addPage(); y = 18; header(y); }
      y += 8; pdf.text(String(row.Type).slice(0, 19), 14, y); pdf.text(String(row.Date || ''), 45, y); pdf.text(String(row.Reference || '').slice(0, 19), 74, y); pdf.text(String(row.Customer || '').slice(0, 33), 110, y); pdf.text(String(row.Product || '').slice(0, 36), 166, y); pdf.text(pdfMoney(row.Total), 260, y);
    }
    pdf.save(`smartfactory-${selectedReport}.pdf`);
  }
  const reportCards = [
    { id: 'sales', title: 'Monthly sales register', subtitle: `${invoices.length} invoices`, icon: ShoppingCart, tone: 'blue' },
    { id: 'customers', title: 'Customer-wise sales', subtitle: `${customerRows.length} customers`, icon: Users, tone: 'violet' },
    { id: 'products', title: 'Product-wise sales', subtitle: `${productRows.length} products`, icon: Package, tone: 'green' },
    { id: 'gst', title: 'GST summary', subtitle: `${rupees(gstTotal)} output tax`, icon: FileText, tone: 'violet' },
    { id: 'purchases', title: 'Purchase register', subtitle: `${purchases.length} receipts`, icon: ArrowDownToLine, tone: 'amber' },
    { id: 'production', title: 'Production & variance', subtitle: `${production.length} production runs`, icon: Factory, tone: 'green' },
    { id: 'wastage', title: 'Wastage report', subtitle: `${production.reduce((s, p) => s + p.damaged, 0)} damaged packets`, icon: Activity, tone: 'amber' },
    { id: 'costs', title: 'Cost per packet', subtitle: 'Material, labour & utilities', icon: ChartNoAxesCombined, tone: 'blue' },
    { id: 'payments', title: 'Payment & collection', subtitle: `${payments.length} payments`, icon: CreditCard, tone: 'green' },
    { id: 'outstanding', title: 'Customer outstanding', subtitle: `${outstandingRows.length} open invoices`, icon: CircleAlert, tone: 'amber' },
    { id: 'stock', title: 'Raw material stock ledger', subtitle: `${stockRows.length} traceable movements`, icon: Boxes, tone: 'violet' },
    { id: 'audit', title: 'Audit trail', subtitle: `${auditRows.length} user-attributed events`, icon: ShieldCheck, tone: 'blue' },
  ];
  return <>
    <PageTitle eyebrow="FINANCE & COMPLIANCE" title="Reports & audit" description={readOnly ? 'Read-only audit access to traceable source records and period reporting.' : 'One view of sales, GST, purchasing, production costs and collections.'}>
      <span className="audit-badge"><ShieldCheck size={15} /> {readOnly ? 'READ ONLY · AUDITOR' : 'AUDIT TRAIL ENABLED'}</span>
    </PageTitle>
    <form className="panel report-filter" onSubmit={load}><div><b>Reporting period</b><span>Choose dates or leave blank for all available activity.</span></div><label>From<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label><label>To<input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label><button className="primary-btn" disabled={loading}><Search size={16} /> {loading ? 'Loading…' : 'Apply filters'}</button></form>
    <div className="report-card-grid">{reportCards.map((card) => <ReportCard key={card.id} {...card} selected={selectedReport === card.id} onClick={() => setSelectedReport(card.id)} />)}</div>
    <section className="panel table-panel"><div className="panel-heading"><div><h2>{reportCards.find((card) => card.id === selectedReport)?.title || 'Period report'}</h2><p>{reportRows.length} rows · filtered to the selected reporting period</p></div><div className="export-actions"><button className="export-btn" onClick={() => exportFile('xlsx')}>Excel</button><button className="export-btn" onClick={() => exportFile('csv')}>CSV</button><button className="export-btn" onClick={exportPdf}>PDF</button></div></div><div className="table-scroll"><table><thead><tr><th>TYPE</th><th>DATE</th><th>REFERENCE</th><th>CUSTOMER / OWNER</th><th>DETAIL</th><th className="right">AMOUNT / TOTAL</th></tr></thead><tbody>{reportRows.slice(0, 30).map((row, i) => <tr key={`${row.Type}-${row.Reference}-${i}`}><td><span className="category-chip">{row.Type}</span></td><td>{row.Date || '—'}</td><td className="mono-text">{row.Reference}</td><td>{row.Customer}</td><td>{row.Product}</td><td className="right strong-cell">{row.Total === '' || row.Total === undefined ? '—' : rupees(row.Total)}</td></tr>)}</tbody></table>{!reportRows.length && <div className="empty-state">No transactions found in this date range. Adjust the dates or record a transaction.</div>}</div></section>
  </>;
}
function ReportCard({ title, subtitle, icon: Icon, tone, selected, onClick }) {
  return <button className={`report-card ${selected ? 'selected-report' : ''}`} aria-pressed={selected} onClick={onClick}><span className={`report-icon ${tone}`}><Icon size={18} /></span><span><b>{title}</b><small>{subtitle}</small></span><ArrowUpRight size={16} /></button>;
}

export default App;
