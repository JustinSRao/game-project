import Phaser from "phaser";
import type { PlacedEntity } from "@howeverfar/schema";
import { TILE } from "./PlayScene.js";

/**
 * Entities that are not people. Props and items become small generated pixel
 * sprites drawn on a transparent tile — the same "pattern in the tile's own
 * colour" idea as tiles.ts, but as silhouettes (a crate, a bush, a gem) so
 * they read as objects sitting on the ground rather than coloured squares.
 * Characters are drawn from the LPC sheet instead (see PlayScene), so this
 * only covers props and items.
 */

type PropKind = "crate" | "barrel" | "bush" | "rock" | "post" | "blob";
type ItemKind = "gem" | "orb" | "key" | "note";

const PROP_RULES: ReadonlyArray<readonly [RegExp, PropKind]> = [
  [/tree|bush|shrub|hedge|plant|flower|fern|foliage|sapling/, "bush"],
  [/rock|stone|boulder|rubble|pebble|cairn/, "rock"],
  [/barrel|keg|cask|urn|pot|vase/, "barrel"],
  [/crate|box|chest|cart|create|trunk|coffer|stall|table|bench|desk|cabinet/, "crate"],
  [/post|pole|lamp|lantern|torch|sign|pillar|column|stake|statue|shrine/, "post"],
];

const ITEM_RULES: ReadonlyArray<readonly [RegExp, ItemKind]> = [
  [/key/, "key"],
  [/book|letter|scroll|note|paper|page|map|ledger|journal|record/, "note"],
  [/gem|crystal|jewel|shard|stone|diamond|ore/, "gem"],
];

function propKind(e: PlacedEntity): PropKind {
  const hay = `${e.name}`.toLowerCase();
  for (const [re, k] of PROP_RULES) if (re.test(hay)) return k;
  return "blob";
}
function itemKind(e: PlacedEntity): ItemKind {
  const hay = `${e.name}`.toLowerCase();
  for (const [re, k] of ITEM_RULES) if (re.test(hay)) return k;
  return "orb";
}

interface Rgb {
  r: number;
  g: number;
  b: number;
}
function parse(hex: string): Rgb {
  const h = hex.replace("#", "");
  return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
}
function shade({ r, g, b }: Rgb, amt: number): string {
  const mix = (c: number) => Math.round(amt >= 0 ? c + (255 - c) * amt : c * (1 + amt));
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
}

/** A light, distinct tint per character id so NPCs read apart (player is untinted). */
export function characterTint(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  // Keep tints pale (blend a hue toward white) so the sprite stays legible.
  const hue = (h >>> 0) % 360;
  const c = Phaser.Display.Color.HSVToRGB(hue / 360, 0.25, 1) as Phaser.Types.Display.ColorObject;
  return Phaser.Display.Color.GetColor(c.r, c.g, c.b);
}

type Ctx = CanvasRenderingContext2D;

