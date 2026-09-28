# Microservicio gRPC de Productos (NestJS)

Microservicio gRPC desarrollado con NestJS que expone un método **unary** y dos métodos **server streaming**, con manejo de errores gRPC. Incluye un gateway REST documentado con Swagger y un cliente de prueba en Node.js.

Práctica de la asignatura **Integración de Sistemas** – PUCE.

## Demo en la nube

| Servicio | Dirección |
|---|---|
| Swagger (gateway REST) | http://20.80.41.52:3000/api |
| Microservicio gRPC | `20.80.41.52:5000` |

> El gRPC no se puede abrir en el navegador, porque los navegadores no soportan gRPC. Para probarlo se usa `cliente.js` (ver abajo).

## Arquitectura

```
Navegador ──REST/JSON──► Gateway Swagger :3000 ──gRPC/HTTP2──► Microservicio :5000
cliente.js ──────────────────gRPC/HTTP2────────────────────────► Microservicio :5000
```

## Métodos gRPC (`src/productos.proto`)

| Método | Tipo | Descripción |
|---|---|---|
| `ObtenerProducto` | Unary | Devuelve un producto por id. Si no existe, responde `NOT_FOUND` (código 5) |
| `ListarProductos` | Server streaming | Envía todos los productos uno por uno |
| `BuscarPorPrecioMaximo` | Server streaming | Envía los productos con precio menor o igual al indicado |

## Rutas REST (Swagger)

| Ruta | Llama al método gRPC |
|---|---|
| `GET /productos` | `ListarProductos` |
| `GET /productos/buscar?precioMaximo=50` | `BuscarPorPrecioMaximo` |
| `GET /productos/{id}` | `ObtenerProducto` (404 si no existe) |

## Cómo probar el gRPC con el cliente

Requisito: Node.js 18 o superior.

```bash
git clone https://github.com/AliDaniela097/nestjs-productos-grpc.git
cd nestjs-productos-grpc
npm install
node cliente.js
```

`cliente.js` se conecta al microservicio en Azure (`20.80.41.52:5000`). Resultado esperado:

- El producto 1 por **unary**.
- Los 3 productos llegando **uno por uno** por **server streaming**.
- El error `5 - Producto 999 no existe` (`NOT_FOUND`).
- Solo Teclado y Mouse al filtrar por precio máximo 50.

## Ejecutar en local

```bash
npm install
npm run start
```

- gRPC: `localhost:5000`
- Swagger: http://localhost:3000/api

Para usar el cliente en local, indicar la dirección con la variable `GRPC_URL`:

```bash
GRPC_URL=localhost:5000 node cliente.js
```

## Despliegue

- **Imagen Docker:** construida con GitHub Actions (`.github/workflows/docker-publish.yml`) y publicada en `ghcr.io/alidaniela097/nestjs-productos-grpc`.
- **Servidor:** máquina virtual Linux (Ubuntu 22.04) en Microsoft Azure, región North Central US, con Docker. Suscripción Azure for Students.
- **Puertos abiertos:** 5000 (gRPC) y 3000 (Swagger).

## Tecnologías

NestJS · TypeScript · gRPC (`@grpc/grpc-js`, `@grpc/proto-loader`) · Protocol Buffers · Swagger (`@nestjs/swagger`) · Docker · GitHub Actions · Microsoft Azure

## Autora

Alisson Basantes