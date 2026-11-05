# Game event bus

`import { on, emit, G } from '../core/ctx.js'` — `on(name, fn)` returns an unsubscribe function. Effects, HUD and
screen-FX modules should subscribe to these instead of editing gameplay code.

## Emitted today
| event | payload | where |
|---|---|---|
| `hit` | `{ attacker, victim, damage, killed, weaponId }` | weapons.js applyHit / storm |
| `damage` | `{ victim, attacker, amount, source }` | actor.damage |
| `splatted` | `{ victim, attacker, cause }` (cause: weapon id, 'water', …) | actor.splat |
| `respawn` | `{ actor }` | actor.respawn |
| `special:ready` | `{ actor }` | actor.addTurf |
| `special:use` | `{ actor, id }` ('slam' / 'storm') | actor._startSpecial |
| `superjump` | `{ actor, phase: 'charge' \| 'flight', to? }` | actor.superJump |
| `shake` | `{ amount, pos? }` | camera trauma requests |
| `recoil` | `{ amount }` | local-player visual recoil |
| `lowink` | `{ actor, need? }` | weapons |
| `match:state` | `{ state, match }` ('intro','playing','finish','judge','results') | match.js |
| `match:oneminute` / `match:count` | `{}` / `{ n }` | match.js |
| `actor:<name>` | `{ actor, surface, ...data }` — re-emitted from `character.onEvent(name, data)`; surface 0 dry · 1 own ink · 2 enemy ink | actor.ts wiring |

## To add
| event | payload |
|---|---|
| `actor:jump` | `{ actor, surface, swim }` |
| `actor:land` | `{ actor, speed, surface, pos }` |
| `actor:form` | `{ actor, form: 'kid' \| 'squid', surface }` |
| `actor:dive` / `actor:emerge` | `{ actor, pos, speed }` (squid enters / leaves own ink) |
| `actor:climb` | `{ actor, on }` |
| `actor:enemyInk` | `{ actor, on }` |
| `weapon:fire` | `{ actor, weapon, muzzle, dir, charge? }` |
| `weapon:impact` | `{ pos, normal, team, kind, radius }` (kind: 'shot','blast','drop','charger','roll') |
| `bomb:throw` / `bomb:arm` / `bomb:explode` | `{ actor?, pos, team, radius? }` |
| `special:slam` | `{ actor, pos, radius }` |
| `storm:start` / `storm:end` | `{ pos, team }` |
| `superjump:land` | `{ actor, pos }` |
| `turf` | `{ actor, area }` (every claimed chunk; aggregate yourself) |

## Character → actor` inside character.js)
| name | data |
|---|---|
| `footstep` | `{ foot: 'L' \| 'R', pos: THREE.Vector3 (world, copy it) , speed }` at each foot plant |
| `handplant` (optional) | `{ pos }` roller/charger heavy moments |

## Audio (lead-owned, src/audio/audio.js)
- The lead plays footstep sounds on `actor:footstep` (surface-aware: `step_dry`, `step_ink`, `step_enemy`) and runs the
  harbour ambience (`harbor_ambience` loop + random `gull` cries). Don't duplicate these.
- Extra SFX names available to everyone via `G.audio.play(name, { pos, volume, pitch })`: `step_dry`, `step_ink`,
  `step_enemy`, `ink_drip`, `gull`, `harbor_ambience` (loop) — plus the full list in docs/CONTRACTS.md §2.
- Need a new sound? Add a def in src/audio/audio.js and list it in SFX_GROUPS.

## Added since upstream 1.0 (this fork)
Specials, subs and Zone Control emit these on top of the table above. `actor:dive`, `footstep` and `handplant` are no
longer emitted.

