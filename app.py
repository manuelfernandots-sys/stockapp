from flask import Flask, render_template, request, jsonify, session, redirect, url_for
from functools import wraps
import sqlite3, hashlib, os, json
from datetime import datetime

app = Flask(__name__)
app.secret_key = os.environ.get('SECRET_KEY', 'cambia-esta-clave-en-produccion')
DATABASE = 'stockapp.db'

# ── BASE DE DATOS ──────────────────────────────────────────────────────────

def get_db():
    db = sqlite3.connect(DATABASE)
    db.row_factory = sqlite3.Row
    return db

def init_db():
    db = get_db()
    db.executescript('''
        CREATE TABLE IF NOT EXISTS usuarios (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nombre TEXT NOT NULL,
            user TEXT UNIQUE NOT NULL,
            pass_hash TEXT NOT NULL,
            rol TEXT NOT NULL DEFAULT 'vendedor',
            perms TEXT NOT NULL DEFAULT '{}',
            activo INTEGER NOT NULL DEFAULT 1,
            last_login TEXT
        );
        CREATE TABLE IF NOT EXISTS productos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nombre TEXT NOT NULL,
            categoria TEXT NOT NULL DEFAULT 'Otro',
            stock INTEGER NOT NULL DEFAULT 0,
            stock_minimo INTEGER NOT NULL DEFAULT 5,
            precio_costo INTEGER NOT NULL DEFAULT 0,
            precio_venta INTEGER NOT NULL DEFAULT 0,
            creado_en TEXT DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS clientes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nombre TEXT NOT NULL,
            telefono TEXT DEFAULT '',
            email TEXT DEFAULT '',
            tipo TEXT NOT NULL DEFAULT 'Regular',
            notas TEXT DEFAULT '',
            creado_en TEXT DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS ventas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            total INTEGER NOT NULL,
            metodo_pago TEXT NOT NULL DEFAULT 'Efectivo',
            cliente_id INTEGER REFERENCES clientes(id),
            usuario_id INTEGER REFERENCES usuarios(id),
            creado_en TEXT DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS venta_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            venta_id INTEGER NOT NULL REFERENCES ventas(id),
            producto_id INTEGER NOT NULL REFERENCES productos(id),
            nombre_producto TEXT NOT NULL,
            precio_unitario INTEGER NOT NULL,
            cantidad INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS actividad (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            usuario_id INTEGER REFERENCES usuarios(id),
            nombre_usuario TEXT,
            mensaje TEXT NOT NULL,
            creado_en TEXT DEFAULT CURRENT_TIMESTAMP
        );
    ''')
    # Crear admin por defecto si no existe
    admin = db.execute('SELECT id FROM usuarios WHERE user = ?', ('admin',)).fetchone()
    if not admin:
        perms_admin = json.dumps({
            'inventario': True, 'ventas': True, 'clientes': True,
            'reportes': True, 'usuarios': True, 'exportar': True
        })
        perms_vendedor = json.dumps({
            'inventario': True, 'ventas': True, 'clientes': True,
            'reportes': False, 'usuarios': False, 'exportar': False
        })
        perms_bodega = json.dumps({
            'inventario': False, 'ventas': False, 'clientes': False,
            'reportes': False, 'usuarios': False, 'exportar': False
        })
        db.execute('INSERT INTO usuarios (nombre, user, pass_hash, rol, perms) VALUES (?,?,?,?,?)',
            ('Administrador', 'admin', hash_pass('admin123'), 'admin', perms_admin))
        db.execute('INSERT INTO usuarios (nombre, user, pass_hash, rol, perms) VALUES (?,?,?,?,?)',
            ('Vendedor Demo', 'vendedor', hash_pass('venta123'), 'vendedor', perms_vendedor))
        db.execute('INSERT INTO usuarios (nombre, user, pass_hash, rol, perms) VALUES (?,?,?,?,?)',
            ('Bodega Demo', 'bodega', hash_pass('bodega123'), 'bodega', perms_bodega))
        # Productos de ejemplo
        db.execute("INSERT INTO productos (nombre, categoria, stock, stock_minimo, precio_costo, precio_venta) VALUES ('Arroz 1kg','Almacén',15,5,800,1200)")
        db.execute("INSERT INTO productos (nombre, categoria, stock, stock_minimo, precio_costo, precio_venta) VALUES ('Aceite vegetal','Almacén',3,5,2000,2800)")
        db.execute("INSERT INTO productos (nombre, categoria, stock, stock_minimo, precio_costo, precio_venta) VALUES ('Leche entera 1L','Lácteos',8,10,900,1100)")
        db.execute("INSERT INTO productos (nombre, categoria, stock, stock_minimo, precio_costo, precio_venta) VALUES ('Bebida 1.5L','Bebidas',20,6,700,1000)")
        db.execute("INSERT INTO clientes (nombre, telefono, tipo) VALUES ('María González','+56 9 8765 4321','VIP')")
        db.execute("INSERT INTO clientes (nombre, telefono, tipo) VALUES ('Pedro Soto','+56 9 1234 5678','Regular')")
        db.commit()
    db.close()

