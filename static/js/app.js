// ── ESTADO GLOBAL ─────────────────────────────────────────────────────────
let productos = [], clientes = [], ventas = [], usuariosData = [];
let ventaActual = [];
let editId = null, editClienteId = null, editUsuarioId = null;
let periodoActual = 7;
let charts = {};

// ── UTILS ─────────────────────────────────────────────────────────────────
const fmt = n => '$' + Number(n).toLocaleString('es-CL');
const ini = s => s.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);

function toast(msg, type = 'success') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.style.background = type === 'error' ? 'var(--red-bg)' : 'var(--green-bg)';
  t.style.color = type === 'error' ? 'var(--red)' : 'var(--green)';
  t.style.borderColor = type === 'error' ? '#4a0d0d' : '#0d4a1f';
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2500);
}

async function api(url, method = 'GET', body = null) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  if (res.status === 401) { window.location.href = '/login'; return null; }
  return res.ok ? res.json() : res.json().then(d => { throw new Error(d.error || 'Error'); });
}

function setTab(id, el) {
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  const panel = document.getElementById('tab-' + id);
  if (panel) panel.classList.add('active');
  if (el) el.classList.add('active');
  if (id === 'ventas') { poblarSelectVentas(); poblarSelectClientes(); }
  if (id === 'reportes') renderReportes();
  if (id === 'historial') renderHistorial();
  if (id === 'alertas') renderAlertas();
  if (id === 'clientes') renderClientes();
  if (id === 'usuarios') cargarUsuarios();
}

function updateStats() {
  document.getElementById('s-total').textContent = productos.length;
  document.getElementById('s-valor').textContent = fmt(productos.reduce((a, p) => a + p.stock * p.precio_venta, 0));
  document.getElementById('s-bajo').textContent = productos.filter(p => p.stock <= p.stock_minimo).length;
  const hoy = new Date().toLocaleDateString('es-CL');
  const ventasHoy = ventas.filter(v => new Date(v.creado_en).toLocaleDateString('es-CL') === hoy);
  document.getElementById('s-ventas').textContent = fmt(ventasHoy.reduce((a, v) => a + v.total, 0));
  document.getElementById('s-clientes').textContent = clientes.length;
}

function stockBadge(p) {
  if (p.stock === 0) return '<span class="badge out">Agotado</span>';
  if (p.stock <= p.stock_minimo) return '<span class="badge warn">Bajo</span>';
  return '<span class="badge ok">OK</span>';
}
function tipoBadge(t) {
  if (t === 'VIP') return '<span class="badge vip">VIP</span>';
  if (t === 'Mayorista') return '<span class="badge info">Mayorista</span>';
  return '<span class="badge ok">Regular</span>';
}
function rolBadge(r) {
  const map = { admin: '<span class="badge admin">Admin</span>', vendedor: '<span class="badge vendedor">Vendedor</span>' };
  return map[r] || '<span class="badge lectura">Lectura</span>';
}

// ── INVENTARIO ────────────────────────────────────────────────────────────
async function cargarProductos() {
  productos = await api('/api/productos') || [];
  renderTabla();
}

function renderTabla() {
  const q = document.getElementById('buscar').value.toLowerCase();
  const cat = document.getElementById('filtro-cat').value;
  const f = productos.filter(p => p.nombre.toLowerCase().includes(q) && (!cat || p.categoria === cat));
  const b = document.getElementById('tabla-body');
  const editable = PERMS.inventario;
  if (!f.length) { b.innerHTML = '<tr><td colspan="6" class="empty">Sin resultados</td></tr>'; return; }
  b.innerHTML = f.map(p => `<tr>
    <td style="font-weight:500">${p.nombre}</td>
    <td style="color:var(--text2)">${p.categoria}</td>
    <td style="font-family:'IBM Plex Mono',monospace">${p.stock}</td>
    <td style="font-family:'IBM Plex Mono',monospace">${fmt(p.precio_venta)}</td>
    <td>${stockBadge(p)}</td>
    <td><div class="actions">
      ${editable ? `<button class="btn btn-ghost btn-sm" onclick="editarProducto(${p.id})">Editar</button>
      <button class="btn btn-danger btn-sm" onclick="eliminarProducto(${p.id})">Borrar</button>` : '<span style="color:var(--text3);font-size:11px">Solo lectura</span>'}
    </div></td></tr>`).join('');
  updateStats();
}

