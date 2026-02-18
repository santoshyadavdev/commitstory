import { RenderMode, ServerRoute } from '@angular/ssr';

export const serverRoutes: ServerRoute[] = [
  {
    // All routes are session-dependent; render on each request rather than
    // statically at build time (Prerender would try to call the API server
    // during the build, which does not exist in CI).
    path: '**',
    renderMode: RenderMode.Server,
  },
];