def hash_pass(password):
    return hashlib.sha256(password.encode()).hexdigest()

def log_actividad(db, mensaje):
    uid = session.get('usuario_id')
    nombre = session.get('usuario_nombre', 'Sistema')
    db.execute('INSERT INTO actividad (usuario_id, nombre_usuario, mensaje) VALUES (?,?,?)',
               (uid, nombre, mensaje))

# ── DECORADORES ───────────────────────────────────────────────────────────

def login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if 'usuario_id' not in session:
            return jsonify({'error': 'No autenticado'}), 401
        return f(*args, **kwargs)
    return decorated

def perm_required(permiso):
    def decorator(f):
        @wraps(f)
        def decorated(*args, **kwargs):
            if 'usuario_id' not in session:
                return jsonify({'error': 'No autenticado'}), 401
            perms = session.get('perms', {})
            if not perms.get(permiso):
                return jsonify({'error': 'Sin permiso'}), 403
            return f(*args, **kwargs)
        return decorated
    return decorator

# ── VISTAS ─────────────────────────────────────────────────────────────────

@app.route('/')
def index():
    if 'usuario_id' not in session:
        return redirect(url_for('login'))
    return render_template('index.html',
        usuario_nombre=session.get('usuario_nombre'),
        usuario_rol=session.get('usuario_rol'),
        perms=session.get('perms', {}))

@app.route('/login')
def login():
    if 'usuario_id' in session:
        return redirect(url_for('index'))
    return render_template('login.html')

# ── AUTH API ───────────────────────────────────────────────────────────────

@app.route('/api/login', methods=['POST'])
def api_login():
    data = request.get_json()
    user = data.get('user', '').strip()
    password = data.get('password', '')
    db = get_db()
    u = db.execute('SELECT * FROM usuarios WHERE user=? AND pass_hash=? AND activo=1',
                   (user, hash_pass(password))).fetchone()
    if not u:
        db.close()
        return jsonify({'error': 'Usuario o contraseña incorrectos'}), 401
    session['usuario_id'] = u['id']
    session['usuario_nombre'] = u['nombre']
    session['usuario_rol'] = u['rol']
    session['perms'] = json.loads(u['perms'])
    db.execute('UPDATE usuarios SET last_login=? WHERE id=?',
               (datetime.now().isoformat(), u['id']))
    db.execute('INSERT INTO actividad (usuario_id, nombre_usuario, mensaje) VALUES (?,?,?)',
               (u['id'], u['nombre'], 'Inició sesión'))
    db.commit()
    db.close()
    return jsonify({'ok': True, 'nombre': u['nombre'], 'rol': u['rol'],
                    'perms': json.loads(u['perms'])})

@app.route('/api/logout', methods=['POST'])
def api_logout():
    if 'usuario_id' in session:
        db = get_db()
        log_actividad(db, 'Cerró sesión')
        db.commit(); db.close()
    session.clear()
    return jsonify({'ok': True})

# ── PRODUCTOS API ──────────────────────────────────────────────────────────

