# Auditoría: nestjs-productos-grpc

**Fecha:** 2026-09-27 (hora local) / 2026-09-28 02:41 GMT
**Commit auditado:** `8c5da80`
**Tipo:** no destructiva. No se modificó ningún archivo del proyecto ni la infraestructura.
**Alcance:** accesibilidad (WCAG 2.2 AA), UX y responsive de la interfaz web (Swagger UI en `http://20.80.41.52:3000/api`), seguridad de la VM y de las dependencias, estado del microservicio y calidad del código.

---

## 0. Método y límites

| Comprobación | Cómo se hizo | Estado |
|---|---|---|
| Código fuente, Dockerfile y CI | Lectura de todos los archivos versionados | ✅ Hecha |
| Vulnerabilidades de dependencias | `npm audit --json` | ✅ Hecha |
| Puertos expuestos a internet | Conexión TCP desde internet a 20.80.41.52 en los puertos 22, 3000 y 5000 | ✅ Hecha |
| Reglas del firewall (NSG) de la VM | `az network nsg rule list` | ⚠️ **No ejecutada**: la CLI de Azure (`az`) no está instalada en este equipo |
| `docker ps` / `docker logs` con `az vm run-command` | — | ⚠️ **No ejecutada**: mismo motivo. Solo hay evidencia indirecta (ver §2.4) |
| Rutas REST en producción | `curl` con entradas válidas e inválidas | ✅ Hecha |
| HTML, CSS y recursos de Swagger UI | Descarga del HTML servido y análisis de `swagger-ui-dist@5.33.0` | ✅ Hecha |
| Renderizado a 320/390/768 px y escritorio, errores de consola JS, recorrido con teclado y lector de pantalla | Hace falta un navegador (Playwright/axe no están instalados) | ⚠️ **No ejecutada**: los hallazgos responsive se basan en el HTML y CSS servidos, no en capturas |
| Punto 4 de la petición ("cuarto, consultar el…") | El enunciado llegó cortado | ❌ No se pudo interpretar |

En §6 están los comandos exactos, de solo lectura, para completar lo pendiente.

---

## 1. Resumen ejecutivo

El microservicio **está en línea y responde bien**: las tres rutas REST devuelven los datos esperados, el 404 de gRPC (`NOT_FOUND`) se traduce bien a HTTP 404 y todos los recursos de Swagger cargan con HTTP 200.

Los riesgos principales:

1. **Seguridad de red:** el **puerto 22 (SSH) acepta conexiones desde internet**. Es el único puerto abierto que no necesita el servicio. Los puertos 3000 y 5000 sí se justifican, pero ambos van sin cifrar (HTTP y gRPC sin TLS).
2. **Dependencias:** `npm audit` reporta **5 vulnerabilidades: 2 altas, 1 moderada y 2 bajas**. Todas vienen de `@nestjs/mau`, una dependencia de desarrollo que el código no usa, pero que acaba dentro de la imagen Docker porque el `Dockerfile` instala las devDependencies.
3. **Responsive / accesibilidad:** la página de Swagger **no tiene `<meta name="viewport">`**, así que en móviles (320/390 px) se muestra como escritorio reducido. Además, varios colores de Swagger UI **no llegan al contraste mínimo 4.5:1** (la etiqueta `GET` tiene 2.31:1) y la página declara `lang="en"` con contenido en español.
4. **API/UX:** `GET /productos/buscar` sin parámetro o con `precioMaximo=abc` responde **200 `[]`** en lugar de 400, aunque Swagger lo marca como obligatorio.
5. **Calidad:** el único test unitario **no compila** (`getHello` no existe en `AppController`).

| Gravedad | Cantidad |
|---|---|
| Crítica | 0 |
| Alta | 3 |
| Media | 8 |
| Baja | 9 |

No se encontraron hallazgos críticos: el servicio solo expone datos de ejemplo de lectura y no guarda credenciales ni datos personales.

---

## 2. Hallazgos por gravedad

