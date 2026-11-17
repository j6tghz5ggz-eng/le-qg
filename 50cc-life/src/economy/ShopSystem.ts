/**
 * Boutique en ligne « Bécane Shop » : on commande depuis l'ordinateur du
 * garage, le colis arrive quelques secondes plus tard sur la palette (pièce
 * physique, à porter jusqu'à la moto). On revend les pièces qui traînent
 * dans le garage, à un prix qui dépend de leur état.
 */
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { GameContext, GameSystem } from '../app/GameContext';
import type { LoosePartInfo, MechanicsSystem } from '../mechanics/MechanicsSystem';
import { PART_CATALOG, PARTS } from '../mechanics/parts';
import type { SavedPart } from '../save/saveData';
import { t } from '../ui/i18n';
import { DELIVERY_SECONDS, SHOP_SECTIONS, describePart, sellPrice } from './shop';
import type { Wallet } from './Wallet';

export type BuyResult = 'ok' | 'money' | 'unknown';

/** Où arrivent les colis, et où les pièces peuvent être revendues (fournis par le monde). */
export interface ShopPlaces {
  readonly deliverySpot: Vector3;
  readonly sellArea: { readonly minX: number; readonly maxX: number; readonly minZ: number; readonly maxZ: number };
}

/** Produit hors pièces moteur (jerrican, huile…), fourni par un autre système. */
export interface ShopProduct {
  readonly id: string;
  /** Rayon de la boutique. */
  readonly section: string;
  readonly name: string;
  readonly detail: string;
  readonly price: number;
  /** Fait apparaître le produit livré à cette position. */
  deliver(position: Vector3): void;
}

/** Ligne affichée dans la boutique. */
export interface ShopItem {
  readonly id: string;
  readonly name: string;
  readonly detail: string;
  readonly price: number;
}

interface Delivery {
  /** Pièce du catalogue ou produit. */
  readonly id: string;
  left: number;
}

export class ShopSystem implements GameSystem {
  readonly id = 'shop';
  private ctx!: GameContext;
  private readonly deliveries: Delivery[] = [];
  private dropIndex = 0;
  private readonly products = new Map<string, ShopProduct>();
  /** Triche : colis livré tout de suite. */
  instantDelivery = false;

  constructor(
    private readonly wallet: Wallet,
    private readonly mechanics: MechanicsSystem,
    private readonly places: ShopPlaces,
  ) {}

  init(ctx: GameContext): void {
    this.ctx = ctx;
    ctx.cheats.add('Boutique', {
      kind: 'toggle',
      id: 'instant-delivery',
      label: 'Livraison instantanée',
      get: () => this.instantDelivery,
      set: (on) => (this.instantDelivery = on),
    });
  }

  addProduct(product: ShopProduct): void {
    this.products.set(product.id, product);
  }

  /** Rayons de la boutique : produits (carburant…) puis pièces moteur. */
  sections(): Array<{ title: string; items: ShopItem[] }> {
    const productSections = new Map<string, ShopItem[]>();
    for (const p of this.products.values()) {
      const list = productSections.get(p.section) ?? [];
      list.push({ id: p.id, name: p.name, detail: p.detail, price: p.price });
      productSections.set(p.section, list);
    }
    const parts = SHOP_SECTIONS.map((s) => ({
      title: s.title,
      items: PARTS.filter((p) => s.categories.includes(p.category)).map((def) => ({ id: def.id, name: def.name, detail: describePart(def), price: def.price })),
    }));
    return [...[...productSections].map(([title, items]) => ({ title, items })), ...parts];
  }

  private priceOf(id: string): number | null {
    return PART_CATALOG.get(id)?.price ?? this.products.get(id)?.price ?? null;
  }

  buy(id: string): BuyResult {
    const price = this.priceOf(id);
    if (price === null) return 'unknown';
    if (!this.wallet.spend(price)) return 'money';
    this.deliveries.push({ id, left: this.instantDelivery ? 0 : DELIVERY_SECONDS });
    if (!this.instantDelivery) this.ctx.bus.emit('ui:notice', { message: t('shop.ordered') });
    return 'ok';
  }

  /** Pièces revendables : posées dans le garage (pas celle tenue en main). */
  sellables(): Array<LoosePartInfo & { price: number }> {
    const b = this.places.sellArea;
    return this.mechanics
      .listLoose()
      .filter((l) => l.position.x > b.minX && l.position.x < b.maxX && l.position.z > b.minZ && l.position.z < b.maxZ)
      .map((l) => ({ ...l, price: sellPrice(l.def, l.condition) }));
  }

  /** Vend une pièce ; retourne le prix obtenu (null si impossible). */
  sell(uid: string): number | null {
    const item = this.sellables().find((s) => s.uid === uid);
    if (!item || item.held || !this.mechanics.removeLoose(uid)) return null;
    this.wallet.add(item.price);
    return item.price;
  }

  /** Colis en route (pour la sauvegarde : ils seront sur la palette au chargement). */
  pending(): Array<{ id: string; position: Vector3 }> {
    return this.deliveries.map((d, i) => ({ id: d.id, position: this.dropPosition(this.dropIndex + i) }));
  }

  /** Pièces moteur en route, au format de la sauvegarde. */
  pendingParts(): Array<SavedPart & { x: number; y: number; z: number }> {
    return this.pending()
      .filter((d) => PART_CATALOG.has(d.id))
      .map((d) => ({ defId: d.id, condition: 1, x: d.position.x, y: d.position.y, z: d.position.z }));
  }

  update(dt: number): void {
    for (let i = this.deliveries.length - 1; i >= 0; i--) {
      const d = this.deliveries[i]!;
      d.left -= dt;
      if (d.left > 0) continue;
      this.deliveries.splice(i, 1);
      const position = this.dropPosition(this.dropIndex++);
      const product = this.products.get(d.id);
      if (product) product.deliver(position);
      else this.mechanics.spawnPart(d.id, 1, position);
      this.ctx.bus.emit('ui:notice', { message: t('shop.delivered') });
    }
  }

  /** Emplacements sur la palette (en quinconce, un peu en hauteur : le colis s'y pose). */
  private dropPosition(index: number): Vector3 {
    const i = index % 6;
    const p = this.places.deliverySpot;
    return new Vector3(p.x + ((i % 3) - 1) * 0.24, p.y + 0.3, p.z + (i < 3 ? -0.18 : 0.18));
  }
}
