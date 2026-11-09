import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type {
  AdminCountryDetail,
  AdminCountryRow,
  AdminCountrySummary,
  AdminMethodRow,
  CatalogStatusBody,
  CountryListQuery,
  CurrencyPricingInput,
  MethodListQuery,
  Page,
} from '@yamboka/shared';
import {
  catalogStatusBodySchema,
  countryListQuerySchema,
  currencyPricingSchema,
  methodListQuerySchema,
} from '@yamboka/shared';
import { ClientIp, CurrentUser, Roles } from '../common/decorators';
import type { AuthUser } from '../common/decorators';
import { ZodPipe } from '../common/zod.pipe';
import { AdminCountriesService } from './admin-countries.service';

const countryQuery = new ZodPipe(countryListQuerySchema);
const methodQuery = new ZodPipe(methodListQuerySchema);
const statusBody = new ZodPipe(catalogStatusBodySchema);
const pricingBody = new ZodPipe(currencyPricingSchema);

/** Catalogue international : réservé aux administrateurs (RolesGuard). Chaque modification exige un motif et est auditée. */
@ApiTags('admin')
@Roles('ADMIN')
@Controller('admin')
export class AdminCountriesController {
  constructor(private readonly countries: AdminCountriesService) {}

  @Get('countries')
  list(
    @Query(countryQuery) q: CountryListQuery,
  ): Promise<Page<AdminCountryRow>> {
    return this.countries.listCountries(q);
  }

  @Get('countries/summary')
  summary(): Promise<AdminCountrySummary> {
    return this.countries.summary();
  }

  @Get('countries/:iso')
  get(@Param('iso') iso: string): Promise<AdminCountryDetail> {
    return this.countries.getCountry(iso);
  }

  @HttpCode(200)
  @Post('countries/:iso/status')
  async setStatus(
    @CurrentUser() admin: AuthUser,
    @Param('iso') iso: string,
    @Body(statusBody) body: CatalogStatusBody,
    @ClientIp() ip?: string,
  ): Promise<{ ok: true }> {
    await this.countries.setCountryStatus(
      admin.id,
      iso,
      body.status,
      body.reason,
      ip,
    );
    return { ok: true };
  }

  @HttpCode(200)
  @Post('countries/:iso/methods/:methodCode/status')
  async setMethodStatus(
    @CurrentUser() admin: AuthUser,
    @Param('iso') iso: string,
    @Param('methodCode') methodCode: string,
    @Body(statusBody) body: CatalogStatusBody,
    @ClientIp() ip?: string,
  ): Promise<{ ok: true }> {
    await this.countries.setMethodStatus(
      admin.id,
      iso,
      methodCode,
      body.status,
      body.reason,
      ip,
    );
    return { ok: true };
  }

  @HttpCode(200)
  @Post('countries/:iso/pricing')
  async setPricing(
    @CurrentUser() admin: AuthUser,
    @Param('iso') iso: string,
    @Body(pricingBody) body: CurrencyPricingInput,
    @ClientIp() ip?: string,
  ): Promise<{ ok: true }> {
    await this.countries.setCurrencyPricing(admin.id, iso, body, ip);
    return { ok: true };
  }

  @Get('payment-methods')
  listMethods(
    @Query(methodQuery) q: MethodListQuery,
  ): Promise<Page<AdminMethodRow>> {
    return this.countries.listMethods(q);
  }
}
