// 룩을 문서에 반영한다(styles/look.css가 html[data-look]으로 UI 스킨을 고른다). DOM 경계는 이 파일만 가진다.
import { lookId, type LookSettings } from './lookProfile.js';

export function applyLookToDocument(settings: LookSettings | null | undefined): void {
  document.documentElement.dataset.look = lookId(settings);
}