function drawProp(ctx: Ctx, kind: PropKind, color: string, S: number): void {
  const base = parse(color);
  const fill = (x: number, y: number, w: number, h: number, c: string) => {
    ctx.fillStyle = c;
    ctx.fillRect(x, y, w, h);
  };
  const outline = (x: number, y: number, w: number, h: number) => {
    ctx.strokeStyle = shade(base, -0.6);
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  };
  const cx = S / 2;
  switch (kind) {
    case "crate": {
      const w = 30;
      const x = cx - w / 2;
      const y = S - 8 - w;
      fill(x, y, w, w, shade(base, -0.05));
      fill(x, y, w, 4, shade(base, 0.2)); // top light
      fill(x, y, 3, w, shade(base, 0.12));
      // planks: diagonal cross
      ctx.strokeStyle = shade(base, -0.4);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + w, y + w);
      ctx.moveTo(x + w, y);
      ctx.lineTo(x, y + w);
      ctx.stroke();
      outline(x, y, w, w);
      break;
    }
    case "barrel": {
      const w = 24;
      const hgt = 32;
      const x = cx - w / 2;
      const y = S - 8 - hgt;
      fill(x, y, w, hgt, shade(base, -0.05));
      fill(x, y, w, 4, shade(base, 0.18));
      fill(x + 2, y, 3, hgt, shade(base, 0.14));
      fill(x, y + 10, w, 3, shade(base, -0.35)); // hoop
      fill(x, y + hgt - 13, w, 3, shade(base, -0.35));
      outline(x, y, w, hgt);
      break;
    }
    case "bush": {
      const clumps: [number, number, number][] = [
        [cx, S - 20, 13],
        [cx - 10, S - 14, 10],
        [cx + 10, S - 14, 10],
        [cx, S - 12, 12],
      ];
      for (const [bx, by, r] of clumps) {
        ctx.fillStyle = shade(base, -0.02);
        ctx.beginPath();
        ctx.arc(bx, by, r, 0, Math.PI * 2);
        ctx.fill();
      }
      // highlights
      ctx.fillStyle = shade(base, 0.22);
      for (const [bx, by, r] of clumps) {
        ctx.beginPath();
        ctx.arc(bx - r * 0.3, by - r * 0.3, r * 0.4, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case "rock": {
      ctx.fillStyle = shade(base, -0.05);
      ctx.beginPath();
      ctx.moveTo(cx - 16, S - 8);
      ctx.lineTo(cx - 12, S - 22);
      ctx.lineTo(cx + 2, S - 26);
      ctx.lineTo(cx + 15, S - 18);
      ctx.lineTo(cx + 14, S - 8);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = shade(base, 0.2);
      ctx.beginPath();
      ctx.moveTo(cx - 8, S - 20);
      ctx.lineTo(cx + 2, S - 24);
      ctx.lineTo(cx + 4, S - 18);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case "post": {
      const w = 8;
      const x = cx - w / 2;
      fill(x, 8, w, S - 16, shade(base, -0.05));
      fill(x, 8, 3, S - 16, shade(base, 0.16));
      fill(cx - 9, 6, 18, 6, shade(base, 0.1)); // cap
      outline(cx - 9, 6, 18, 6);
      break;
    }
    case "blob": {
      ctx.fillStyle = shade(base, -0.03);
      ctx.beginPath();
      ctx.ellipse(cx, S - 16, 15, 13, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = shade(base, 0.18);
      ctx.beginPath();
      ctx.ellipse(cx - 4, S - 20, 6, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
  }
}

function drawItem(ctx: Ctx, kind: ItemKind, color: string, S: number): void {
  const base = parse(color);
  const cx = S / 2;
  const cy = S / 2;
  const fill = (x: number, y: number, w: number, h: number, c: string) => {
    ctx.fillStyle = c;
    ctx.fillRect(x, y, w, h);
  };
  // A soft glow so pickups catch the eye.
  const glow = ctx.createRadialGradient(cx, cy, 2, cx, cy, 16);
  glow.addColorStop(0, shade(base, 0.35));
  glow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = glow;
  ctx.globalAlpha = 0.5;
  ctx.beginPath();
  ctx.arc(cx, cy, 16, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  switch (kind) {
    case "gem": {
      ctx.fillStyle = shade(base, 0);
      ctx.beginPath();
      ctx.moveTo(cx, cy - 10);
      ctx.lineTo(cx + 9, cy);
      ctx.lineTo(cx, cy + 11);
      ctx.lineTo(cx - 9, cy);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = shade(base, 0.3);
      ctx.beginPath();
      ctx.moveTo(cx, cy - 10);
      ctx.lineTo(cx + 4, cy - 2);
      ctx.lineTo(cx - 3, cy - 1);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case "orb": {
      ctx.fillStyle = shade(base, -0.02);
      ctx.beginPath();
      ctx.arc(cx, cy, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = shade(base, 0.4);
      ctx.beginPath();
      ctx.arc(cx - 3, cy - 3, 3, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case "key": {
      fill(cx - 1, cy - 8, 3, 14, shade(base, 0.1));
      fill(cx - 1, cy + 3, 6, 3, shade(base, 0.1));
      ctx.strokeStyle = shade(base, 0.1);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(cx, cy - 9, 4, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
    case "note": {
      fill(cx - 8, cy - 9, 16, 18, shade(base, 0.25));
      ctx.strokeStyle = shade(base, -0.3);
      ctx.lineWidth = 1;
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.moveTo(cx - 5, cy - 5 + i * 4);
        ctx.lineTo(cx + 5, cy - 5 + i * 4);
        ctx.stroke();
      }
      break;
    }
  }
}

/** Texture key for a prop/item entity, lazily generated on a transparent tile. */
export function ensureObjectTexture(scene: Phaser.Scene, entity: PlacedEntity): string {
  const color = entity.color ?? "#94b0c2";
  const kind = entity.role === "item" ? itemKind(entity) : propKind(entity);
  const key = `obj:${entity.role}:${kind}:${color}`;
  if (scene.textures.exists(key)) return key;
  const canvas = scene.textures.createCanvas(key, TILE, TILE);
  const ctx = canvas?.getContext();
  if (!canvas || !ctx) return key;
  if (entity.role === "item") drawItem(ctx, kind as ItemKind, color, TILE);
  else drawProp(ctx, kind as PropKind, color, TILE);
  canvas.refresh();
  return key;
}