@app.route('/api/productos', methods=['GET'])
@login_required
def get_productos():
    db = get_db()
    rows = db.execute('SELECT * FROM productos ORDER BY nombre').fetchall()
    db.close()
    return jsonify([dict(r) for r in rows])

@app.route('/api/productos', methods=['POST'])
@perm_required('inventario')
def crear_producto():
    d = request.get_json()
    db = get_db()
    cur = db.execute(
        'INSERT INTO productos (nombre, categoria, stock, stock_minimo, precio_costo, precio_venta) VALUES (?,?,?,?,?,?)',
        (d['nombre'], d['categoria'], d['stock'], d['stock_minimo'], d['precio_costo'], d['precio_venta']))
    log_actividad(db, f"Agregó producto: {d['nombre']}")
    db.commit()
    pid = cur.lastrowid
    p = db.execute('SELECT * FROM productos WHERE id=?', (pid,)).fetchone()
    db.close()
    return jsonify(dict(p)), 201

@app.route('/api/productos/<int:pid>', methods=['PUT'])
@perm_required('inventario')
def actualizar_producto(pid):
    d = request.get_json()
    db = get_db()
    db.execute(
        'UPDATE productos SET nombre=?, categoria=?, stock=?, stock_minimo=?, precio_costo=?, precio_venta=? WHERE id=?',
        (d['nombre'], d['categoria'], d['stock'], d['stock_minimo'], d['precio_costo'], d['precio_venta'], pid))
    log_actividad(db, f"Editó producto: {d['nombre']}")
    db.commit()
    p = db.execute('SELECT * FROM productos WHERE id=?', (pid,)).fetchone()
    db.close()
    return jsonify(dict(p))

@app.route('/api/productos/<int:pid>', methods=['DELETE'])
@perm_required('inventario')
def eliminar_producto(pid):
    db = get_db()
    p = db.execute('SELECT nombre FROM productos WHERE id=?', (pid,)).fetchone()
    if p:
        log_actividad(db, f"Eliminó producto: {p['nombre']}")
        db.execute('DELETE FROM productos WHERE id=?', (pid,))
        db.commit()
    db.close()
    return jsonify({'ok': True})

# ── CLIENTES API ───────────────────────────────────────────────────────────

@app.route('/api/clientes', methods=['GET'])
@login_required
def get_clientes():
    db = get_db()
    rows = db.execute('SELECT * FROM clientes ORDER BY nombre').fetchall()
    db.close()
    return jsonify([dict(r) for r in rows])

@app.route('/api/clientes', methods=['POST'])
@perm_required('clientes')
def crear_cliente():
    d = request.get_json()
    db = get_db()
    cur = db.execute(
        'INSERT INTO clientes (nombre, telefono, email, tipo, notas) VALUES (?,?,?,?,?)',
        (d['nombre'], d.get('telefono',''), d.get('email',''), d.get('tipo','Regular'), d.get('notas','')))
    log_actividad(db, f"Agregó cliente: {d['nombre']}")
    db.commit()
    c = db.execute('SELECT * FROM clientes WHERE id=?', (cur.lastrowid,)).fetchone()
    db.close()
    return jsonify(dict(c)), 201

@app.route('/api/clientes/<int:cid>', methods=['PUT'])
@perm_required('clientes')
def actualizar_cliente(cid):
    d = request.get_json()
    db = get_db()
    db.execute(
        'UPDATE clientes SET nombre=?, telefono=?, email=?, tipo=?, notas=? WHERE id=?',
        (d['nombre'], d.get('telefono',''), d.get('email',''), d.get('tipo','Regular'), d.get('notas',''), cid))
    log_actividad(db, f"Editó cliente: {d['nombre']}")
    db.commit()
    c = db.execute('SELECT * FROM clientes WHERE id=?', (cid,)).fetchone()
    db.close()
    return jsonify(dict(c))

@app.route('/api/clientes/<int:cid>', methods=['DELETE'])
@perm_required('clientes')
def eliminar_cliente(cid):
    db = get_db()
    c = db.execute('SELECT nombre FROM clientes WHERE id=?', (cid,)).fetchone()
    if c:
        log_actividad(db, f"Eliminó cliente: {c['nombre']}")
        db.execute('DELETE FROM clientes WHERE id=?', (cid,))
        db.commit()
    db.close()
    return jsonify({'ok': True})

