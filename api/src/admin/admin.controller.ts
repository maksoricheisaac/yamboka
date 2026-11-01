import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type {
  AdminAccount,
  AdminGenerationRow,
  AdminPack,
  AdminPaymentRow,
  AdminPreset,
  AdminProduct,
  AdminReportRow,
  AdminStats,
  AdminUserDetail,
  AdminUserRow,
  AuditRow,
  CreditAdjustInput,
  DemoteAdminInput,
  FinanceSummary,
  LegalPublishInput,
  LegalVersionRow,
  ListQuery,
  Page,
  PackCreateInput,
  PackUpdateInput,
  PayoutInput,
  PayoutRow,
  ProductUpdateInput,
  PromoteAdminInput,
  SettingsUpdateInput,
  SettingsView,
  TopUpInput,
  TopUpRow,
  UserStatusActionInput,
} from '@yamboka/shared';
import {
  creditAdjustSchema,
  demoteAdminSchema,
  legalPublishSchema,
  listQuerySchema,
  packCreateSchema,
  packUpdateSchema,
  payoutSchema,
  productUpdateSchema,
  promoteAdminSchema,
  reasonSchema,
  settingsUpdateSchema,
  topUpSchema,
  userStatusActionSchema,
} from '@yamboka/shared';
import type { Response } from 'express';
import { z } from 'zod';
import { ClientIp, CurrentUser, Roles } from '../common/decorators';
import type { AuthUser } from '../common/decorators';
import { ZodPipe } from '../common/zod.pipe';
import { AdminOfferService } from './admin-offer.service';
import { AdminOpsService } from './admin-ops.service';
import { AdminUsersService } from './admin-users.service';

const query = new ZodPipe(listQuerySchema);
const uuid = new ParseUUIDPipe({ version: undefined });
const reportBody = new ZodPipe(
  z.object({
    status: z.enum(['IN_PROGRESS', 'RESOLVED', 'REJECTED']),
    resolution: reasonSchema,
  }),
);
const hideBody = new ZodPipe(
  z.object({ hidden: z.boolean(), reason: reasonSchema }),
);
const presetBody = new ZodPipe(
  z.object({ visible: z.boolean(), reason: reasonSchema }),
);
const featuredBody = new ZodPipe(
  z.object({ featured: z.boolean(), reason: reasonSchema }),
);
const statsQuery = new ZodPipe(
  z.object({
    days: z.coerce.number().int().min(1).max(366).default(30),
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
  }),
);
const periodQuery = new ZodPipe(
  z.object({ from: z.iso.date().optional(), to: z.iso.date().optional() }),
);

/**
 * Toutes les routes /admin/* exigent le rôle ADMIN, vérifié côté serveur par RolesGuard (le proxy Next.js
 * et le masquage des menus ne sont que du confort). Les opérations qui modifient des données exigent un motif
 * et écrivent le journal d'audit dans la même transaction.
 */
@ApiTags('admin')
@Roles('ADMIN')
@Controller('admin')
export class AdminController {
  constructor(
    private readonly users: AdminUsersService,
    private readonly offer: AdminOfferService,
    private readonly ops: AdminOpsService,
  ) {}

  @Get('ping')
  @ApiOperation({ summary: 'Contrôle d’accès administrateur' })
  ping(): { ok: true } {
    return { ok: true };
  }

  // ───────────── Pilotage ─────────────

  @Get('stats')
  @ApiOperation({ summary: 'Indicateurs du tableau de bord' })
  stats(
    @Query(statsQuery) q: { days: number; from?: string; to?: string },
  ): Promise<AdminStats> {
    return this.ops.stats(q);
  }

  // ───────────── Clients ─────────────

  @Get('users')
  listUsers(
    @Query(query) q: ListQuery,
    @Query('role') role?: string,
  ): Promise<Page<AdminUserRow>> {
    return this.users.list({ ...q, role });
  }

  @Get('users/:id')
  userDetail(@Param('id', uuid) id: string): Promise<AdminUserDetail> {
    return this.users.detail(id);
  }

  @HttpCode(200)
  @Post('users/:id/status')
  @ApiOperation({
    summary: 'Suspendre, bannir ou réactiver (motif obligatoire)',
  })
  async setStatus(
    @CurrentUser() admin: AuthUser,
    @Param('id', uuid) id: string,
    @Body(new ZodPipe(userStatusActionSchema)) body: UserStatusActionInput,
    @ClientIp() ip?: string,
  ): Promise<{ ok: true }> {
    await this.users.setStatus(admin.id, id, body, ip);
    return { ok: true };
  }