Formato de cada hallazgo: **Evidencia** (archivo o elemento afectado) → **Recomendación**.

### 2.1 Altos

#### A-1. SSH (22) expuesto a internet
- **Evidencia:** una conexión TCP desde internet a `20.80.41.52:22` se abrió correctamente (`puerto 22 abierto=True`). No pude leer las reglas del NSG (no hay `az`), así que no sé si la regla permite `*`/`Internet` o solo ciertas IP. En cualquier caso, desde una red doméstica cualquiera el puerto está accesible.
- **Justificación:** el servicio no necesita el 22. Solo sirve para administrar la VM, y el despliegue ya puede hacerse con `az vm run-command` sin SSH público.
- **Recomendación:** en el NSG, limitar la regla del 22 a la IP pública de la autora (`--source-address-prefixes <IP>/32`) o quitarla y usar Azure Bastion, `az vm run-command` o JIT (Just-In-Time) de Defender for Cloud. Comprobar que la VM solo acepta autenticación por clave (`PasswordAuthentication no`).

#### A-2. Cinco vulnerabilidades en dependencias (2 altas)
- **Evidencia:** `npm audit` sobre `package-lock.json`:

  | Paquete | Gravedad | ¿Directa? | Motivo principal | Cadena |
  |---|---|---|---|---|
  | `undici` (≤ 6.27.0) | **Alta** | No | 15 avisos, CVSS máx. 7.5 (p. ej. GHSA-f269-vfmq-vjvj, GHSA-vrm6-8vpv-qv8q y GHSA-vxpw-j846-p89q: DoS en WebSocket; GHSA-2mjp-6q6p-2qxm: request smuggling) | `@nestjs/mau` → `undici` |
  | `tmp` (≤ 0.2.5) | **Alta** | No | GHSA-52f5-9888-hmc6 (escritura por symlink), GHSA-ph9p-34f9-6g65 (path traversal) | `@nestjs/mau` → `inquirer` → `external-editor` → `tmp` |
  | `@nestjs/mau` | Moderada | **Sí** (devDependency, `package.json:36`) | Hereda las anteriores | — |
  | `inquirer` | Baja | No | Hereda `external-editor` | `@nestjs/mau` → `inquirer` |
  | `external-editor` | Baja | No | Hereda `tmp` | `@nestjs/mau` → `inquirer` → `external-editor` |

  `npm audit` propone como solución `@nestjs/mau@0.0.6`, que es un cambio de versión mayor (degradación). El código solo usa `@nestjs/mau` en el script `"deploy": "nest deploy"` (`package.json:10`), que sirve para desplegar en Mau (AWS), no en Azure.
- **Por qué es Alta y no Crítica:** ninguno de estos paquetes se carga cuando `node dist/main` está en marcha. El riesgo real es la cadena de suministro y la superficie de ataque de la imagen, porque el `Dockerfile` ejecuta `npm ci` sin `--omit=dev` (ver M-5) y los incluye.
- **Recomendación (no aplicada):** quitar `@nestjs/mau` y el script `deploy` y regenerar el lockfile. Si hace falta conservarlo, añadir un `overrides` a `undici` ≥ 6.27.1 y a `tmp` ≥ 0.2.6 en `package.json`. Después, ejecutar `npm audit` otra vez.

#### A-3. Sin `<meta name="viewport">`: la página no se adapta a móviles (WCAG 1.4.10 Reflow, 1.4.4)
- **Evidencia:** el `<head>` servido en `http://20.80.41.52:3000/api` solo contiene `charset`, `<title>`, la hoja de estilos y los favicons. **No hay `meta viewport`.** Esa plantilla la genera `SwaggerModule.setup('api', app, document)` (`src/main.ts:30`).
- **Efecto esperado:** en 320 px y 390 px, los navegadores móviles usan un viewport virtual de unos 980 px y reducen la página. Swagger UI tiene *container queries* para ≤ 640/768 px (`swagger-ui.css`: `@container swagger-ui (max-width: 768px)`), pero no se activan porque el contenedor mide ~980 px. El texto queda diminuto y hay que hacer zoom y desplazarse. Es un efecto que se deduce del HTML; no lo confirmé con capturas.
- **Recomendación:** inyectar el meta viewport. Opciones: (a) `SwaggerModule.setup('api', app, document, { customJsStr: "document.head.insertAdjacentHTML('afterbegin','<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">')" })`, o (b) servir un `index.html` propio de Swagger UI (paquete `swagger-ui-dist`) que ya lo traiga. No usar `maximum-scale=1` ni `user-scalable=no`.

