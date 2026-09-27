import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { join } from 'path';
import { AppController } from './app.controller';
import { ProductosHttpController } from './productos-http.controller';

@Module({
  imports: [
    ClientsModule.register([
      {
        name: 'PRODUCTOS_PACKAGE',
        transport: Transport.GRPC,
        options: {
          package: 'productos',
          protoPath: join(__dirname, 'productos.proto'),
          url: 'localhost:5000',
        },
      },
    ]),
  ],
  controllers: [AppController, ProductosHttpController],
  providers: [],
})
export class AppModule {}