  @HttpCode(200)
  @Post('users/:id/credits')
  @ApiOperation({
    summary: 'Ajuster les crédits (motif obligatoire, journalisé)',
  })
  adjustCredits(
    @CurrentUser() admin: AuthUser,
    @Param('id', uuid) id: string,
    @Body(new ZodPipe(creditAdjustSchema)) body: CreditAdjustInput,
    @ClientIp() ip?: string,
  ): Promise<{ balance: number }> {
    return this.users.adjustCredits(admin.id, id, body, ip);
  }

  @Get('reports')
  listReports(@Query(query) q: ListQuery): Promise<Page<AdminReportRow>> {
    return this.users.listReports(q);
  }

  @HttpCode(200)
  @Post('reports/:id/handle')
  async handleReport(
    @CurrentUser() admin: AuthUser,
    @Param('id', uuid) id: string,
    @Body(reportBody)
    body: {
      status: 'IN_PROGRESS' | 'RESOLVED' | 'REJECTED';
      resolution: string;
    },
    @ClientIp() ip?: string,
  ): Promise<{ ok: true }> {
    await this.users.handleReport(
      admin.id,
      id,
      body.status,
      body.resolution,
      ip,
    );
    return { ok: true };
  }

  // ───────────── Générations et modération ─────────────

  @Get('generations')
  listGenerations(
    @Query(query) q: ListQuery,
    @Query('presetId') presetId?: string,
  ): Promise<Page<AdminGenerationRow>> {
    return this.ops.listGenerations({ ...q, presetId });
  }

  @HttpCode(200)
  @Post('generations/:id/hide')
  async hideGeneration(
    @CurrentUser() admin: AuthUser,
    @Param('id', uuid) id: string,
    @Body(hideBody) body: { hidden: boolean; reason: string },
    @ClientIp() ip?: string,
  ): Promise<{ ok: true }> {
    await this.ops.setGenerationHidden(
      admin.id,
      id,
      body.hidden,
      body.reason,
      ip,
    );
    return { ok: true };
  }

  // ───────────── Offre ─────────────

  @Get('packs')
  listPacks(): Promise<AdminPack[]> {
    return this.offer.listPacks();
  }

  @Post('packs')
  createPack(
    @CurrentUser() admin: AuthUser,
    @Body(new ZodPipe(packCreateSchema)) body: PackCreateInput,
    @ClientIp() ip?: string,
  ): Promise<AdminPack> {
    return this.offer.createPack(admin.id, body, ip);
  }

  @Patch('packs/:id')
  @ApiOperation({
    summary: 'Modifier un pack : marge minimale, 3 offres publiques maximum',
  })
  updatePack(
    @CurrentUser() admin: AuthUser,
    @Param('id', uuid) id: string,
    @Body(new ZodPipe(packUpdateSchema)) body: PackUpdateInput,
    @ClientIp() ip?: string,
  ): Promise<AdminPack> {
    return this.offer.updatePack(admin.id, id, body, ip);
  }

  @Get('products')
  listProducts(): Promise<AdminProduct[]> {
    return this.offer.listProducts();
  }

  @Patch('products/:id')
  async updateProduct(
    @CurrentUser() admin: AuthUser,
    @Param('id', uuid) id: string,
    @Body(new ZodPipe(productUpdateSchema)) body: ProductUpdateInput,
    @ClientIp() ip?: string,
  ): Promise<{ ok: true }> {
    await this.offer.updateProduct(admin.id, id, body, ip);
    return { ok: true };
  }

  @Get('presets')
  listPresets(): Promise<AdminPreset[]> {
    return this.offer.listPresets();
  }

  @Patch('presets/:id/featured')
  async setPresetFeatured(
    @CurrentUser() admin: AuthUser,
    @Param('id', uuid) id: string,
    @Body(featuredBody) body: { featured: boolean; reason: string },
    @ClientIp() ip?: string,
  ): Promise<{ ok: true }> {
    await this.offer.setPresetFeatured(admin.id, id, body.featured, body.reason, ip);
    return { ok: true };
  }

  @Patch('presets/:id')
  async setPreset(
    @CurrentUser() admin: AuthUser,
    @Param('id', uuid) id: string,
    @Body(presetBody) body: { visible: boolean; reason: string },
    @ClientIp() ip?: string,
  ): Promise<{ ok: true }> {
    await this.offer.setPresetVisible(
      admin.id,
      id,
      body.visible,
      body.reason,
      ip,
    );
    return { ok: true };
  }

  // ───────────── Finances ─────────────

  @Get('payments')
  listPayments(@Query(query) q: ListQuery): Promise<Page<AdminPaymentRow>> {
    return this.ops.listPayments(q);
  }

