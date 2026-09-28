import { ApiProperty } from '@nestjs/swagger';

// Forma de ProductoResponse (src/productos.proto) para documentarla en Swagger
export class ProductoDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 'Teclado mecánico' })
  nombre: string;

  @ApiProperty({ example: 45.9 })
  precio: number;
}
