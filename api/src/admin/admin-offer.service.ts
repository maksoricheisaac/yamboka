import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type {
  AdminPack,
  AdminPreset,
  AdminProduct,
  PackCreateInput,
  PackUpdateInput,
  ProductUpdateInput,
} from '@yamboka/shared';
import { AuditService } from '../audit/audit.service';
import { PublicSiteService } from './public-site.service';
import { CatalogService, toPricing } from '../catalog/catalog.service';
import {
  MarginSettings,
  PackPricing,
  computeMargin,
  packTotalCredits,
} from '../catalog/pricing';
import type { CreditPack, GenerationProduct } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/** Une offre publique : trois packs au maximum, une seule recommandée. */
export const MAX_PUBLIC_PACKS = 3;

@Injectable()
export class AdminOfferService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalog: CatalogService,
    private readonly audit: AuditService,
    private readonly site: PublicSiteService,
  ) {}

  /** Marge du pack sur chaque produit actif (référence : 10 s de vidéo, ou 1 image), et la pire. */
  private evaluate(
    pack: PackPricing,
    products: GenerationProduct[],
    s: MarginSettings,
  ) {
    const margins = products
      .filter((p) => p.active)
      .map((p) => {
        const m = computeMargin(
          toPricing(p),
          pack,
          p.billingUnit === 'SECOND' ? 10 : 1,
          s,
        );
        return {
          product: p.code,
          marginPercent: Math.round(m.marginPercent * 10) / 10,
          belowThreshold: m.belowThreshold,
        };
      });
    const worst = margins.length
      ? Math.min(...margins.map((m) => m.marginPercent))
      : null;
    return {
      margins,
      worstMarginPercent: worst,
      belowThreshold: margins.some((m) => m.belowThreshold),
    };
  }

  private view(
    p: CreditPack,
    products: GenerationProduct[],
    s: MarginSettings,
  ): AdminPack {
    const pricing = {
      price: p.price,
      baseCredits: p.credits,
      bonusPercent: p.bonusPercent,
    };
    return {
      id: p.id,
      name: p.name,
      priceFcfa: p.price,
      baseCredits: p.credits,
      bonusPercent: p.bonusPercent,
      totalCredits: packTotalCredits(pricing),
      active: p.active,
      featured: p.featured,
      publicVisible: p.publicVisible,
      sortOrder: p.sortOrder,
      ...this.evaluate(pricing, products, s),
    };
  }

  async listPacks(): Promise<AdminPack[]> {
    const [packs, products, s] = await Promise.all([
      this.prisma.creditPack.findMany({ orderBy: { sortOrder: 'asc' } }),
      this.prisma.generationProduct.findMany(),
      this.catalog.marginSettings(),
    ]);
    return packs.map((p) => this.view(p, products, s));
  }

  async createPack(
    adminId: string,
    input: PackCreateInput,
    ip?: string,
  ): Promise<AdminPack> {
    const [products, s, max] = await Promise.all([
      this.prisma.generationProduct.findMany(),
      this.catalog.marginSettings(),
      this.prisma.creditPack.aggregate({ _max: { sortOrder: true } }),
    ]);
    // Un nouveau pack naît inactif et non public : il doit passer le contrôle de marge pour être publié.
    try {
      const pack = await this.prisma.$transaction(async (tx) => {
        const created = await tx.creditPack.create({
          data: {
            name: input.name,
            price: input.price,
            credits: input.credits,
            bonusPercent: input.bonusPercent,
            active: false,
            publicVisible: false,
            sortOrder: (max._max.sortOrder ?? 0) + 1,
          },
        });
        await this.audit.log(
          {
            actorId: adminId,
            action: 'pack.create',
            entityType: 'CreditPack',
            entityId: created.id,
            after: {
              name: created.name,
              price: created.price,
              credits: created.credits,
              bonusPercent: created.bonusPercent,
            },
            reason: input.reason,
            ip,
          },
          tx,
        );
        return created;
      });
      return this.view(pack, products, s);
    } catch (e) {
      if ((e as { code?: string }).code === 'P2002') {
        throw new ConflictException({
          code: 'NAME_TAKEN',
          message: 'Un pack porte déjà ce nom.',
        });
      }
      throw e;
    }
  }

  /**
   * Modification d'un pack. Garde-fous métier :
   *  - un pack publié (actif) doit respecter la marge minimale sur chaque produit actif ;
   *  - un pack inactif ne peut pas être public ;
   *  - trois packs publics au maximum, dont une seule recommandation.
   */
  async updatePack(
    adminId: string,
    id: string,
    input: PackUpdateInput,
    ip?: string,
  ): Promise<AdminPack> {
    const current = await this.prisma.creditPack.findUnique({ where: { id } });
    if (!current)
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Pack introuvable.',
      });

    const { reason, ...changes } = input;
    const next = {
      ...current,
      ...Object.fromEntries(
        Object.entries(changes).filter(([, v]) => v !== undefined),
      ),
    };
    if (!next.active) next.publicVisible = false;

    const [products, s] = await Promise.all([
      this.prisma.generationProduct.findMany(),
      this.catalog.marginSettings(),
    ]);
    const evalNext = this.evaluate(
      {
        price: next.price,
        baseCredits: next.credits,
        bonusPercent: next.bonusPercent,
      },
      products,
      s,
    );

    // Rentabilité vérifiée avant publication : on refuse d'activer ou de modifier un pack actif sous le seuil.
    if (next.active && evalNext.belowThreshold) {
      const bad = evalNext.margins.find((m) => m.belowThreshold)!;
      throw new UnprocessableEntityException({
        code: 'MARGIN_TOO_LOW',
        message: `Marge insuffisante : ${bad.marginPercent} % sur « ${bad.product} » (minimum ${s.minMarginPercent} %). Ce pack ne peut pas être publié à ces conditions.`,
      });
    }

    if (next.publicVisible) {
      const publicOthers = await this.prisma.creditPack.count({
        where: {
          publicVisible: true,
          active: true,
          id: { not: id },
          country: current.country,
        },
      });
      if (publicOthers + 1 > MAX_PUBLIC_PACKS) {
        throw new UnprocessableEntityException({
          code: 'TOO_MANY_PUBLIC',
          message: `Trois offres publiques au maximum. Retirez-en une avant d’en afficher une autre.`,
        });
      }
    }

    const pack = await this.prisma.$transaction(async (tx) => {
      // Une seule recommandation parmi les offres publiques.
      const featuredNow = changes.featured === true && next.publicVisible;
      if (featuredNow) {
        await tx.creditPack.updateMany({
          where: { id: { not: id }, country: current.country, featured: true },
          data: { featured: false },
        });
      }
      const updated = await tx.creditPack.update({
        where: { id },
        data: {
          price: next.price,
          credits: next.credits,
          bonusPercent: next.bonusPercent,
          active: next.active,
          publicVisible: next.publicVisible,
          featured:
            changes.featured !== undefined
              ? featuredNow
              : current.featured && next.publicVisible,
          sortOrder: next.sortOrder,
        },
      });
      await this.audit.log(
        {
          actorId: adminId,
          action: 'pack.update',
          entityType: 'CreditPack',
          entityId: id,
          before: snapshot(current),
          after: snapshot(updated),
          reason,
          ip,
        },
        tx,
      );
      return updated;
    });
    // Les prix, bonus et offres publiques changent pour tous : le site public se met à jour sans attendre.
    await this.site.refreshOffers();
    return this.view(pack, products, s);
  }

  // ───────────── Produits ─────────────

  async listProducts(): Promise<AdminProduct[]> {
    const rows = await this.prisma.generationProduct.findMany({
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((p) => ({
      id: p.id,
      code: p.code,
      name: p.name,
      billingUnit: p.billingUnit,
      creditsPerUnit: p.creditsPerUnit,
      providerCostUsdPerUnit: p.providerCostUsdPerUnit.toNumber(),
      phase: p.phase,
      active: p.active,
    }));
  }

  /** Activer un produit ou changer son prix en crédits ne doit jamais faire passer une offre publique sous la marge minimale. */
  async updateProduct(
    adminId: string,
    id: string,
    input: ProductUpdateInput,
    ip?: string,
  ): Promise<void> {
    const current = await this.prisma.generationProduct.findUnique({
      where: { id },
    });
    if (!current)
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Produit introuvable.',
      });
    const next = {
      ...current,
      active: input.active ?? current.active,
      creditsPerUnit: input.creditsPerUnit ?? current.creditsPerUnit,
    };

    if (next.active) {
      const [others, packs, s] = await Promise.all([
        this.prisma.generationProduct.findMany({ where: { id: { not: id } } }),
        this.prisma.creditPack.findMany({ where: { active: true } }),
        this.catalog.marginSettings(),
      ]);
      for (const pack of packs) {
        const ev = this.evaluate(
          {
            price: pack.price,
            baseCredits: pack.credits,
            bonusPercent: pack.bonusPercent,
          },
          [...others, next],
          s,
        );
        if (ev.belowThreshold) {
          throw new UnprocessableEntityException({
            code: 'MARGIN_TOO_LOW',
            message: `Ce changement rend le pack « ${pack.name} » non rentable (marge minimale ${s.minMarginPercent} %).`,
          });
        }
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.generationProduct.update({
        where: { id },
        data: { active: next.active, creditsPerUnit: next.creditsPerUnit },
      });
      await this.audit.log(
        {
          actorId: adminId,
          action: 'product.update',
          entityType: 'GenerationProduct',
          entityId: id,
          before: {
            active: current.active,
            creditsPerUnit: current.creditsPerUnit,
          },
          after: { active: next.active, creditsPerUnit: next.creditsPerUnit },
          reason: input.reason,
          ip,
        },
        tx,
      );
    });
    await this.site.refreshOffers();
  }

  // ───────────── Presets ─────────────

  async listPresets(): Promise<AdminPreset[]> {
    const rows = await this.prisma.preset.findMany({
      orderBy: { sortOrder: 'asc' },
      include: { product: true },
    });
    return rows.map((p) => ({
      id: p.id,
      name: p.name,
      category: p.category,
      type: p.type,
      productCode: p.product.code,
      visible: p.visible,
      featured: p.featured,
    }));
  }

  /** Mise en avant éditoriale : décision de l'administrateur, indépendante de la publication. */
  async setPresetFeatured(
    adminId: string,
    id: string,
    featured: boolean,
    reason: string,
    ip?: string,
  ): Promise<void> {
    const preset = await this.prisma.preset.findUnique({ where: { id } });
    if (!preset)
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Preset introuvable.',
      });
    if (featured && !preset.visible) {
      throw new BadRequestException({
        code: 'PRESET_NOT_PUBLISHED',
        message: 'Publiez ce preset avant de le mettre à la une.',
      });
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.preset.update({ where: { id }, data: { featured } });
      await this.audit.log(
        {
          actorId: adminId,
          action: featured ? 'preset.feature' : 'preset.unfeature',
          entityType: 'Preset',
          entityId: id,
          before: { featured: preset.featured },
          after: { featured },
          reason,
          ip,
        },
        tx,
      );
    });
  }

  async setPresetVisible(
    adminId: string,
    id: string,
    visible: boolean,
    reason: string,
    ip?: string,
  ): Promise<void> {
    const preset = await this.prisma.preset.findUnique({
      where: { id },
      include: { product: true },
    });
    if (!preset)
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Preset introuvable.',
      });
    if (visible && !preset.product.active) {
      throw new BadRequestException({
        code: 'PRODUCT_INACTIVE',
        message:
          'Le produit de ce preset est désactivé : activez-le avant de publier le preset.',
      });
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.preset.update({ where: { id }, data: { visible } });
      await this.audit.log(
        {
          actorId: adminId,
          action: visible ? 'preset.publish' : 'preset.unpublish',
          entityType: 'Preset',
          entityId: id,
          before: { visible: preset.visible },
          after: { visible },
          reason,
          ip,
        },
        tx,
      );
    });
  }
}

function snapshot(p: CreditPack) {
  return {
    price: p.price,
    credits: p.credits,
    bonusPercent: p.bonusPercent,
    active: p.active,
    featured: p.featured,
    publicVisible: p.publicVisible,
    sortOrder: p.sortOrder,
  };
}
