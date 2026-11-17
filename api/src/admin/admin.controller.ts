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
  AdminPackPage,
  AdminPaymentDetail,
  AdminPaymentRow,
  AdminPaymentStats,
  AdminPreset,
  AdminProduct,
  AdminReportRow,
  AdminStats,
  AdminUserDetail,
  AdminUserRow,
  CreditAdjustInput,
  DemoteAdminInput,
  AdminAuditPage,
  FinanceSummary,
  LegalPublishInput,
  LegalVersionRow,
  ListQuery,
  Page,
  PackCreateInput,
  PackUpdateInput,
  PayoutInput,
  PaymentSettleInput,
  PayoutRow,
  ProductUpdateInput,
  PromoteAdminInput,
  SettingsUpdateInput,
  SettingsView,
  TopUpInput,
  TopUpRow,
  CalibrationInput,
  CalibrationRow,
  SimulationInput,
  SimulationView,
  ProviderBalanceRow,
  UserStatusActionInput,
  PricingSections,
  PricingPreview,
  PricingDraftInput,
  PricingRollbackInput,
  ModelUpsertInput,
  ModelActiveInput,
  ModelTestResult,
  CalibrateInput,
  CalibrateApplyInput,
  CalibrationGrid,
  AdminModelDetail,
  ModelPriceInput,
  ModelOptionPriceInput,
} from '@yamboka/shared';
import {
  calibrateApplySchema,
  calibrateSchema,
  calibrationSchema,
  creditAdjustSchema,
  modelActiveSchema,
  modelOptionPriceSchema,
  modelPriceSchema,
  modelUpsertSchema,
  applyTopUpRateSchema,
  pricingDraftSchema,
  pricingRollbackSchema,
  demoteAdminSchema,
  paymentSettleSchema,
  legalPublishSchema,
  listQuerySchema,
  packCreateSchema,
  simulationSchema,
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
import { formatMicroUsd } from '../billing/usd';
import { ClientIp, CurrentUser, Roles } from '../common/decorators';
import { ModelCalibrationService } from '../generation/model-calibration.service';
import { ModelCatalogService } from '../generation/model-catalog.service';
import { PricingService } from '../pricing/pricing.service';
import type { AuthUser } from '../common/decorators';
import { ZodPipe } from '../common/zod.pipe';
import { AdminOfferService } from './admin-offer.service';
import { AdminOpsService } from './admin-ops.service';
import { AdminPricingService } from './admin-pricing.service';
import { AdminSimulatorService } from './admin-simulator.service';
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
const simulationQuery = new ZodPipe(simulationSchema);
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
    private readonly simulator: AdminSimulatorService,
    private readonly pricing: AdminPricingService,
    private readonly catalog: ModelCatalogService,
    private readonly calibration: ModelCalibrationService,
    private readonly pricingVersions: PricingService,
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
  listPacks(@Query(query) q: ListQuery): Promise<AdminPackPage> {
    return this.offer.listPacks(q);
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
    await this.offer.setPresetFeatured(
      admin.id,
      id,
      body.featured,
      body.reason,
      ip,
    );
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

  @Get('payments/stats')
  @ApiOperation({
    summary:
      'Compteurs du journal des paiements (dont anomalies), sur les filtres courants',
  })
  paymentStats(@Query(query) q: ListQuery): Promise<AdminPaymentStats> {
    return this.ops.paymentStats(q);
  }

  @Get('payments/:id')
  @ApiOperation({ summary: 'Fiche et chronologie d’un paiement' })
  getPayment(@Param('id', uuid) id: string): Promise<AdminPaymentDetail> {
    return this.ops.getPayment(id);
  }

  @HttpCode(200)
  @Post('payments/:id/settle')
  @ApiOperation({
    summary:
      'Régulariser un paiement confirmé non crédité (vérification du fournisseur obligatoire, motif consigné)',
  })
  settlePayment(
    @CurrentUser() admin: AuthUser,
    @Param('id', uuid) id: string,
    @Body(new ZodPipe(paymentSettleSchema)) body: PaymentSettleInput,
    @ClientIp() ip?: string,
  ) {
    return this.ops.settlePayment(admin.id, id, body, ip);
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
  @ApiOperation({
    summary:
      'Saisie d’une recharge du fournisseur : écrit le mouvement en dollars et fige le taux sortant mesuré',
  })
  async addTopUp(
    @CurrentUser() admin: AuthUser,
    @Body(new ZodPipe(topUpSchema)) body: TopUpInput,
  ): Promise<{ ok: true; topUpId: string; rOut: string }> {
    // Le taux mesuré n'est PAS appliqué ici : l'administration en demande l'aperçu, puis le confirme.
    const out = await this.ops.addTopUp(admin.id, body);
    return { ok: true, topUpId: out.id, rOut: out.rOut };
  }

  @Get('finance/topups/:id/rate-preview')
  @ApiOperation({
    summary:
      'Aperçu avant / après de la grille si le taux mesuré de cette recharge était appliqué. Rien n’est appliqué',
  })
  topUpRatePreview(@Param('id', uuid) id: string): Promise<PricingPreview> {
    return this.pricing.topUpRatePreview(id);
  }

  @Post('finance/topups/:id/apply-rate')
  @ApiOperation({
    summary:
      'Applique le taux mesuré de cette recharge à la grille, après confirmation. Idempotent',
  })
  applyTopUpRate(
    @CurrentUser() admin: AuthUser,
    @Param('id', uuid) id: string,
    @Body(new ZodPipe(applyTopUpRateSchema)) body: { note: string },
    @ClientIp() ip?: string,
  ): Promise<{ applied: boolean; pricingRate: string }> {
    return this.pricing.applyTopUpRate(admin.id, id, body.note, ip);
  }

  @Get('finance/simulate')
  @ApiOperation({
    summary:
      'Simulateur : coût, net attendu et crédits à facturer par vidéo, pour un scénario donné (lecture seule, rien n’est enregistré)',
  })
  simulate(
    @Query(simulationQuery) q: SimulationInput,
  ): Promise<SimulationView> {
    return this.simulator.simulate({
      ...q,
      durations: q.durations?.split(',').map(Number),
    });
  }

  @Get('finance/provider-balance')
  @ApiOperation({
    summary:
      'Solde prépayé du fournisseur tel que le journal le connaît, et taux retenu pour tarifer',
  })
  providerBalance(): Promise<ProviderBalanceRow> {
    return this.ops.providerBalance();
  }

  @Get('finance/calibrations')
  listCalibrations(): Promise<CalibrationRow[]> {
    return this.ops.listCalibrations();
  }

  @Post('finance/calibrations')
  @ApiOperation({
    summary:
      'Recalage du solde sur la valeur lue dans la console du fournisseur : enregistre l’écart constaté',
  })
  addCalibration(
    @CurrentUser() admin: AuthUser,
    @Body(new ZodPipe(calibrationSchema)) body: CalibrationInput,
  ): Promise<{ deltaUsd: string; estimatedUsd: string }> {
    return this.ops.addCalibration(admin.id, body);
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

  // ───────────── Configuration des calculs ─────────────

  @Get('pricing')
  @ApiOperation({
    summary:
      'Configuration des calculs : version en vigueur, historique, modèles, packs, moyens de paiement et alertes',
  })
  pricingSections(): Promise<PricingSections> {
    return this.pricing.sections();
  }

  @Post('pricing/preview')
  @ApiOperation({
    summary:
      'Aperçu avant / après d’un brouillon, par modèle, qualité et durée. Lecture seule : rien n’est enregistré',
  })
  @HttpCode(200)
  pricingPreview(
    @Body(new ZodPipe(pricingDraftSchema)) body: PricingDraftInput,
  ): Promise<PricingPreview> {
    return this.pricing.preview(body);
  }

  @Post('pricing/apply')
  @ApiOperation({
    summary:
      'Applique le brouillon : nouvelle version prise en compte immédiatement, sans redéploiement',
  })
  pricingApply(
    @CurrentUser() admin: AuthUser,
    @Body(new ZodPipe(pricingDraftSchema)) body: PricingDraftInput,
    @ClientIp() ip?: string,
  ): Promise<{ versionId: string; appliedAt: string }> {
    return this.pricing.apply(admin.id, body, ip);
  }

  @Post('pricing/rollback')
  @ApiOperation({
    summary:
      'Retour à une version précédente : une nouvelle version la recopie, rien n’est supprimé',
  })
  pricingRollback(
    @CurrentUser() admin: AuthUser,
    @Body(new ZodPipe(pricingRollbackSchema)) body: PricingRollbackInput,
    @ClientIp() ip?: string,
  ): Promise<{ versionId: string }> {
    return this.pricing.rollback(admin.id, body.versionId, body.note, ip);
  }

  // ───────────── Catalogue de modèles ─────────────
  // Le slug d'un modèle contient des « / » (« alibaba/wan-3.0/image-to-video ») : il ne peut donc pas être
  // un segment d'URL. Il passe en paramètre de requête ou dans le corps.

  @Post('models')
  @ApiOperation({
    summary:
      'Crée ou modifie un modèle et son schéma de paramètres. Un modèle créé est inactif tant que son tarif n’est pas complet',
  })
  upsertModel(
    @CurrentUser() admin: AuthUser,
    @Body(new ZodPipe(modelUpsertSchema)) body: ModelUpsertInput,
  ): Promise<{ slug: string; active: boolean }> {
    return this.catalog
      .upsert(body, admin.id)
      .then((m) => ({ slug: m.slug, active: m.active }));
  }

  @Get('models/detail')
  @ApiOperation({
    summary:
      'Détail d’un modèle pour l’édition : schéma des paramètres, tarifs et règles d’option en vigueur, combinaisons sans tarif',
  })
  modelDetail(@Query('slug') slug: string): Promise<AdminModelDetail> {
    return this.pricing.modelDetail(slug);
  }

  @Post('models/prices')
  @ApiOperation({
    summary:
      'Tarif de base d’un modèle pour une résolution, saisi à la main. Ajoute une version datée (source MANUAL)',
  })
  async addModelPrice(
    @CurrentUser() admin: AuthUser,
    @Query('slug') slug: string,
    @Body(new ZodPipe(modelPriceSchema)) body: ModelPriceInput,
  ): Promise<{ ok: true }> {
    await this.pricingVersions.addModelPrice({
      providerModel: slug,
      resolution: body.resolution,
      billingUnit: body.billingUnit,
      usdPerUnit: body.usdPerUnit,
      billableMultiplier: body.billableMultiplier,
      minSeconds: body.minSeconds,
      maxSeconds: body.maxSeconds,
      source: 'MANUAL',
      note: body.note,
      adminId: admin.id,
    });
    this.catalog.invalidate();
    return { ok: true };
  }

  @Post('models/option-prices')
  @ApiOperation({
    summary:
      'Règle de prix d’une option payante : supplément par unité facturée, ou multiplicateur du tarif. Ajoute une version datée',
  })
  async addModelOptionPrice(
    @CurrentUser() admin: AuthUser,
    @Query('slug') slug: string,
    @Body(new ZodPipe(modelOptionPriceSchema)) body: ModelOptionPriceInput,
  ): Promise<{ ok: true }> {
    await this.pricingVersions.addModelOptionPrice({
      providerModel: slug,
      paramKey: body.paramKey,
      triggerValue: body.triggerValue,
      kind: body.kind,
      usdPerUnit: body.usdPerUnit,
      multiplier: body.multiplier,
      source: 'MANUAL',
      note: body.note,
      adminId: admin.id,
    });
    this.catalog.invalidate();
    return { ok: true };
  }

  @Post('models/active')
  @ApiOperation({
    summary:
      'Active ou désactive un modèle. L’activation est refusée si une combinaison autorisée n’a pas de tarif',
  })
  @HttpCode(200)
  setModelActive(
    @CurrentUser() admin: AuthUser,
    @Query('slug') slug: string,
    @Body(new ZodPipe(modelActiveSchema)) body: ModelActiveInput,
  ): Promise<{ slug: string; active: boolean }> {
    return this.catalog
      .setActive(slug, body.active, admin.id)
      .then((m) => ({ slug: m.slug, active: m.active }));
  }

  @Post('models/test')
  @ApiOperation({
    summary:
      'Teste un modèle sans rien produire : vérifie le schéma et demande le prix au fournisseur (gratuit)',
  })
  @HttpCode(200)
  testModel(@Query('slug') slug: string): Promise<ModelTestResult> {
    return this.calibration.testModel(slug);
  }

  @Post('models/calibrate')
  @ApiOperation({
    summary:
      'Calibrage : /estimate sur la grille complète et tableau de prix proposé. Rien n’est appliqué',
  })
  @HttpCode(200)
  async calibrateModel(
    @CurrentUser() admin: AuthUser,
    @Query('slug') slug: string,
    @Body(new ZodPipe(calibrateSchema)) body: CalibrateInput,
  ): Promise<CalibrationGrid> {
    const grid = await this.calibration.estimateGrid(slug, {
      durations: body.durations,
      adminId: admin.id,
    });
    return {
      slug: grid.slug,
      maxDeviationPercent: grid.maxDeviationPercent,
      rows: grid.rows.map((r) => ({
        resolution: r.resolution,
        options: r.options,
        durationSeconds: r.durationSeconds,
        configuredUsdPerUnit: formatMicroUsd(r.configuredMicroUsdPerUnit, 6),
        observedUsdPerUnit:
          r.observedMicroUsdPerUnit === null
            ? null
            : formatMicroUsd(r.observedMicroUsdPerUnit, 6),
        deviationPercent: r.deviationPercent,
        error: r.error,
      })),
    };
  }

  @Post('models/calibrate/apply')
  @ApiOperation({
    summary:
      'Applique le tableau de calibrage proposé : une nouvelle version de tarif par résolution, source ESTIMATE',
  })
  calibrateApply(
    @CurrentUser() admin: AuthUser,
    @Query('slug') slug: string,
    @Body(new ZodPipe(calibrateApplySchema)) body: CalibrateApplyInput,
  ): Promise<{ applied: number }> {
    return this.calibration.applyGrid(slug, body.rows, {
      adminId: admin.id,
      note: body.note,
    });
  }

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
  listAudit(@Query(query) q: ListQuery): Promise<AdminAuditPage> {
    return this.ops.listAudit(q);
  }
}