### 2.2 Medios

#### M-1. Contraste de texto insuficiente en Swagger UI (WCAG 1.4.3)
- **Evidencia:** colores de `node_modules/swagger-ui-dist/swagger-ui.css` (v5.33.0, la misma que sirve producción) y ratios calculados con la fórmula de WCAG:

  | Elemento | Colores | Ratio | Mínimo | Resultado |
  |---|---|---|---|---|
  | Etiqueta de método `GET` (`.opblock-get .opblock-summary-method`, 14px bold) | `#fff` sobre `#61affe` | **2.31:1** | 4.5:1 | ❌ No cumple |
  | Botón **Execute** (`.btn.execute`) | `#fff` sobre `#4990e2` | **3.30:1** | 4.5:1 | ❌ No cumple |
  | Indicador `(query)` / `(path)` (`.parameter__in`, 12px) | `grey` (#808080) sobre `#fff` | **3.95:1** | 4.5:1 | ❌ No cumple |
  | Texto "required" (`.parameter__name.required:after`, 10px) | `rgba(255,0,0,.6)` ≈ `#ff6666` sobre `#fff` | **2.86:1** | 4.5:1 | ❌ No cumple |
  | Texto general y resúmenes (`#3b4151`) | sobre `#fafafa` / fondo GET `≈#eff7ff` | 9.76:1 / 9.42:1 | 4.5:1 | ✅ Cumple |

  Las tres rutas son `GET`, así que el fallo de la etiqueta `GET` aparece en todas las operaciones.
- **Recomendación:** sobrescribir con `customCss` en `SwaggerModule.setup` (p. ej. `.swagger-ui .opblock.opblock-get .opblock-summary-method{background:#1f5fa8}` da 6.44:1, `.swagger-ui .btn.execute{background:#1f5fa8;border-color:#1f5fa8}`, `.swagger-ui .parameter__in{color:#595959}` y `.swagger-ui .parameter__name.required:after{color:#c00000}`).

#### M-2. Idioma de la página mal declarado (WCAG 3.1.1 / 3.1.2)
- **Evidencia:** HTML servido: `<html lang="en">`. El contenido propio está en español: título "API de Productos", descripción "Puerta REST que consume…", resúmenes "Lista todos los productos…" (`src/main.ts:25-26`, `src/productos-http.controller.ts:28,34,43`). Los textos de la interfaz de Swagger ("Try it out", "Execute") sí están en inglés.
- **Recomendación:** cambiar a `lang="es"` con el mismo `customJsStr` de A-3 (`document.documentElement.lang='es'`). Si se mantiene la interfaz en inglés, basta con declarar la página en español porque el contenido principal lo está. Otra opción es declarar `lang="en"` y marcar las descripciones en español, pero Swagger no lo permite fácilmente.

#### M-3. Parámetro obligatorio sin validar: `/productos/buscar` responde 200 con datos inválidos
- **Evidencia:** `src/productos-http.controller.ts:36-38` convierte con `Number(precioMaximo)` sin validar. En producción:
  - `GET /productos/buscar?precioMaximo=abc` → **HTTP 200 `[]`**
  - `GET /productos/buscar` (sin parámetro) → **HTTP 200 `[]`**

  En cambio, `/api-json` declara `precioMaximo` como `"required": true`, y la ruta hermana `/productos/:id` sí valida con `ParseIntPipe` (`abc` → 400). Quien use la API recibe una lista vacía sin saber que su entrada era inválida.
- **Recomendación:** `@Query('precioMaximo', ParseFloatPipe) precioMaximo: number` (así la ruta devuelve 400 con `abc` o sin parámetro).

#### M-4. Tráfico sin cifrar en 3000 (HTTP) y 5000 (gRPC)
- **Evidencia:** `cliente.js:9` usa `grpc.credentials.createInsecure()` y `src/main.ts:17` no configura credenciales TLS. Swagger se sirve por `http://`.
- **Justificación de los puertos:**

  | Puerto | ¿Necesario? | Motivo |
  |---|---|---|
  | **3000** | Sí | Swagger/REST es la demo que se abre desde el navegador (README, "Demo en la nube") |
  | **5000** | Sí, por requisito de la práctica | `cliente.js` se conecta desde fuera a `20.80.41.52:5000`. El gateway **no** lo necesita abierto hacia fuera, porque usa `localhost:5000` (`src/app.module.ts:16`) |
  | **22** | No para el servicio | Ver A-1 |
- **Recomendación:** para una demo académica con datos ficticios el riesgo es bajo, pero lo recomendable es poner un proxy inverso con HTTPS (Caddy o Nginx con Let's Encrypt) delante de 3000, y TLS en gRPC (`ServerCredentials.createSsl`) o un proxy con HTTP/2 y TLS. Cuando termine la evaluación, cerrar el 5000 o limitarlo a IP concretas.

#### M-5. La imagen Docker incluye devDependencies y se ejecuta como root
- **Evidencia:** `Dockerfile:4` `RUN npm ci` (instala dev) y no hay `npm prune --omit=dev`. Tampoco hay instrucción `USER`, así que el proceso corre como `root` (usuario por defecto de `node:22-alpine`). Además, `COPY . .` (`Dockerfile:5`) copia el código fuente, los tests y `cliente.js` a la imagen final.
- **Recomendación:** hacer un build multi-stage. En la etapa final: `npm ci --omit=dev`, copiar solo `dist/`, y añadir `USER node`.

#### M-6. Swagger no documenta respuestas ni esquemas
- **Evidencia:** `/api-json` muestra en todas las rutas `"responses":{"200":{"description":""}}`, sin esquema de `ProductoResponse` y sin los códigos 400/404 que la API sí devuelve (`/productos/999` → 404, `/productos/abc` → 400).
- **Impacto en UX:** quien usa Swagger no ve la forma de la respuesta ni los errores posibles hasta que pulsa "Execute".
- **Recomendación:** crear una clase DTO `ProductoDto` con `@ApiProperty` y anotar con `@ApiOkResponse({ type: [ProductoDto] })`, `@ApiNotFoundResponse()` y `@ApiBadRequestResponse()` en `src/productos-http.controller.ts`.

#### M-7. El test unitario no compila
- **Evidencia:** `npx tsc --noEmit` → `src/app.controller.spec.ts(19,28): error TS2339: Property 'getHello' does not exist on type 'AppController'`. El spec viene de la plantilla de Nest y no se actualizó cuando `AppController` pasó a ser el controlador gRPC. El workflow `.github/workflows/docker-publish.yml` no ejecuta tests, así que el fallo no se detecta en CI.
- **Recomendación:** reescribir el spec para probar `obtenerProducto` (caso existente y caso `NOT_FOUND`), `listarProductos` y `buscarPorPrecioMaximo`. Añadir un paso `npm test` al workflow antes del build.

#### M-8. Etiqueta de imagen solo `latest`
- **Evidencia:** `.github/workflows/docker-publish.yml:31` publica únicamente `:latest`. No se puede saber qué commit corre en la VM ni volver a una versión anterior.
- **Recomendación:** publicar también `:${{ github.sha }}` y desplegar esa etiqueta.

### 2.3 Bajos

| ID | Hallazgo | Evidencia | Recomendación |
|---|---|---|---|
| B-1 | Título de página genérico (WCAG 2.4.2: hay título, pero no describe esta API) | `<title>Swagger UI</title>` en el HTML servido | `customSiteTitle: 'API de Productos – Swagger'` en `SwaggerModule.setup` (`src/main.ts:30`) |
| B-2 | Cabecera `X-Powered-By: Express` y sin cabeceras de seguridad (CSP, `X-Content-Type-Options`, etc.) | Respuesta HTTP de `/api` | `app.disable('x-powered-by')` o `helmet()` (ajustando la CSP para Swagger) |
| B-3 | `EXPOSE` solo declara 5000 | `Dockerfile:7`; la app también escucha en 3000 (`src/main.ts:33-34`) | `EXPOSE 3000 5000` (solo es documentación, no afecta al funcionamiento) |
| B-4 | Comentario desactualizado: habla de Railway, pero el despliegue es en Azure | `src/main.ts:32` | Actualizar el comentario |
| B-5 | Código muerto | `src/app.service.ts` no se registra en ningún módulo (`src/app.module.ts:22` `providers: []`) | Eliminarlo junto con el spec obsoleto (M-7) |
| B-6 | IP de producción fija en el cliente | `cliente.js:9` `'20.80.41.52:5000'`; el README pide editar el archivo para usarlo en local | Leerla de una variable: `process.env.GRPC_URL ?? '20.80.41.52:5000'` |
| B-7 | Orden de las pruebas en `cliente.js` difícil de seguir | `cliente.js:26-35`: la prueba de error va anidada dentro del callback de la primera llamada con otra sangría, mientras que `BuscarPorPrecioMaximo` (`:36`) corre en paralelo. La salida puede salir mezclada | Encadenar las pruebas con `async/await` o dejarlas al mismo nivel |
| B-8 | En modo oscuro de Swagger se elimina el foco (WCAG 2.4.7) | `swagger-ui.css`: `html.dark-mode .swagger-ui .opblock.opblock-get .opblock-summary-control:focus{outline:none}`. Solo aplica si `<html>` tiene la clase `dark-mode`, que no está activa por defecto | Si se activa el modo oscuro, añadir `customCss` con un `outline` visible |
| B-9 | Bordes de las operaciones GET con poco contraste (WCAG 1.4.11) | Borde `#61affe` sobre `#fafafa`: 2.22:1. El borde no es imprescindible para identificar el control (el texto del resumen sí contrasta), así que es un problema menor | Oscurecer el borde en el mismo `customCss` de M-1 |

### 2.4 Criterios que cumplen

| Criterio | Evidencia |
|---|---|
| **Microservicio activo** (evidencia indirecta) | El 2026-09-28 02:41 GMT: `GET /productos` → 200 con 3 productos, `/productos/1` → 200, `/productos/999` → 404 "Producto 999 no existe", `/productos/buscar?precioMaximo=50` → Teclado y Mouse. Como el gateway llama al gRPC por `localhost:5000`, el servidor gRPC dentro del contenedor está en marcha. Los logs **no** se revisaron (ver §0) |
| Manejo de errores gRPC → HTTP | `src/app.controller.ts:22` lanza `NOT_FOUND` y `src/productos-http.controller.ts:47-50` lo traduce a `NotFoundException` |
| Validación de `:id` | `ParseIntPipe` (`src/productos-http.controller.ts:45`): `/productos/abc` → 400 |
| Rutas desconocidas | `/noexiste` → 404 JSON, sin traza de pila ni rutas internas |
| Recursos de la página | `swagger-ui-init.js`, `swagger-ui-bundle.js`, `swagger-ui-standalone-preset.js`, `swagger-ui.css` y el favicon responden 200, así que ningún script falla por no cargar. Los errores de consola en tiempo de ejecución no se revisaron |
| Enlace para saltar al contenido (WCAG 2.4.1) | Swagger UI 5.33 incluye `.swagger-ui__skip-link`, que se vuelve visible al recibir foco |
| Foco visible en modo claro (WCAG 2.4.7) | `.opblock-summary-control:focus{outline:auto}` y regla global `:focus{outline:1px dotted currentColor}` |
| Contraste del texto principal (WCAG 1.4.3) | `#3b4151` sobre `#fafafa`: 9.76:1 |
| Imágenes / texto alternativo (WCAG 1.1.1) | El proyecto no añade imágenes de contenido. Solo están los favicons y un sprite SVG decorativo (`position:absolute;width:0;height:0`) |
| Sin secretos en el repositorio | `.env*` en `.gitignore`. El workflow usa `secrets.GITHUB_TOKEN` con permisos mínimos (`contents: read`, `packages: write`) |
| Descripciones de operaciones | Cada ruta tiene `@ApiOperation` con un resumen claro que indica también el método gRPC que usa |

### 2.5 Criterios no verificables sin navegador

La interfaz la genera Swagger UI con React en tiempo de ejecución, así que estos puntos **no pueden afirmarse ni negarse** leyendo solo el código. No los cuento como hallazgos: jerarquía de encabezados, landmarks (`<main>`, `<nav>`), nombres accesibles de botones como "Try it out", "Execute" y los de expandir, uso de ARIA, orden de tabulación, tamaño de los objetivos táctiles (WCAG 2.5.8, 24×24 px), overflow horizontal real en 320/390/768 px y errores de consola JS. Se revisan con las pruebas de §5.

---

## 3. Evidencia concreta (índice)

| ID | Archivo / elemento |
|---|---|
| A-1 | VM `20.80.41.52`, puerto TCP 22 |
| A-2 | `package.json:10,36` (`@nestjs/mau`), `package-lock.json`, `Dockerfile:4` |
| A-3 | `src/main.ts:30`, `<head>` servido en `/api` |
| M-1 | `swagger-ui.css` (`.opblock-get .opblock-summary-method`, `.btn.execute`, `.parameter__in`, `.parameter__name.required:after`) |
| M-2 | `<html lang="en">`, `src/main.ts:25-26` |
| M-3 | `src/productos-http.controller.ts:36-38` |
| M-4 | `cliente.js:9`, `src/main.ts:17`, puertos 3000 y 5000 |
| M-5 | `Dockerfile:1-8` |
| M-6 | `src/productos-http.controller.ts:27-54`, `/api-json` |
| M-7 | `src/app.controller.spec.ts:19`, `.github/workflows/docker-publish.yml` |
| M-8 | `.github/workflows/docker-publish.yml:31` |
| B-1…B-9 | Ver la tabla de §2.3 |

## 4. Recomendaciones por orden de prioridad

1. Restringir o cerrar el puerto 22 en el NSG (A-1).
2. Quitar `@nestjs/mau` y regenerar el lockfile (A-2). Build multi-stage con `--omit=dev` y `USER node` (M-5).
3. Añadir en `SwaggerModule.setup` el `meta viewport`, `lang="es"`, `customSiteTitle` y el `customCss` de contraste (A-3, M-2, M-1, B-1, B-9).
4. `ParseFloatPipe` en `/productos/buscar` (M-3) y DTOs/`@ApiResponse` en Swagger (M-6).
5. Arreglar el test y ejecutarlo en CI; etiquetar la imagen con el SHA (M-7, M-8).
6. TLS o proxy HTTPS; cerrar el 5000 al terminar la evaluación (M-4).
7. Bajos restantes (B-2 a B-7).

---

## 5. Pruebas a repetir después de corregir

**Seguridad e infraestructura**
- [ ] `az network nsg rule list ... -o table`: el 22 no debe tener origen `*`/`Internet`.
- [ ] Desde una red ajena a la IP permitida: `Test-NetConnection 20.80.41.52 -Port 22` debe devolver `TcpTestSucceeded : False`.
- [ ] `npm audit`: debe dar `0 vulnerabilities` (o solo avisos justificados).
- [ ] `docker run --rm ghcr.io/alidaniela097/nestjs-productos-grpc whoami` → `node`; `ls node_modules/@nestjs/cli` dentro de la imagen → no existe.
- [ ] `curl -I http://20.80.41.52:3000/api`: sin `X-Powered-By`.
- [ ] `docker ps` y `docker logs --tail 200` vía `az vm run-command` (§6): contenedor `Up`, con las líneas "Microservicio gRPC escuchando en 0.0.0.0:5000" y "Swagger disponible en el puerto 3000", y sin `Error`/`UnhandledPromiseRejection`.

**API**
- [ ] `GET /productos/buscar?precioMaximo=abc` → 400; `GET /productos/buscar` → 400; `?precioMaximo=50` → 200 con 2 productos.
- [ ] `GET /productos/999` → 404; `/productos/abc` → 400; `/productos` → 3 productos.
- [ ] `node cliente.js`: unary, streaming, error 5 y filtro por precio, con el resultado esperado del README.
- [ ] `npx tsc --noEmit` sin errores; `npm test` en verde, en local y en CI.
- [ ] `/api-json`: cada ruta tiene esquema de respuesta y códigos 400/404.

**Accesibilidad y responsive** (Chrome DevTools o Playwright + axe-core)
- [ ] Ver el código fuente de `/api`: `<meta name="viewport" content="width=device-width, initial-scale=1">`, `<html lang="es">` y el `<title>` descriptivo.
- [ ] A **320 px, 390 px, 768 px y 1280 px**: sin scroll horizontal (`document.documentElement.scrollWidth <= innerWidth`), texto legible sin zoom y operaciones expandibles.
- [ ] Zoom del 200 % y 400 % en escritorio (WCAG 1.4.4 / 1.4.10).
- [ ] axe DevTools o Lighthouse Accessibility: 0 violaciones de `color-contrast`, `html-lang-valid` y `meta-viewport`. Revisar encabezados, landmarks, nombres accesibles y ARIA (§2.5).
- [ ] Solo con teclado: Tab → aparece el skip link → expandir `GET /productos/{id}` con Enter → "Try it out" → escribir id → "Execute" → leer la respuesta. El foco debe verse en cada paso y el orden ser lógico.
- [ ] Objetivos táctiles ≥ 24×24 px en 390 px (WCAG 2.5.8).
- [ ] Consola del navegador sin errores al cargar y al ejecutar las tres operaciones.
- [ ] Lector de pantalla (NVDA): los botones se anuncian con su nombre y estado (expandido/contraído).

---

## 6. Comandos de solo lectura para completar lo pendiente

Requieren instalar Azure CLI (`winget install Microsoft.AzureCLI`) y `az login`. Sustituir `<RG>`, `<VM>`, `<NSG>` y `<CONTENEDOR>`.

```powershell
# Localizar la VM y su NSG
az vm list -o table
az network nsg list -g <RG> -o table

# 1. Reglas del firewall (incluidas las predeterminadas)
az network nsg rule list -g <RG> --nsg-name <NSG> --include-default `
  --query "[].{Nombre:name,Prioridad:priority,Dir:direction,Acceso:access,Origen:sourceAddressPrefix,Puertos:destinationPortRange}" -o table

# 3. Estado y logs del contenedor (solo lectura dentro de la VM)
az vm run-command invoke -g <RG> -n <VM> --command-id RunShellScript `
  --scripts "docker ps -a" "docker logs --tail 200 <CONTENEDOR>"
```

Rellenar con el resultado:

| Regla NSG | Puerto | Origen | Acción | ¿Necesaria? |
|---|---|---|---|---|
| _(pendiente)_ | 22 | | | No para el servicio (A-1) |
| _(pendiente)_ | 3000 | | | Sí: Swagger/REST |
| _(pendiente)_ | 5000 | | | Sí: `cliente.js` externo |
