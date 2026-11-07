# Botlab — headless 봇 경기와 페이지 시험

실제 게임을 headless Chrome에서 소리 없이 돌려 봇을 재고 다듬는다(34번 F01-F에서 Electron 오프스크린 창을 대신했다). 구현은 [`tools/client/botlab.ts`](../client/botlab.ts)이다. 먼저 `npm run dev`(포트 8490, `PORT`로 바꾼다)를 띄운다.

```bash
# 고정 60 Hz 게임 시간으로 끝까지 도는 봇 경기(기기 부하가 결과를 바꾸지 않는다)
MAP=halyard MODE=turf SECS=180 npm run botlab
MAP=lockgate MODE=zones npm run botlab          # 구역전 5:00 한 판
WEAPONS='team0=blade;team1=shooter' SUBS='all=waddle' MAP=crossmarket MODE=turf npm run botlab

# 페이지 시험(스크립트가 [{ name, ok, info }]를 돌려준다). MAP=testbox는 시험 전용 평지
MAP=testbox PAGE=path/to/test-page.js npm run botlab
```

- 환경 변수: `MAP`, `MODE`(`turf`/`zones`), `SECS`(영역전 길이), `WEAPONS`·`SUBS`(`all=<id>`, `team0=<id>;team1=<id>`, 슬롯별 쉼표 목록), `OUT`(결과 JSON 파일), `WATCHDOG`(ms), `TRACK=<무기>`(+ `TRACK_TEAM=0|1`), `TUNE='mitts.punchInterval=0.12'`(이번 실행만 수치 바꾸기), `CHROME_PATH`.
- 출력: 끼임 비율과 긴 끼임 사례, 원인별 처치, 무기별 선수·처치·사망·평균 영역, 스페셜·슈퍼 점프, 구역전 목표 통계, 콘솔 경고·오류, 마지막 줄 `RESULT_JSON {…}`.
- 여러 개를 함께 돌리면(`… & … & wait`) 같은 GPU를 나눠 쓴다. 이전 `run.sh` 슬롯 잠금은 없앴다.
- 페이지 스크립트에서 쓸 만한 전역: `window.__inkwave`(`.match`, `.match.local`, `.debug.freeze()`·`.step(ms)`·`.freezeBots()`), `window.__G`(공유 시스템), `actor.setWeapon(id)`·`setSub(id)`·`setSpecial(id)`.
