import { Controller } from '@nestjs/common';
import { GrpcMethod, RpcException } from '@nestjs/microservices';
import { status } from '@grpc/grpc-js';
import { Observable } from 'rxjs';

interface ProductoRequest { id: number; }
interface ProductoResponse { id: number; nombre: string; precio: number; }
interface FiltroPrecioRequest { precioMaximo: number; }

@Controller()
export class AppController {
  private readonly productos: ProductoResponse[] = [
    { id: 1, nombre: 'Teclado mecánico', precio: 45.90 },
    { id: 2, nombre: 'Mouse inalámbrico', precio: 19.50 },
    { id: 3, nombre: 'Monitor 24"', precio: 129.99 },
  ];

  @GrpcMethod('ProductoService', 'ObtenerProducto')
  obtenerProducto(data: ProductoRequest): ProductoResponse {
    const producto = this.productos.find((p) => p.id === data.id);
    if (!producto) {
      throw new RpcException({ code: status.NOT_FOUND, message: `Producto ${data.id} no existe` });
    }
    return producto;
  }

  @GrpcMethod('ProductoService', 'ListarProductos')
  listarProductos(): Observable<ProductoResponse> {
    return new Observable((subscriber) => {
      let i = 0;
      const interval = setInterval(() => {
        subscriber.next(this.productos[i]);
        i++;
        if (i >= this.productos.length) {
          clearInterval(interval);
          subscriber.complete();
        }
      }, 300);
    });
    
  }

    @GrpcMethod('ProductoService', 'BuscarPorPrecioMaximo')
  buscarPorPrecioMaximo(data: FiltroPrecioRequest): Observable<ProductoResponse> {
    const filtrados = this.productos.filter((p) => p.precio <= data.precioMaximo);

    return new Observable((subscriber) => {
      if (filtrados.length === 0) {
        subscriber.complete();
        return;
      }

      let i = 0;
      const interval = setInterval(() => {
        subscriber.next(filtrados[i]);
        i++;
        if (i >= filtrados.length) {
          clearInterval(interval);
          subscriber.complete();
        }
      }, 300);
    });
  }
  
}