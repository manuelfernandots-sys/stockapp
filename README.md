# stock.app — Sistema de inventario para pequeños negocios

App web responsive para gestión de inventario, ventas, clientes y reportes.
Construida con Python + Flask + SQLite.

---

## Instalación local (tu computador)

### Requisitos
- Python 3.10 o superior
- pip (viene con Python)

### Pasos

```bash
# 1. Entra a la carpeta del proyecto
cd stockapp

# 2. Crea un entorno virtual (recomendado)
python3 -m venv venv
source venv/bin/activate        # Linux/Mac
# venv\Scripts\activate         # Windows

# 3. Instala Flask
pip install -r requirements.txt

# 4. Inicia la app
python app.py
```

Abre tu navegador en: **http://localhost:5000**

### Usuarios por defecto
| Usuario   | Contraseña  | Rol           |
|-----------|-------------|---------------|
| admin     | admin123    | Administrador |
| vendedor  | venta123    | Vendedor      |
| bodega    | bodega123   | Solo lectura  |

> Cambia las contraseñas desde la pestaña Usuarios después del primer login.

---

## Deploy en Railway (gratuito)

1. Crea cuenta en https://railway.app
2. Instala Railway CLI: `npm install -g @railway/cli`
3. En la carpeta del proyecto:
```bash
railway login
railway init
railway up
```
4. Railway te da una URL pública tipo `https://tuapp.railway.app`

### Variables de entorno en Railway
En el dashboard de Railway, agrega:
- `SECRET_KEY` = una clave larga y aleatoria (ej: `mi-clave-super-secreta-2024`)

---

## Deploy en Render (alternativa gratuita)

1. Crea cuenta en https://render.com
2. Crea un archivo `Procfile` en la carpeta raíz:
```
web: python app.py
```
3. Sube el código a GitHub
4. En Render: New Web Service → conecta el repo → Deploy

---

## Estructura del proyecto

```
stockapp/
├── app.py              ← Backend Flask (rutas, base de datos, API)
├── requirements.txt    ← Dependencias Python
├── stockapp.db         ← Base de datos SQLite (se crea automáticamente)
├── templates/
│   ├── login.html      ← Pantalla de login
│   └── index.html      ← App principal
└── static/
    ├── css/
    │   └── style.css   ← Estilos
    └── js/
        └── app.js      ← Lógica frontend
```

---

## Personalizar para cada cliente

Para instalar la app en un nuevo negocio:

1. Copia la carpeta `stockapp/`
2. Borra `stockapp.db` si existe
3. Cambia `SECRET_KEY` en `app.py`
4. Sube a Railway/Render
5. El primer usuario `admin` se crea automáticamente

Para cambiar el nombre del negocio, edita el título en `templates/index.html`:
```html
<title>Nombre del negocio</title>
```

---

## Modelo de negocio sugerido

| Servicio              | Precio sugerido (CLP) |
|-----------------------|-----------------------|
| Setup + instalación   | $40.000 – $60.000     |
| Mantención mensual    | $8.000 – $15.000      |
| Capacitación (1 hora) | $20.000               |

Con 10 clientes en mantención: **$80.000 – $150.000/mes recurrente**
