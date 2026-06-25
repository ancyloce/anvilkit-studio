# @anvilkit/plugin-page-seo

페이지의 SEO 메타데이터——meta 제목, 설명, OG 이미지, canonical URL,
그리고 `noindex`——를 정준 Puck `root.props.seo` 상에서 직접 편집하기 위한
**Page SEO** 레일 패널을 추가하는 `<Studio>` 플러그인(사이드바 기능)입니다(PRD 0004 F5).

```tsx
import { createPageSeoPlugin } from "@anvilkit/plugin-page-seo";

<Studio puckConfig={config} plugins={[createPageSeoPlugin()]} />;
```

- **단일 진실 공급원.** 편집은 불변의 `root.props.seo` 업데이트
  (Puck `setData`)를 디스패치하며, `appState.data`에 반영됩니다 — 이는 검증기,
  스토리지 게이트웨이, SEO 렌더링 라우트가 읽는 것과 같은 형태입니다.
- **현지화됨.** 모든 문자열은 i18n 메시지 키(`pageSeo.*`)에서 옵니다. 인라인
  카피는 없습니다.
- **레일 심(seam).** 코어의 `registerSeoPanel` 심을 통해 등록됩니다. 패널은 **SEO**
  레일 탭 아래에서 켜집니다.

`registerSeoPanel`을 노출하는 버전 이상의 `@anvilkit/core`가 필요합니다.
