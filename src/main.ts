import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { NextFunction, Request, Response } from 'express';
import { join } from 'path';
import { AppModule } from './app.module';

// Colores de Swagger UI con contraste >= 4.5:1 (WCAG 1.4.3) y borde >= 3:1 (WCAG 1.4.11)
const swaggerCss = `
  .swagger-ui .opblock.opblock-get { border-color: #1f5fa8; }
  .swagger-ui .opblock.opblock-get .opblock-summary-method { background: #1f5fa8; }
  .swagger-ui .btn.execute { background-color: #1f5fa8; border-color: #1f5fa8; }
  .swagger-ui .parameter__in { color: #595959; }
  .swagger-ui .parameter__name.required:after { color: #c00000; }
`;

// La plantilla de @nestjs/swagger trae lang="en" y no tiene meta viewport:
// se corrigen en la respuesta HTML de /api (WCAG 3.1.1 y 1.4.10)
function ajustarHtmlSwagger(req: Request, res: Response, next: NextFunction) {
  // Desde /api/ o /api/index.html las rutas relativas ./api/*.css y *.js darían 404 (/api/api/...)
  if (req.method === 'GET' && ['/api/', '/api/index.html'].includes(req.path)) {
    return res.redirect(301, '/api');
  }
  if (req.method === 'GET' && req.path === '/api') {
    const send = res.send.bind(res);
    res.send = (body?: unknown) =>
      send(
        typeof body === 'string'
          ? body
              .replace('<html lang="en">', '<html lang="es">')
              .replace(
                '<meta charset="UTF-8">',
                '<meta charset="UTF-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1">',
              )
          : body,
      );
  }
  next();
}

async function bootstrap() {
  // 1. Crear la app HTTP (para Swagger y las rutas REST)
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.disable('x-powered-by');

  // 2. Conectarle el microservicio gRPC que ya tenías
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.GRPC,
    options: {
      package: 'productos',
      protoPath: join(__dirname, 'productos.proto'),
      url: '0.0.0.0:5000',
    },
  });
  await app.startAllMicroservices();
  console.log('Microservicio gRPC escuchando en 0.0.0.0:5000');

  // 3. Configurar Swagger
  const config = new DocumentBuilder()
    .setTitle('API de Productos')
    .setDescription('Puerta REST que consume el microservicio gRPC de productos')
    .setVersion('1.0')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  app.use(ajustarHtmlSwagger);
  SwaggerModule.setup('api', app, document, {
    customSiteTitle: 'API de Productos – Swagger',
    customCss: swaggerCss,
  });

  // 4. Arrancar el servidor HTTP (el puerto se puede cambiar con la variable PORT)
  const port = process.env.PORT ?? 3000;
  await app.listen(port, '0.0.0.0');
  console.log(`Swagger disponible en el puerto ${port}, ruta /api`);
}
bootstrap();
