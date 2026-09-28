import { Test, TestingModule } from '@nestjs/testing';
import { RpcException } from '@nestjs/microservices';
import { status } from '@grpc/grpc-js';
import { lastValueFrom, toArray } from 'rxjs';
import { AppController } from './app.controller';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('ObtenerProducto (unary)', () => {
    it('devuelve el producto cuando existe', () => {
      expect(appController.obtenerProducto({ id: 1 })).toEqual({ id: 1, nombre: 'Teclado mecánico', precio: 45.9 });
    });

    it('lanza NOT_FOUND cuando no existe', () => {
      try {
        appController.obtenerProducto({ id: 999 });
        throw new Error('debía lanzar RpcException');
      } catch (err) {
        expect(err).toBeInstanceOf(RpcException);
        expect((err as RpcException).getError()).toEqual({ code: status.NOT_FOUND, message: 'Producto 999 no existe' });
      }
    });
  });

  describe('ListarProductos (server streaming)', () => {
    it('envía los 3 productos', async () => {
      const productos = await lastValueFrom(appController.listarProductos().pipe(toArray()));
      expect(productos.map((p) => p.id)).toEqual([1, 2, 3]);
    });
  });

  describe('BuscarPorPrecioMaximo (server streaming)', () => {
    it('filtra por precio máximo', async () => {
      const productos = await lastValueFrom(appController.buscarPorPrecioMaximo({ precioMaximo: 50 }).pipe(toArray()));
      expect(productos.map((p) => p.nombre)).toEqual(['Teclado mecánico', 'Mouse inalámbrico']);
    });

    it('termina sin datos si ninguno cumple', async () => {
      const productos = await lastValueFrom(appController.buscarPorPrecioMaximo({ precioMaximo: 1 }).pipe(toArray()));
      expect(productos).toEqual([]);
    });
  });
});
