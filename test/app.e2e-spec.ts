import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { join } from 'path';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

// Levanta el microservicio gRPC y el gateway REST juntos, igual que src/main.ts
describe('Gateway REST → gRPC (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.connectMicroservice<MicroserviceOptions>({
      transport: Transport.GRPC,
      options: {
        package: 'productos',
        protoPath: join(__dirname, '../src/productos.proto'),
        url: 'localhost:5000',
      },
    });
    await app.startAllMicroservices();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /productos devuelve los 3 productos', () => {
    return request(app.getHttpServer())
      .get('/productos')
      .expect(200)
      .expect((res) => expect(res.body).toHaveLength(3));
  });

  it('GET /productos/1 devuelve el producto', () => {
    return request(app.getHttpServer())
      .get('/productos/1')
      .expect(200, { id: 1, nombre: 'Teclado mecánico', precio: 45.9 });
  });

  it('GET /productos/999 responde 404', () => {
    return request(app.getHttpServer()).get('/productos/999').expect(404);
  });

  it('GET /productos/abc responde 400', () => {
    return request(app.getHttpServer()).get('/productos/abc').expect(400);
  });

  it('GET /productos/buscar?precioMaximo=50 filtra', () => {
    return request(app.getHttpServer())
      .get('/productos/buscar?precioMaximo=50')
      .expect(200)
      .expect((res) => expect(res.body.map((p: { id: number }) => p.id)).toEqual([1, 2]));
  });

  it('GET /productos/buscar?precioMaximo=abc responde 400', () => {
    return request(app.getHttpServer()).get('/productos/buscar?precioMaximo=abc').expect(400);
  });

  it('GET /productos/buscar sin parámetro responde 400', () => {
    return request(app.getHttpServer()).get('/productos/buscar').expect(400);
  });
});