function showFormProducto() {
  editId = null;
  document.getElementById('form-titulo').textContent = 'Nuevo producto';
  ['f-nombre', 'f-stock', 'f-min', 'f-costo', 'f-precio'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('f-cat').value = 'Almacén';
  document.getElementById('form-producto').style.display = 'block';
}
function cancelarForm() { document.getElementById('form-producto').style.display = 'none'; }

async function guardarProducto() {
  const nombre = document.getElementById('f-nombre').value.trim();
  if (!nombre) { toast('Ingresa un nombre', 'error'); return; }
  const d = {
    nombre, categoria: document.getElementById('f-cat').value,
    stock: parseInt(document.getElementById('f-stock').value) || 0,
    stock_minimo: parseInt(document.getElementById('f-min').value) || 0,
    precio_costo: parseInt(document.getElementById('f-costo').value) || 0,
    precio_venta: parseInt(document.getElementById('f-precio').value) || 0
  };
  try {
    if (editId) {
      const updated = await api(`/api/productos/${editId}`, 'PUT', d);
      productos = productos.map(p => p.id === editId ? updated : p);
      toast('Producto actualizado');
    } else {
      const nuevo = await api('/api/productos', 'POST', d);
      productos.push(nuevo);
      toast('Producto agregado');
    }
    cancelarForm(); renderTabla();
  } catch (e) { toast(e.message, 'error'); }
}

function editarProducto(id) {
  editId = id;
  const p = productos.find(p => p.id === id);
  document.getElementById('form-titulo').textContent = 'Editar producto';
  document.getElementById('f-nombre').value = p.nombre;
  document.getElementById('f-cat').value = p.categoria;
  document.getElementById('f-stock').value = p.stock;
  document.getElementById('f-min').value = p.stock_minimo;
  document.getElementById('f-costo').value = p.precio_costo;
  document.getElementById('f-precio').value = p.precio_venta;
  document.getElementById('form-producto').style.display = 'block';
  document.getElementById('form-producto').scrollIntoView({ behavior: 'smooth' });
}

async function eliminarProducto(id) {
  if (!confirm('¿Eliminar este producto?')) return;
  try {
    await api(`/api/productos/${id}`, 'DELETE');
    productos = productos.filter(p => p.id !== id);
    toast('Producto eliminado'); renderTabla();
  } catch (e) { toast(e.message, 'error'); }
}

// ── VENTAS ────────────────────────────────────────────────────────────────
function poblarSelectVentas() {
  const sel = document.getElementById('v-producto');
  if (!sel) return;
  sel.innerHTML = '<option value="">Seleccionar...</option>' +
    productos.filter(p => p.stock > 0)
      .map(p => `<option value="${p.id}">${p.nombre} — ${fmt(p.precio_venta)} (stock: ${p.stock})</option>`)
      .join('');
}
function poblarSelectClientes() {
  const sel = document.getElementById('v-cliente');
  if (!sel) return;
  sel.innerHTML = '<option value="">Público general</option>' +
    clientes.map(c => `<option value="${c.id}">${c.nombre}</option>`).join('');
}

function agregarItemVenta() {
  const pid = parseInt(document.getElementById('v-producto').value);
  const cant = parseInt(document.getElementById('v-cantidad').value) || 1;
  if (!pid) { toast('Selecciona un producto', 'error'); return; }
  const p = productos.find(p => p.id === pid);
  if (cant > p.stock) { toast('Stock insuficiente', 'error'); return; }
  const ex = ventaActual.find(i => i.producto_id === pid);
  if (ex) {
    if (ex.cantidad + cant > p.stock) { toast('Stock insuficiente', 'error'); return; }
    ex.cantidad += cant;
  } else {
    ventaActual.push({ producto_id: pid, nombre_producto: p.nombre, precio_unitario: p.precio_venta, cantidad: cant });
  }
  renderVentaActual();
}

function renderVentaActual() {
  const c = document.getElementById('venta-items');
  if (!ventaActual.length) {
    c.innerHTML = '<div class="empty">Sin productos</div>';
    document.getElementById('v-total').textContent = '$0'; return;
  }
  c.innerHTML = ventaActual.map((item, idx) => `<div class="venta-item">
    <span>${item.nombre_producto} × ${item.cantidad}</span>
    <span style="display:flex;align-items:center;gap:8px">
      <span style="font-family:'IBM Plex Mono',monospace">${fmt(item.precio_unitario * item.cantidad)}</span>
      <button class="btn btn-danger btn-sm" onclick="quitarItem(${idx})">✕</button>
    </span></div>`).join('');
  document.getElementById('v-total').textContent = fmt(ventaActual.reduce((a, i) => a + i.precio_unitario * i.cantidad, 0));
}

function quitarItem(i) { ventaActual.splice(i, 1); renderVentaActual(); }
function cancelarVenta() { ventaActual = []; renderVentaActual(); }

async function confirmarVenta() {
  if (!ventaActual.length) { toast('Agrega productos primero', 'error'); return; }
  const clienteId = parseInt(document.getElementById('v-cliente').value) || null;
  const pago = document.getElementById('v-pago').value;
  try {
    const res = await api('/api/ventas', 'POST', { items: ventaActual, cliente_id: clienteId, metodo_pago: pago });
    toast(`Venta confirmada — ${fmt(res.total)}`);
    // Actualizar stock local
    ventaActual.forEach(item => {
      const p = productos.find(p => p.id === item.producto_id);
      if (p) p.stock -= item.cantidad;
    });
    ventaActual = []; renderVentaActual(); updateStats();
    ventas = await api('/api/ventas') || ventas;
  } catch (e) { toast(e.message, 'error'); }
}

// ── CLIENTES ──────────────────────────────────────────────────────────────
async function cargarClientes() {
  clientes = await api('/api/clientes') || [];
  renderClientes();
}

function renderClientes() {
  const q = document.getElementById('buscar-cliente').value.toLowerCase();
  const tipo = document.getElementById('filtro-tipo').value;
  const f = clientes.filter(c => c.nombre.toLowerCase().includes(q) && (!tipo || c.tipo === tipo));
  const b = document.getElementById('tabla-clientes');
  const editable = PERMS.clientes;
  if (!f.length) { b.innerHTML = '<tr><td colspan="6" class="empty">Sin clientes</td></tr>'; return; }
  b.innerHTML = f.map(c => {
    const cv = ventas.filter(v => v.cliente_id === c.id);
    const total = cv.reduce((a, v) => a + v.total, 0);
    return `<tr>
      <td><div class="cliente-info"><div class="avatar">${ini(c.nombre)}</div>
        <div><div style="font-weight:500">${c.nombre}</div>
        <div style="font-size:11px;color:var(--text3)">${c.email || '—'}</div></div></div></td>
      <td style="color:var(--text2)">${c.telefono || '—'}</td>
      <td>${tipoBadge(c.tipo)}</td>
      <td style="font-family:'IBM Plex Mono',monospace">${cv.length}</td>
      <td style="font-family:'IBM Plex Mono',monospace;color:var(--green)">${fmt(total)}</td>
      <td><div class="actions">
        <button class="btn btn-ghost btn-sm" onclick="verDetalleCliente(${c.id})">Ver</button>
        ${editable ? `<button class="btn btn-danger btn-sm" onclick="eliminarCliente(${c.id})">Borrar</button>` : ''}
      </div></td></tr>`;
  }).join('');
  updateStats();
}

function verDetalleCliente(id) {
  const c = clientes.find(c => c.id === id);
  const cv = ventas.filter(v => v.cliente_id === id);
  const total = cv.reduce((a, v) => a + v.total, 0);
  document.getElementById('vista-clientes').style.display = 'none';
  document.getElementById('vista-detalle').style.display = 'block';
  document.getElementById('detalle-card').innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">
      <div class="avatar" style="width:44px;height:44px;font-size:16px">${ini(c.nombre)}</div>
      <div><div style="font-size:15px;font-weight:600">${c.nombre}</div>
      <div style="font-size:12px;color:var(--text2)">${c.tipo}</div></div>
      ${tipoBadge(c.tipo)}
    </div>
    <div style="display:flex;gap:14px;flex-wrap:wrap;margin-bottom:12px">
      <div style="font-size:12px;color:var(--text2)">Tel: <strong style="color:var(--text)">${c.telefono || '—'}</strong></div>
      <div style="font-size:12px;color:var(--text2)">Compras: <strong style="color:var(--text)">${cv.length}</strong></div>
      <div style="font-size:12px;color:var(--text2)">Total: <strong style="color:var(--green)">${fmt(total)}</strong></div>
    </div>
    ${c.notas ? `<div style="font-size:12px;color:var(--text2);padding:8px;background:var(--bg3);border-radius:6px;margin-bottom:12px">${c.notas}</div>` : ''}
    ${cv.length ? `<table class="mini-table"><thead><tr><th>Fecha</th><th>Productos</th><th>Total</th></tr></thead><tbody>
      ${cv.slice(0, 6).map(v => `<tr>
        <td>${new Date(v.creado_en).toLocaleDateString('es-CL')}</td>
        <td>${v.items ? v.items.map(i => i.nombre_producto + '×' + i.cantidad).join(', ') : '—'}</td>
        <td style="color:var(--green)">${fmt(v.total)}</td></tr>`).join('')}
    </tbody></table>` : '<div class="empty">Sin compras registradas</div>'}`;
}

function volverClientes() {
  document.getElementById('vista-clientes').style.display = 'block';
  document.getElementById('vista-detalle').style.display = 'none';
}

function showFormCliente() {
  editClienteId = null;
  document.getElementById('fc-titulo').textContent = 'Nuevo cliente';
  ['c-nombre', 'c-tel', 'c-email', 'c-notas'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('c-tipo').value = 'Regular';
  document.getElementById('form-cliente').style.display = 'block';
}
function cancelarFormCliente() { document.getElementById('form-cliente').style.display = 'none'; }

async function guardarCliente() {
  const nombre = document.getElementById('c-nombre').value.trim();
  if (!nombre) { toast('Ingresa el nombre', 'error'); return; }
  const d = {
    nombre,
    telefono: document.getElementById('c-tel').value.trim(),
    email: document.getElementById('c-email').value.trim(),
    tipo: document.getElementById('c-tipo').value,
    notas: document.getElementById('c-notas').value.trim()
  };
  try {
    if (editClienteId) {
      const updated = await api(`/api/clientes/${editClienteId}`, 'PUT', d);
      clientes = clientes.map(c => c.id === editClienteId ? updated : c);
      toast('Cliente actualizado');
    } else {
      const nuevo = await api('/api/clientes', 'POST', d);
      clientes.push(nuevo);
      toast('Cliente agregado');
    }
    cancelarFormCliente(); renderClientes(); updateStats();
  } catch (e) { toast(e.message, 'error'); }
}

async function eliminarCliente(id) {
  if (!confirm('¿Eliminar este cliente?')) return;
  try {
    await api(`/api/clientes/${id}`, 'DELETE');
    clientes = clientes.filter(c => c.id !== id);
    toast('Cliente eliminado'); renderClientes(); updateStats();
  } catch (e) { toast(e.message, 'error'); }
}

// ── HISTORIAL ─────────────────────────────────────────────────────────────
function renderHistorial() {
  const b = document.getElementById('historial-body');
  if (!ventas.length) { b.innerHTML = '<tr><td colspan="5" class="empty">Sin ventas</td></tr>'; return; }
  b.innerHTML = ventas.slice(0, 50).map(v => `<tr>
    <td style="color:var(--text2);font-family:'IBM Plex Mono',monospace;font-size:11px">
      ${new Date(v.creado_en).toLocaleDateString('es-CL')} ${new Date(v.creado_en).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}</td>
    <td style="color:var(--purple);font-size:12px">${v.usuario_nombre || '—'}</td>
    <td>${v.cliente_nombre || '<span style="color:var(--text3)">General</span>'}</td>
    <td style="font-size:12px">${v.items ? v.items.map(i => i.nombre_producto + '×' + i.cantidad).join(', ') : '—'}</td>
    <td style="font-family:'IBM Plex Mono',monospace;color:var(--green);font-weight:600">${fmt(v.total)}</td></tr>`).join('');
}

// ── ALERTAS ───────────────────────────────────────────────────────────────
function renderAlertas() {
  const c = document.getElementById('alertas-body');
  const bajos = productos.filter(p => p.stock <= p.stock_minimo);
  if (!bajos.length) { c.innerHTML = '<div class="alert success">Todo el stock está en nivel normal.</div>'; return; }
  c.innerHTML = bajos.map(p => `<div class="alert ${p.stock === 0 ? 'error' : 'warn'}">
    <strong>${p.nombre}</strong> — ${p.stock === 0 ? 'Agotado' : `Stock bajo: ${p.stock} unidades (mínimo: ${p.stock_minimo})`}
    ${PERMS.inventario ? `<button class="btn btn-ghost btn-sm" style="float:right;margin-top:-2px" onclick="editarProducto(${p.id});setTab('inventario',document.querySelector('.tab'))">Reponer</button>` : ''}
  </div>`).join('');
}

// ── REPORTES ──────────────────────────────────────────────────────────────
function destroyChart(id) { if (charts[id]) { charts[id].destroy(); delete charts[id]; } }
function setPeriodo(dias, el) {
  periodoActual = dias;
  document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
  renderReportes();
}

async function renderReportes() {
  const data = await api(`/api/reportes?dias=${periodoActual}`);
  if (!data) return;
  const vf = data.ventas;
  const ingresos = vf.reduce((a, v) => a + v.total, 0);
  const nv = vf.length;
  document.getElementById('r-ingresos').textContent = fmt(ingresos);
  document.getElementById('r-nventas').textContent = nv;
  document.getElementById('r-ticket').textContent = fmt(nv ? Math.round(ingresos / nv) : 0);
  const ganancia = vf.reduce((a, v) => a + (v.items || []).reduce((b, i) => b + 0, 0), 0);
  document.getElementById('r-ganancia').textContent = fmt(ganancia);
  const COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#3b82f6', '#ef4444', '#a78bfa'];
  const gc = 'rgba(42,52,72,0.5)', tc = '#8899bb';
  // Ventas por día
  const diasSet = {};
  vf.forEach(v => {
    const d = new Date(v.creado_en).toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit' });
    diasSet[d] = (diasSet[d] || 0) + v.total;
  });
  const dk = Object.keys(diasSet);
  destroyChart('vd');
  const cvd = document.getElementById('chart-ventas-dia');
  if (cvd) charts['vd'] = new Chart(cvd.getContext('2d'), {
    type: 'bar', data: { labels: dk, datasets: [{ data: dk.map(k => diasSet[k]), backgroundColor: '#6366f1', borderRadius: 4, borderSkipped: false }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { ticks: { color: tc, font: { size: 10 } }, grid: { color: gc } }, y: { ticks: { color: tc, font: { size: 10 }, callback: v => fmt(v) }, grid: { color: gc } } } }
  });
  // Método de pago
  const ps = {}; vf.forEach(v => { ps[v.metodo_pago] = (ps[v.metodo_pago] || 0) + 1; });
  destroyChart('pg');
  const cpg = document.getElementById('chart-pago');
  if (cpg) charts['pg'] = new Chart(cpg.getContext('2d'), {
    type: 'doughnut', data: { labels: Object.keys(ps), datasets: [{ data: Object.values(ps), backgroundColor: COLORS, borderWidth: 0, hoverOffset: 6 }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { color: tc, font: { size: 11 }, padding: 8, boxWidth: 12 } } } }
  });
}

// ── USUARIOS ──────────────────────────────────────────────────────────────
async function cargarUsuarios() {
  usuariosData = await api('/api/usuarios') || [];
  renderUsuarios();
  renderLog();
}

function renderUsuarios() {
  const b = document.getElementById('tabla-usuarios');
  if (!b) return;
  b.innerHTML = usuariosData.map(u => `<tr>
    <td style="font-weight:500">${u.nombre}</td>
    <td style="font-family:'IBM Plex Mono',monospace;color:var(--text2)">${u.user}</td>
    <td>${rolBadge(u.rol)}</td>
    <td style="color:var(--text3);font-size:12px">${u.last_login ? new Date(u.last_login).toLocaleDateString('es-CL') : 'Nunca'}</td>
    <td><span class="badge ${u.activo ? 'ok' : 'out'}">${u.activo ? 'Activo' : 'Inactivo'}</span></td>
    <td><div class="actions">
      <button class="btn btn-ghost btn-sm" onclick="editarUsuario(${u.id})">Editar</button>
      <button class="btn btn-ghost btn-sm" onclick="toggleUsuario(${u.id})">${u.activo ? 'Desactivar' : 'Activar'}</button>
    </div></td></tr>`).join('');
}

async function renderLog() {
  const c = document.getElementById('log-actividad');
  if (!c) return;
  const data = await api('/api/actividad') || [];
  if (!data.length) { c.innerHTML = '<div class="empty">Sin actividad registrada</div>'; return; }
  c.innerHTML = data.map(l => `<div class="log-item">
    <span class="log-time">${new Date(l.creado_en).toLocaleDateString('es-CL')} ${new Date(l.creado_en).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}</span>
    <span class="log-user">${l.nombre_usuario}</span>
    <span class="log-msg">${l.mensaje}</span>
  </div>`).join('');
}

const ROLE_PERMS = {
  admin: { inventario: true, ventas: true, clientes: true, reportes: true, usuarios: true, exportar: true },
  vendedor: { inventario: true, ventas: true, clientes: true, reportes: false, usuarios: false, exportar: false },
  bodega: { inventario: false, ventas: false, clientes: false, reportes: false, usuarios: false, exportar: false }
};

function updatePermCheckboxes() {
  const rol = document.getElementById('u-rol').value;
  const perms = ROLE_PERMS[rol] || ROLE_PERMS.bodega;
  Object.keys(perms).forEach(k => { const el = document.getElementById('p-' + k); if (el) el.checked = perms[k]; });
}

function showFormUsuario() {
  editUsuarioId = null;
  document.getElementById('fu-titulo').textContent = 'Nuevo usuario';
  ['u-nombre', 'u-user', 'u-pass'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('u-rol').value = 'vendedor';
  updatePermCheckboxes();
  document.getElementById('form-usuario').style.display = 'block';
}
function cancelarFormUsuario() { document.getElementById('form-usuario').style.display = 'none'; }

async function guardarUsuario() {
  const nombre = document.getElementById('u-nombre').value.trim();
  const user = document.getElementById('u-user').value.trim();
  const password = document.getElementById('u-pass').value;
  if (!nombre || !user) { toast('Completa nombre y usuario', 'error'); return; }
  const perms = {};
  ['inventario', 'ventas', 'clientes', 'reportes', 'usuarios', 'exportar'].forEach(k => {
    const el = document.getElementById('p-' + k); perms[k] = el ? el.checked : false;
  });
  const d = { nombre, user, password, rol: document.getElementById('u-rol').value, perms };
  try {
    if (editUsuarioId) {
      const updated = await api(`/api/usuarios/${editUsuarioId}`, 'PUT', d);
      usuariosData = usuariosData.map(u => u.id === editUsuarioId ? updated : u);
      toast('Usuario actualizado');
    } else {
      const nuevo = await api('/api/usuarios', 'POST', d);
      usuariosData.push(nuevo);
      toast('Usuario creado');
    }
    cancelarFormUsuario(); renderUsuarios();
  } catch (e) { toast(e.message, 'error'); }
}

function editarUsuario(id) {
  editUsuarioId = id;
  const u = usuariosData.find(u => u.id === id);
  document.getElementById('fu-titulo').textContent = 'Editar usuario';
  document.getElementById('u-nombre').value = u.nombre;
  document.getElementById('u-user').value = u.user;
  document.getElementById('u-pass').value = '';
  document.getElementById('u-rol').value = u.rol;
  const perms = typeof u.perms === 'string' ? JSON.parse(u.perms) : u.perms;
  Object.keys(perms).forEach(k => { const el = document.getElementById('p-' + k); if (el) el.checked = perms[k]; });
  document.getElementById('form-usuario').style.display = 'block';
  document.getElementById('form-usuario').scrollIntoView({ behavior: 'smooth' });
}

async function toggleUsuario(id) {
  try {
    const res = await api(`/api/usuarios/${id}/toggle`, 'POST');
    const u = usuariosData.find(u => u.id === id);
    if (u) u.activo = res.activo;
    toast(res.activo ? 'Usuario activado' : 'Usuario desactivado');
    renderUsuarios();
  } catch (e) { toast(e.message, 'error'); }
}

// ── INIT ──────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('btn-logout').addEventListener('click', async () => {
    await fetch('/api/logout', { method: 'POST' });
    window.location.href = '/login';
  });
  document.getElementById('store-label').textContent = document.title || 'Mi negocio';
  await Promise.all([cargarProductos(), cargarClientes()]);
  ventas = await api('/api/ventas') || [];
  updateStats();
});
