# Backend — Ferretería 4 Esquinas

API real (Node.js + Express + PostgreSQL) para el sitio: guarda cotizaciones en base de datos,
maneja el catálogo desde un panel de administrador, cuentas de cliente con contraseñas
encriptadas (bcrypt), y sincroniza las cotizaciones con Alegra si configuras tus credenciales.

## 1. Crear la base de datos (Neon, gratis y permanente)

1. Entra a https://neon.tech y crea una cuenta gratuita.
2. Crea un proyecto nuevo (elige la región más cercana, ej. US East).
3. Copia el **Connection string** que te muestra (empieza por `postgresql://...`).

## 2. Desplegar el backend (Render, plan gratuito)

1. Entra a https://render.com y crea una cuenta gratuita.
2. Sube esta carpeta `backend/` a un repositorio de GitHub (puede ser uno nuevo, ej.
   `Ferreteria-4-Esquinas-Backend`).
3. En Render, "New +" → "Blueprint" → conecta ese repositorio (Render detecta `render.yaml`
   automáticamente).
4. Cuando te pida las variables marcadas como "sync: false", pega:
   - `DATABASE_URL`: el connection string de Neon del paso 1.
   - `ADMIN_EMAIL` / `ADMIN_PASSWORD`: con qué correo y clave quieres entrar al panel de admin.
   - `ALEGRA_EMAIL` / `ALEGRA_TOKEN`: opcional, tu correo de Alegra y el token de la API
     (Alegra → Configuración → Integraciones → API). Si los dejas vacíos, todo funciona igual,
     solo no se sincroniza con Alegra.
5. Espera a que el servicio quede "Live". Copia su URL, algo como
   `https://ferreteria-4-esquinas-backend.onrender.com`.

## 3. Crear las tablas y los datos iniciales

Desde tu computador, con Node.js instalado:

```bash
cd backend
npm install
copy .env.example .env      # en Windows (o "cp .env.example .env" en Mac/Linux)
```

Edita `.env` y pon el mismo `DATABASE_URL` de Neon y tus datos de `ADMIN_EMAIL`/`ADMIN_PASSWORD`.
Luego:

```bash
npm run migrate         # crea las tablas
npm run seed:products   # carga el catálogo actual del sitio
npm run seed:admin      # crea tu usuario de administrador
```

## 4. Conectar el sitio con el backend

Copia la URL de Render del paso 2 y pásasela a Claude (o edítala tú directamente): en
`index.html` busca la línea `window.API_BASE = "..."` cerca del inicio del script principal y
pon ahí esa URL. Sin esto, el sitio sigue funcionando igual que antes (catálogo local,
cotización por WhatsApp), simplemente no queda conectado a la base de datos ni al panel de admin.

## Nota sobre el plan gratuito de Render

El servicio gratuito de Render se "duerme" tras 15 minutos sin uso y tarda ~1 minuto en
despertar en la siguiente visita. Para una ferretería pequeña esto es normal y aceptable; si
más adelante quieres que el panel de admin y las cotizaciones respondan siempre al instante,
se puede subir al plan pago de Render (unos pocos dólares al mes).