# ── VENTAS API ─────────────────────────────────────────────────────────────

@app.route('/api/ventas', methods=['GET'])
@login_required
def get_ventas():
    db = get_db()
    ventas = db.execute(
        'SELECT v.*, c.nombre as cliente_nombre, u.nombre as usuario_nombre FROM ventas v '
        'LEFT JOIN clientes c ON v.cliente_id = c.id '
        'LEFT JOIN usuarios u ON v.usuario_id = u.id '
        'ORDER BY v.creado_en DESC LIMIT 200').fetchall()
    result = []
    for v in ventas:
        vd = dict(v)
        items = db.execute(
            'SELECT * FROM venta_items WHERE venta_id=?', (v['id'],)).fetchall()
        vd['items'] = [dict(i) for i in items]
        result.append(vd)
    db.close()
    return jsonify(result)

@app.route('/api/ventas', methods=['POST'])
@perm_required('ventas')
def crear_venta():
    d = request.get_json()
    items = d.get('items', [])
    if not items:
        return jsonify({'error': 'Sin productos'}), 400
    db = get_db()
    # Validar stock
    for item in items:
        p = db.execute('SELECT stock FROM productos WHERE id=?', (item['producto_id'],)).fetchone()
        if not p or p['stock'] < item['cantidad']:
            db.close()
            return jsonify({'error': f"Stock insuficiente para producto {item['producto_id']}"}), 400
    total = sum(item['precio_unitario'] * item['cantidad'] for item in items)
    cur = db.execute(
        'INSERT INTO ventas (total, metodo_pago, cliente_id, usuario_id) VALUES (?,?,?,?)',
        (total, d.get('metodo_pago','Efectivo'), d.get('cliente_id'), session['usuario_id']))
    venta_id = cur.lastrowid
    for item in items:
        db.execute(
            'INSERT INTO venta_items (venta_id, producto_id, nombre_producto, precio_unitario, cantidad) VALUES (?,?,?,?,?)',
            (venta_id, item['producto_id'], item['nombre_producto'], item['precio_unitario'], item['cantidad']))
        db.execute('UPDATE productos SET stock = stock - ? WHERE id=?',
                   (item['cantidad'], item['producto_id']))
    log_actividad(db, f"Registró venta de ${total:,}")
    db.commit()
    db.close()
    return jsonify({'ok': True, 'venta_id': venta_id, 'total': total}), 201

# ── USUARIOS API ───────────────────────────────────────────────────────────

@app.route('/api/usuarios', methods=['GET'])
@perm_required('usuarios')
def get_usuarios():
    db = get_db()
    rows = db.execute('SELECT id, nombre, user, rol, perms, activo, last_login FROM usuarios').fetchall()
    db.close()
    return jsonify([dict(r) for r in rows])

@app.route('/api/usuarios', methods=['POST'])
@perm_required('usuarios')
def crear_usuario():
    d = request.get_json()
    if len(d.get('password','')) < 6:
        return jsonify({'error': 'Contraseña mínimo 6 caracteres'}), 400
    db = get_db()
    exists = db.execute('SELECT id FROM usuarios WHERE user=?', (d['user'],)).fetchone()
    if exists:
        db.close()
        return jsonify({'error': 'Usuario ya existe'}), 400
    perms = json.dumps(d.get('perms', {}))
    cur = db.execute(
        'INSERT INTO usuarios (nombre, user, pass_hash, rol, perms) VALUES (?,?,?,?,?)',
        (d['nombre'], d['user'], hash_pass(d['password']), d['rol'], perms))
    log_actividad(db, f"Creó usuario: {d['nombre']}")
    db.commit()
    u = db.execute('SELECT id, nombre, user, rol, perms, activo, last_login FROM usuarios WHERE id=?',
                   (cur.lastrowid,)).fetchone()
    db.close()
    return jsonify(dict(u)), 201