| event | payload | where |
|---|---|---|
| `actor:cheer` | `{ actor, helped }` | specials.js (Cheer Orb) |
| `actor:dodge` / `weapon:dodge` | `{ actor, dir }` / `{ actor, pos, dir }` | weapons.js (Twins dodge roll) |
| `actor:poisoned` / `actor:tracked` | `{ actor }` / `{ actor, team }` | subs.js (poison / point sensor) |
| `bomb:arm` / `bomb:explode` | `{ actor, pos, team, radius }` | subs.js |
| `match:count` | `{ n }` (final countdown) | match.js |
| `special:start` / `special:end` | `{ actor, id }` / `{ actor, id, reason }` | specials.js |
| `special:launch` / `special:sonar` / `special:shield` | `{ actor, to }` / `{ actor, pos }` / `{ actor, time }` | specials.js |
| `special:strike` / `special:wail` | `{ actor, pos, radius }` / `{ actor, pos, dir }` | specials.js |
| `storm:end` | `{ pos, team, actor }` | weapons.js |
| `sub:use` | `{ actor, kind }` | subs.js |
| `sub:land` / `sub:arm` / `sub:cloud` / `sub:destroyed` | `{ kind, pos, team, radius? }` | subs.js |
| `sub:charge` | `{ actor, kind: 'shaker', level, max }` — the Shaker Bomb in hand reached a new charge (2, then 3 = max) | kits/shaker.js |
| `sub:lock` / `sub:end` | `{ kind: 'waddle', pos, team, actor, target }` / `{ kind, why, team, pos }` (why: reached · travel · life · lost · stuck · fuse · popped · sea · fell · cleared) | kits/waddle.js |
| `zones:zone` | `{ zone, owner }` — one zone taken (≥ 80 % ink); it is then flooded with the taker's ink | zones.js |
| `zones:control` | `{ owner, prev, objective }` — the live objective's holder changed (owner −1 = neutral) | zones.js |
| `zones:contest` | `{ zone, holder, share }` — the other team has inked a held zone to the warning share (ZONES.warn) | zones.js |
| `zones:penalty` | `{ team, penalty, total, start, end }` | zones.js |
| `zones:active` | `{ objective, zones, final, moved }` — rotation (final = the last-30-s centre lock) | zones.js |
| `zones:overtime` | `{ losing }` | zones.js |
| `zones:end` | `{ winner, reason, counts }` (reason: knockout · time · comeback · retake · neutralised · overtime-cap) | zones.js |

## 스토리·액션 리디자인(35번)
그림책 룩·액션 모듈이 더하는 이벤트이다. 모두 `emit(name, payload)`이다.

| event | payload | where |
|---|---|---|
| `fx:word` | `{ text, pos, kind, color? }` — 의성어 월드 라벨. kind: kill · eliteKill · stagger · perfect · surge · bomb · hurt · cue | src/style/sfxWords.ts가 받는다. 로컬 플레이어의 `hit`(처치)·`damage`(피격)·근처 `bomb:explode`를 여기서 바꿔 내고, 캠페인 액션 모듈이 직접 낸다 |
| `action:perfectDive` | `{ actor, attacker, source }` — 퍼펙트 잠수 성공(그 공격은 무효) | src/campaign/action/combat.ts |
| `action:surge` | `{ actor, dir, pos }` — 잉크 서지 시작 | src/campaign/action/combat.ts |
| `action:wave` | `{ actor, level, prev, points }` — 물결 단계 변화(0~3) | src/campaign/action/combat.ts |
| `action:objective` | `{ actor }` — 목표 완료가 물결 게이지에 반영됨(목표 실행기가 `combat.objective()`를 부를 때) | src/campaign/action/combat.ts |
| `enemy:stagger` / `enemy:staggerEnd` | `{ actor, by, exposeWeak }` / `{ actor }` — 버팀(poise) 0 → 0.7초 스태거 / 끝(3초 면역 시작) | src/campaign/action/combat.ts |
| `cast:say` | `{ actor?, pos?, text, kind, speaker? }` — 머리 위(또는 pos) 말풍선과 찍찍 목소리. speaker: player · mora · teal · pong · captain | src/game/cast/castDirector.ts가 내고 src/game/cast/speech.ts가 받는다 |
| `fx:hitstop` | `{ seconds, scale, reason }` — 새 히트스톱 시작(0.4초 안에 병합된 요청은 내지 않는다). reason: kill · elite · phase · perfect | src/campaign/action/feedback.ts |
| `action:finish` | `{ kind, pos, pongJoy }` — 처치·피니시(정예·대장)·보스 페이즈 전환 연출. kind: kill · elite · phase | src/campaign/action/feedback.ts. castDirector가 퐁 기쁨을 붙인다 |
| `device:fountain` / `device:barrel` / `device:switch` | `{ id, actor }` / `{ id, pos }` / `{ id, enables }` — 잉크 분수 발사·잉크통 폭발·스위치 작동 | src/campaign/action/devices.ts |
| `story:line` / `story:end` | `{ scriptId, index, line }` / `{ scriptId, skipped }` — 대화 한 줄 시작 / 대본 끝(건너뛰기 포함) | src/campaign/story/dialogue.ts |
| `story:panel` / `story:panelEnd` | `{ sceneId, shotId }` / `{ sceneId, skipped }` — 만화 패널 컷 시작 / 장면 끝 | src/campaign/story/panels.ts |

위 `action:*`·`enemy:*`·`cast:say`·`fx:hitstop`·`device:*`는 캠페인 세션(개발 중에는 `?tune=campaign` 미리보기와 메뉴의 이야기 임무 체험, src/campaign/preview.ts)이 있을 때만 난다. `story:*`는 이야기 진행기(src/campaign/story/storyDirector.ts)가 대화·패널을 재생할 때 난다.
