import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { join } from 'path';
import { AppModule } from './app.module';

async function bootstrap() {
  // 1. Crear la app HTTP (para Swagger y las rutas REST)
  const app = await NestFactory.create(AppModule);

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
  SwaggerModule.setup('api', app, document);

   // 4. Arrancar el servidor HTTP (Railway asigna el puerto con la variable PORT)
  const port = process.env.PORT ?? 3000;
  await app.listen(port, '0.0.0.0');
  console.log(`Swagger disponible en el puerto ${port}, ruta /api`);
}
bootstrap();