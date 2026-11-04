interface WarmNode<N> {
  isMesh?: boolean; isPoints?: boolean; isLine?: boolean; isSprite?: boolean;
  traverseVisible(visitor: (node: N) => void): void;
  clone(recursive: boolean): N;
  add(node: N): unknown;
  clear(): unknown;
}
interface WarmRenderer<N, C, T> {
  getRenderTarget(): T | null;
  setRenderTarget(target: T | null): void;
  compileAsync(root: N, camera: C, scene: N): Promise<unknown>;
}

// 데스크톱의 제한된 시작 정책이다. 저장된 선호 설정은 덮어쓰지 않는다.
export const desktopPerformance = {
  proceduralTextures: false,
  menuAttract: false,
  preloadLobby: false,
  warmupAll: false,
  warmCharacterVariants: false,
  mark(name: string): void { performance.mark(`inkwave:${name}`); },
  characterTiers(quality: string): readonly number[] {
    return !this.warmCharacterVariants && quality === 'low' ? [1, 2] : [0, 1, 2];
  },
  lodFade(quality: string): boolean { return this.warmCharacterVariants || quality !== 'low'; },
  async warmVisible<N extends WarmNode<N>, C, T>(roots: readonly N[], group: N, renderer: WarmRenderer<N, C, T>, camera: C, scene: N, target: T): Promise<void> {
    // compileAsync는 숨은 자식도 순회하므로 현재 보이는 메시만 임시 그룹에 복사한다.
    // geometry/material/skeleton은 공유하며 원본 트리와 가시성은 건드리지 않는다.
    for (const root of roots) root.traverseVisible(node => {
      if (node.isMesh || node.isPoints || node.isLine || node.isSprite) group.add(node.clone(false));
    });
    const previous = renderer.getRenderTarget();
    try {
      let ready: Promise<unknown>;
      try { renderer.setRenderTarget(target); ready = renderer.compileAsync(group, camera, scene); }
      finally { renderer.setRenderTarget(previous); }
      await ready;
    } finally { group.clear(); }
  },
  shouldWarmShowcase(mode: string | null, portraitCount: number): boolean {
    return mode !== 'results' && (!!mode || portraitCount > 0);
  },
  frameCap(requested: number, menu: boolean): number {
    return menu ? Math.min(requested || 60, 30) : requested;
  },
  configureSettings(settings: Record<string, unknown>, stored: Record<string, unknown> | null): void {
    if (stored?.shadowsChosen !== true) settings.shadows = false;
    if (!settings.fpsCap) settings.fpsCap = 60;
  },
};
