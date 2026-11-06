import type * as THREE from 'three';
import type { Actor, ActorIntent } from '../actor.js';
import type { WeaponRunner, WeaponInput } from '../weapons.js';
import type { WeaponCfg, SubCfg } from '../../config.js';
import type { SubSystem } from '../subs.js';
import type { BotBrain } from '../bots.js';
import { G } from '../../core/ctx.js';
// Registries for main-weapon and sub-weapon kinds that live in their own modules (src/game/kits/<kind>.js). Each kit
// module registers itself when imported (kits/index.js imports them all); the core systems look a kind up here after
// their built-in ones. Hooks are all optional unless marked.
//
// MAIN_KITS[kind] = {
//   update(runner, dt, inp, w)         REQUIRED — per-frame trigger handling (WeaponRunner.update's switch)
//   reset?(runner)                     runner state reset (spawn, death, loadout swap)
//   busy?(runner) / firingPose?(runner)  extend WeaponRunner.busy() / firingPose()
//   moveSpeed?(runner, w)              run speed override while using the weapon (0 / undefined = default)
//   spreadDeg?(runner, w)              current spread (feeds the reticle)
//   tick?(dt) / clear?()               module-owned world objects (projectiles, shields …): once per frame / on match reset
//   blockShot?(prev, pos, team, dmg) → bool   a shot segment prev→pos hits something this kit owns (e.g. a shield)
//   damageTaken?(runner, amount, attacker, source) → amount   scale damage the wielder takes (actor.damage; e.g. the mitts'
//                                      leap armour); ≤ 0 cancels the hit
//   jump?(runner, intent) → bool       claim this frame's jump press (actor.js; e.g. the mitts' leap). runner.kit.hang
//                                      (set by the kit) holds the kid in place (wall cling)
//   bot?: { fight?(brain, ctx) → bool fire, paint?(brain, ctx) → bool fire, paintPitch?, melee?, charges?, long?, painter?,
//           tactics?(brain, ctx)      every fight / retreat frame after the dodge block: owns fire, hold, swim and move
//           stayIn?(brain, ctx) → bool   veto the low-HP retreat (keep fighting when the kill is close)
//           targetBias?(brain, enemy) → number   added to that enemy's target score in _perceive }
//   shields?(out) → out                push a descriptor for every shield up this frame (bots.js flanks held ones and
//                                      steers round launched ones). Stable per shield; getters read live state:
//                                      { kind, held, team, owner, C (disc centre), N (facing / launched: travel dir), R,
//                                        hp, hpMax, live, blocksActors, left, and launched only: pos (foot), halfW (players
//                                        are held back over ±halfW along the wall), planeOff (the blocking plane sits
//                                        planeOff along N from pos), speed }
// }
// SUB_KITS[kind] = {
//   use(subs, actor, sub)              REQUIRED — the throw / placement on release (SubSystem.use)
//   hold?(runner, dt, inp, sub)        while the sub button is held (charge-up)
//   blocked?(actor, sub) → bool        refuse the throw ("Can't use" — e.g. one already out); emits 'sub:cantuse'
//   tick?(dt) / clear?()               module-owned objects
//   blockShot?(prev, pos, team, dmg) → bool   (shoot-able bombs)
//   blockRay?(from, dir, len, team, dmg) → dist   (charger beams vs shoot-able bombs)
//   damageArea?(c, radius, dmg, team)  a blast went off (G.subs.damageArea): kit objects of other teams caught in it
//   noArc?: true                       no bomb-arc preview while held (the kit draws its own aim guide)
//   bot?: { fight?(brain, dist) → bool throw now, paint?(brain) → bool }
//   threats?(out) → out                push a descriptor for every live object of this kind that hunts / hurts foes
//                                      (bots.js shoots them down or evades them). Stable per object; getters read live
//                                      state: { kind, obj, team, owner, pos (live: feet for walkers, centre for flyers),
//                                        aimY (hit centre above pos), vel, speed, radius (blast), trigger (contact reach),
//                                        ground (walks on the ground), live, state, hp, shootable, locked, target (the
//                                        actor it tracks, or null) } + kind extras (waddle: senseRadius, left;
//                                        torpedo: lockRange, hover)
// }
//
// Online (src/net/netmatch.js), any kit:
//   ghost?(actor, data)                a remote player's world object, from the owner's G.netm.recKit(actor, kind, data)
//                                      (data: a short array of rounded numbers): build a visual copy — it never paints
//                                      (netmatch mutes paint while ghost() runs; the kit keeps muting in its own tick for
//                                      ghost objects) and never hurts (a remote attacker's hits are dropped). Shields /
//                                      curtains stay solid (they block the local player's shots like the owner's do).
//   netHurt?(id, dmg)                  the owner's side of a device hit made on another screen (registry netHurt)
//   MAIN_KITS only: netState?(runner) → int   the pose / state bits other screens need (packed each tick)
//                   netApply?(runner, bits, dt)   a remote runner: rebuild runner.kit from those bits
// KIT_GHOSTS[kind] = { ghost } — ghost-only entries for things that aren't a main or sub kit (e.g. a special's objects)
/** 봇 판단 문맥(bots.ts가 넘긴다): 목표·거리·조준 등 — 필드는 bots.ts 소유 */
export type BotCtx = Record<string, unknown>;
/** 위 주석의 봇 훅(bots.ts가 부른다). */
export interface KitBotHooks {
  fight?(brain: BotBrain, ctx: BotCtx): boolean; paint?(brain: BotBrain, ctx?: BotCtx): boolean; tactics?(brain: BotBrain, ctx: BotCtx): void;
  stayIn?(brain: BotBrain, ctx: BotCtx): boolean; targetBias?(brain: BotBrain, enemy: Actor): number;
  paintPitch?: number; melee?: boolean; charges?: boolean; long?: boolean; painter?: boolean;
}
/** 위협·방패 기술자(봇이 읽는다). 키트마다 필드가 다르다. */
export type KitDescriptor = Record<string, unknown>;
/** 주무기 키트(위 주석 참조) */
export interface MainKit {
  update(runner: WeaponRunner, dt: number, inp: WeaponInput, w: WeaponCfg): void;
  reset?(runner: WeaponRunner): void;
  busy?(runner: WeaponRunner): boolean; firingPose?(runner: WeaponRunner): boolean;
  moveSpeed?(runner: WeaponRunner, w: WeaponCfg): number | undefined; spreadDeg?(runner: WeaponRunner, w: WeaponCfg): number;
  tick?(dt: number): void; clear?(): void;
  blockShot?(prev: THREE.Vector3, pos: THREE.Vector3, team: number, dmg: number): boolean;
  damageTaken?(runner: WeaponRunner, amount: number, attacker: Actor | null | undefined, source: string): number;
  jump?(runner: WeaponRunner, intent: ActorIntent): boolean;
  bot?: KitBotHooks;
  shields?(out: KitDescriptor[]): KitDescriptor[];
  ghost?(actor: Actor, data: number[]): void; netHurt?(id: number, dmg: number): void;
  netState?(runner: WeaponRunner): number; netApply?(runner: WeaponRunner, bits: number, dt: number): void;
  [tool: `_${string}`]: unknown;   // 시험·도구용 내부 노출(_bolts 등)
}
/** 보조무기 키트(위 주석 참조) */
export interface SubKit {
  use(subs: SubSystem, actor: Actor, sub: SubCfg): void;
  hold?(runner: WeaponRunner, dt: number, inp: WeaponInput, sub: SubCfg): void;
  blocked?(actor: Actor, sub: SubCfg): boolean;
  tick?(dt: number): void; clear?(): void;
  blockShot?(prev: THREE.Vector3, pos: THREE.Vector3, team: number, dmg: number): boolean;
  blockRay?(from: THREE.Vector3, dir: THREE.Vector3, len: number, team: number, dmg: number): number;
  damageArea?(c: THREE.Vector3, radius: number, dmg: number, team: number): void;
  noArc?: boolean;
  bot?: { fight?(brain: BotBrain, dist: number): boolean; paint?(brain: BotBrain): boolean };
  threats?(out: KitDescriptor[]): KitDescriptor[];
  ghost?(actor: Actor, data: number[]): void; netHurt?(id: number, dmg: number): void;
  [tool: `_${string}`]: unknown;
}
export const MAIN_KITS: Record<string, MainKit | undefined> = {};
export const SUB_KITS: Record<string, SubKit | undefined> = {};
export const KIT_GHOSTS: Record<string, { ghost(actor: Actor, data: number[]): void } | undefined> = {};
// the local owner records a spawn for the other players (no-op offline / for remote actors)
export function netRec(actor: Actor, kind: string, data: object) { G.netm?.recKit?.(actor, kind, data); }
// a network id for an owner's world object (its ghosts carry the same id): owner nid × 1e5 + a per-session sequence
let _seq = 0;
export function netId(owner: Actor | null | undefined) { return owner && owner.nid !== undefined ? owner.nid * 100000 + (++_seq % 100000) : 0; }
// a non-owner damaged a ghost device (a remote player's sprinkler, curtain, waddle …): the owner's copy takes it.
// (kind: 'subs' for SubSystem items, else the kit kind — its netHurt(id, dmg) applies it on the owner's screen)
export function netHurt(owner: Actor | null | undefined, kind: string, id: number, dmg: number) { if (id && dmg > 0) G.netm?.sendDevHit?.(owner, kind, id, dmg); }
// run fn with paint muted when obj is a ghost (a remote player's copy): its splats are the owner's to send
// true while a ghost (a remote player's replayed shot / bomb / sub) is being simulated: its damage to devices counts for
// nothing here — the owner's own copy hits our ghost of the device and that hit arrives by netHurt
export function netMuted() { return (G.netm?.mute ?? 0) > 0; }
export function ghostMute<T>(obj: { ghost?: unknown } | null | undefined, fn: () => T): T {
  const nm = obj && obj.ghost ? G.netm : null;
  if (nm) nm.mute++;
  try { return fn(); } finally { if (nm) nm.mute--; }
}