@app.route('/api/usuarios/<int:uid>', methods=['PUT'])
@perm_required('usuarios')
def actualizar_usuario(uid):
    d = request.get_json()
    db = get_db()
    u = db.execute('SELECT * FROM usuarios WHERE id=?', (uid,)).fetchone()
    if not u:
        db.close()
        return jsonify({'error': 'No encontrado'}), 404
    pass_hash = hash_pass(d['password']) if d.get('password') and len(d['password']) >= 6 else u['pass_hash']
    perms = json.dumps(d.get('perms', json.loads(u['perms'])))
    db.execute('UPDATE usuarios SET nombre=?, user=?, pass_hash=?, rol=?, perms=? WHERE id=?',
               (d['nombre'], d['user'], pass_hash, d['rol'], perms, uid))
    log_actividad(db, f"Editó usuario: {d['nombre']}")
    db.commit()
    updated = db.execute('SELECT id, nombre, user, rol, perms, activo, last_login FROM usuarios WHERE id=?', (uid,)).fetchone()
    db.close()
    return jsonify(dict(updated))

@app.route('/api/usuarios/<int:uid>/toggle', methods=['POST'])
@perm_required('usuarios')
def toggle_usuario(uid):
    if uid == session['usuario_id']:
        return jsonify({'error': 'No puedes desactivarte'}), 400
    db = get_db()
    u = db.execute('SELECT activo, nombre FROM usuarios WHERE id=?', (uid,)).fetchone()
    nuevo = 0 if u['activo'] else 1
    db.execute('UPDATE usuarios SET activo=? WHERE id=?', (nuevo, uid))
    log_actividad(db, f"{'Activó' if nuevo else 'Desactivó'} usuario: {u['nombre']}")
    db.commit(); db.close()
    return jsonify({'ok': True, 'activo': nuevo})

# ── ACTIVIDAD API ──────────────────────────────────────────────────────────

@app.route('/api/actividad', methods=['GET'])
@perm_required('usuarios')
def get_actividad():
    db = get_db()
    rows = db.execute(
        'SELECT * FROM actividad ORDER BY creado_en DESC LIMIT 50').fetchall()
    db.close()
    return jsonify([dict(r) for r in rows])

# ── REPORTES API ───────────────────────────────────────────────────────────

@app.route('/api/reportes', methods=['GET'])
@perm_required('reportes')
def get_reportes():
    dias = request.args.get('dias', 7, type=int)
    db = get_db()
    if dias:
        ventas = db.execute(
            "SELECT v.*, c.nombre as cliente_nombre FROM ventas v "
            "LEFT JOIN clientes c ON v.cliente_id=c.id "
            "WHERE datetime(v.creado_en) >= datetime('now', ? || ' days') "
            "ORDER BY v.creado_en DESC",
            (f'-{dias}',)).fetchall()
    else:
        ventas = db.execute(
            "SELECT v.*, c.nombre as cliente_nombre FROM ventas v "
            "LEFT JOIN clientes c ON v.cliente_id=c.id ORDER BY v.creado_en DESC").fetchall()
    result = []
    for v in ventas:
        vd = dict(v)
        items = db.execute('SELECT * FROM venta_items WHERE venta_id=?', (v['id'],)).fetchall()
        vd['items'] = [dict(i) for i in items]
        result.append(vd)
    stock_bajo = db.execute(
        'SELECT * FROM productos WHERE stock <= stock_minimo ORDER BY stock ASC').fetchall()
    db.close()
    return jsonify({'ventas': result, 'stock_bajo': [dict(r) for r in stock_bajo]})

# ── INIT & RUN ─────────────────────────────────────────────────────────────

if __name__ == '__main__':
    init_db()
    app.run(debug=True, host='0.0.0.0', port=5000)

# ── EXPORT BLUEPRINT ────────────────────────────────────────────────────────
from export import export_bp
app.register_blueprint(export_bp)

# ── REINIT MAIN ─────────────────────────────────────────────────────────────
if __name__ == '__main__':
    init_db()
    port = int(os.environ.get('PORT', 5000))
    app.run(debug=False, host='0.0.0.0', port=port)
