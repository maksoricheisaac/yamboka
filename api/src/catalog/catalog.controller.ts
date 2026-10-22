import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import type {
  PackView,
  ProductView,
  QuoteInput,
  QuoteView,
} from '@yamboka/shared';
import { quoteSchema } from '@yamboka/shared';
import { Public } from '../common/decorators';
import { jsonSchema } from '../common/json-schema';
import { ZodPipe } from '../common/zod.pipe';
import { CatalogService } from './catalog.service';

@ApiTags('catalog')
@Controller('catalog')
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Public()
  @Get('packs')
  @ApiOperation({
    summary: 'Packs de crédits actifs (prix, crédits, bonus, équivalents)',
  })
  async packs(): Promise<{ packs: PackView[] }> {
    return { packs: await this.catalog.listPacks() };
  }

  @Public()
  @Get('products')
  @ApiOperation({
    summary: 'Types de création disponibles et leur tarif en crédits',
  })
  async products(): Promise<{ products: ProductView[] }> {
    return { products: await this.catalog.listProducts() };
  }

  @HttpCode(200)
  @Post('quote')
  @ApiOperation({ summary: 'Coût exact d’une création, calculé côté serveur' })
  @ApiBody({ schema: jsonSchema(quoteSchema) })
  quote(@Body(new ZodPipe(quoteSchema)) body: QuoteInput): Promise<QuoteView> {
    return this.catalog.quote(body.productCode, body.durationSeconds);
  }
}
