// 이야기 임무 미리보기의 잔향 대원 출현(35번 R025·R031 체험 경로). 연습 경기는 적이 없으므로 상대 팀 스폰 덱에 봇 몇 명을
// 더한다. 출현 예산·병종 배치·체크포인트는 33번 T026의 일이며 이 모듈은 그 전에 이야기 흐름(첫 처치·첫 사망 대사,
// 텔레그래프·스태거 체감)을 실제 적과 확인하기 위한 것이다. 경기 정리(Match.dispose)가 actors를 모두 치우므로 따로 정리할 것은 없다.
import { t } from '../ui/i18n.js';
import * as THREE from 'three';
import { G } from '../core/ctx.js';
import { Actor } from '../game/actor.js';
import { BotBrain } from '../game/bots.js';
import { randomStyle } from '../game/character-style.js';
import type { Character } from '../game/character.js';

export const PREVIEW_ECHOES = { weapons: ['shooter', 'roller', 'blaster'], difficulty: 'easy' } as const;

interface MatchLike { actors: Actor[] }

export function addPreviewEchoes(m: MatchLike, CharacterClass: typeof Character, n = PREVIEW_ECHOES.weapons.length): Actor[] {
  const pad = G.level?.spawnPads?.[1];
  if (!pad) return [];
  const out: Actor[] = [];
  const v = new THREE.Vector3();
  for (let s = 0; s < n; s++) {
    const a = new Actor({ team: 1, slot: s, weapon: PREVIEW_ECHOES.weapons[s % PREVIEW_ECHOES.weapons.length], isBot: true, name: t('잔향 {n}', { n: s + 1 }), style: randomStyle(), CharacterClass });
    G.scene!.add(a.character.root);
    a.bot = new BotBrain(a, PREVIEW_ECHOES.difficulty);
    const ang = (s / 4) * Math.PI * 2 + 0.6;
    a.spawnAt(v.set(pad.x + Math.cos(ang) * 1.2, pad.y, pad.z + Math.sin(ang) * 1.2), Math.PI);
    a.invuln = 0;
    const bot = a.bot as { aimYaw?: number; aimPitch?: number };
    bot.aimYaw = a.yaw; bot.aimPitch = 0;
    m.actors.push(a);
    out.push(a);
  }
  G.actors = m.actors;
  return out;
}
