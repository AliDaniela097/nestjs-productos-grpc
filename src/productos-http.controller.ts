import { Controller, Get, Inject, NotFoundException, OnModuleInit, Param, ParseIntPipe, Query } from '@nestjs/common';
import type { ClientGrpc } from '@nestjs/microservices';
import { ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { status } from '@grpc/grpc-js';
import { Observable, catchError, throwError, toArray } from 'rxjs';

interface ProductoResponse { id: number; nombre: string; precio: number; }

// Los métodos del .proto que el mesero puede pedirle a la cocina
interface ProductoServiceClient {
  obtenerProducto(data: { id: number }): Observable<ProductoResponse>;
  listarProductos(data: {}): Observable<ProductoResponse>;
  buscarPorPrecioMaximo(data: { precioMaximo: number }): Observable<ProductoResponse>;
}

@ApiTags('Productos')
@Controller('productos')
export class ProductosHttpController implements OnModuleInit {
  private productoService: ProductoServiceClient;

  constructor(@Inject('PRODUCTOS_PACKAGE') private readonly client: ClientGrpc) {}

  onModuleInit() {
    this.productoService = this.client.getService<ProductoServiceClient>('ProductoService');
  }

  @Get()
  @ApiOperation({ summary: 'Lista todos los productos (gRPC: ListarProductos, server streaming)' })
  listar() {
    return this.productoService.listarProductos({}).pipe(toArray());
  }

  @Get('buscar')
  @ApiOperation({ summary: 'Filtra por precio máximo (gRPC: BuscarPorPrecioMaximo, server streaming)' })
  @ApiQuery({ name: 'precioMaximo', type: Number, example: 50 })
  buscar(@Query('precioMaximo') precioMaximo: string) {
    return this.productoService
      .buscarPorPrecioMaximo({ precioMaximo: Number(precioMaximo) })
      .pipe(toArray());
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtiene un producto por id (gRPC: ObtenerProducto, unary)' })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  obtener(@Param('id', ParseIntPipe) id: number) {
    return this.productoService.obtenerProducto({ id }).pipe(
      catchError((err) => {
        if (err.code === status.NOT_FOUND) {
          return throwError(() => new NotFoundException(err.details));
        }
        return throwError(() => err);
      }),
    );
  }
}