  @HttpCode(200)
  @Post('payments/:id/verify')
  @ApiOperation({ summary: 'Revérifier un paiement auprès du fournisseur' })
  verifyPayment(
    @CurrentUser() admin: AuthUser,
    @Param('id', uuid) id: string,
    @ClientIp() ip?: string,
  ): Promise<{ status: string }> {
    return this.ops.verifyPayment(admin.id, id, ip);
  }

  @Get('finance/summary')
  financeSummary(
    @Query(periodQuery) q: { from?: string; to?: string },
  ): Promise<FinanceSummary> {
    return this.ops.financeSummary(q);
  }

  @Get('finance/export.csv')
  @ApiOperation({ summary: 'Export CSV des paiements de la période' })
  async exportCsv(
    @Query(query) q: ListQuery,
    @Res() res: Response,
  ): Promise<void> {
    const csv = await this.ops.exportPaymentsCsv(q);
    res
      .type('text/csv; charset=utf-8')
      .set(
        'Content-Disposition',
        'attachment; filename="paiements-yamboka.csv"',
      )
      .send(`\uFEFF${csv}`);
  }

  @Get('finance/topups')
  listTopUps(): Promise<TopUpRow[]> {
    return this.ops.listTopUps();
  }

  @Post('finance/topups')
  async addTopUp(
    @CurrentUser() admin: AuthUser,
    @Body(new ZodPipe(topUpSchema)) body: TopUpInput,
    @ClientIp() ip?: string,
  ): Promise<{ ok: true }> {
    await this.ops.addTopUp(admin.id, body, ip);
    return { ok: true };
  }

  @Get('finance/payouts')
  listPayouts(): Promise<PayoutRow[]> {
    return this.ops.listPayouts();
  }

  @Post('finance/payouts')
  async addPayout(
    @CurrentUser() admin: AuthUser,
    @Body(new ZodPipe(payoutSchema)) body: PayoutInput,
    @ClientIp() ip?: string,
  ): Promise<{ ok: true }> {
    await this.ops.addPayout(admin.id, body, ip);
    return { ok: true };
  }

  // ───────────── Configuration ─────────────

  @Get('settings')
  getSettings(): Promise<SettingsView> {
    return this.ops.getSettings();
  }

  @Patch('settings')
  updateSettings(
    @CurrentUser() admin: AuthUser,
    @Body(new ZodPipe(settingsUpdateSchema)) body: SettingsUpdateInput,
    @ClientIp() ip?: string,
  ): Promise<SettingsView> {
    return this.ops.updateSettings(admin.id, body, ip);
  }

  @Throttle({
    auth: { limit: 3, ttl: 60_000 },
    global: { limit: 6, ttl: 60_000 },
  })
  @HttpCode(200)
  @Post('email/test')
  @ApiOperation({
    summary:
      'Vérifie la configuration e-mail et envoie un test à l’administrateur connecté',
  })
  testEmail(
    @CurrentUser() admin: AuthUser,
  ): Promise<{ ok: boolean; provider: string; detail: string }> {
    return this.ops.testEmail(admin.id);
  }

  @Get('legal')
  listLegal(): Promise<LegalVersionRow[]> {
    return this.ops.listLegal();
  }

  @Post('legal')
  async publishLegal(
    @CurrentUser() admin: AuthUser,
    @Body(new ZodPipe(legalPublishSchema)) body: LegalPublishInput,
    @ClientIp() ip?: string,
  ): Promise<{ ok: true }> {
    await this.ops.publishLegal(admin.id, body, ip);
    return { ok: true };
  }

  @Get('admins')
  listAdmins(): Promise<AdminAccount[]> {
    return this.ops.listAdmins();
  }

  @HttpCode(200)
  @Post('admins')
  @ApiOperation({
    summary: 'Donner l’accès administrateur à un compte vérifié existant',
  })
  async promote(
    @CurrentUser() admin: AuthUser,
    @Body(new ZodPipe(promoteAdminSchema)) body: PromoteAdminInput,
    @ClientIp() ip?: string,
  ): Promise<{ ok: true }> {
    await this.ops.promote(admin.id, body, ip);
    return { ok: true };
  }

  @HttpCode(200)
  @Post('admins/:id/demote')
  async demote(
    @CurrentUser() admin: AuthUser,
    @Param('id', uuid) id: string,
    @Body(new ZodPipe(demoteAdminSchema)) body: DemoteAdminInput,
    @ClientIp() ip?: string,
  ): Promise<{ ok: true }> {
    await this.ops.demote(admin.id, id, body.reason, ip);
    return { ok: true };
  }

  // ───────────── Audit ─────────────

  @Get('audit')
  listAudit(@Query(query) q: ListQuery): Promise<Page<AuditRow>> {
    return this.ops.listAudit(q);
  }
}
