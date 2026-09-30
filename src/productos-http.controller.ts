import { Controller, Get, Inject, NotFoundException, OnModuleInit, Param, ParseFloatPipe, ParseIntPipe, Query, Sse, MessageEvent } from '@nestjs/common';
import type { ClientGrpc } from '@nestjs/microservices';
import { ApiBadRequestResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { status } from '@grpc/grpc-js';
import { Observable, catchError, concat, map, of, throwError, toArray } from 'rxjs';
import { ProductoDto } from './producto.dto';

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
  @ApiOkResponse({ type: [ProductoDto] })
  listar() {
    return this.productoService.listarProductos({}).pipe(toArray());
  }

  @Get('buscar')
  @ApiOperation({ summary: 'Filtra por precio máximo (gRPC: BuscarPorPrecioMaximo, server streaming)' })
  @ApiQuery({ name: 'precioMaximo', type: Number, example: 50 })
  @ApiOkResponse({ type: [ProductoDto] })
  @ApiBadRequestResponse({ description: 'precioMaximo falta o no es un número' })
  buscar(@Query('precioMaximo', ParseFloatPipe) precioMaximo: number) {
    return this.productoService
      .buscarPorPrecioMaximo({ precioMaximo })
      .pipe(toArray());
  }

  // ===== Streaming en vivo para la página web (Server-Sent Events) =====

  @Sse('stream/listar')
  @ApiOperation({ summary: 'Streaming en vivo (SSE) de ListarProductos, para la página web' })
  listarEnVivo(): Observable<MessageEvent> {
    return this.aEventos(this.productoService.listarProductos({}));
  }

  @Sse('stream/buscar')
  @ApiOperation({ summary: 'Streaming en vivo (SSE) de BuscarPorPrecioMaximo, para la página web' })
  @ApiQuery({ name: 'precioMaximo', type: Number, example: 50 })
  buscarEnVivo(@Query('precioMaximo', ParseFloatPipe) precioMaximo: number): Observable<MessageEvent> {
    return this.aEventos(this.productoService.buscarPorPrecioMaximo({ precioMaximo }));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtiene un producto por id (gRPC: ObtenerProducto, unary)' })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiOkResponse({ type: ProductoDto })
  @ApiBadRequestResponse({ description: 'El id no es un número entero' })
  @ApiNotFoundResponse({ description: 'No existe un producto con ese id' })
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

  // Convierte el stream gRPC en eventos SSE: "producto" por cada mensaje, "fin" al terminar, "fallo" si hay error
  private aEventos(stream: Observable<ProductoResponse>): Observable<MessageEvent> {
    return concat(
      stream.pipe(map((producto) => ({ type: 'producto', data: producto }) as MessageEvent)),
      of({ type: 'fin', data: { mensaje: 'Stream finalizado' } } as MessageEvent),
    ).pipe(
      catchError((err) =>
        of({ type: 'fallo', data: { code: err.code, details: err.details } } as MessageEvent),
      ),
    );
  }
}
