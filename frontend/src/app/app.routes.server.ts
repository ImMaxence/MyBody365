import { RenderMode, ServerRoute } from '@angular/ssr';
import { LEGAL_DOCS } from './core/site';

const docs = async () => LEGAL_DOCS.map((doc) => ({ doc }));

/** The public pages are prerendered at build time; the app itself renders in the browser only. */
export const serverRoutes: ServerRoute[] = [
  { path: '', renderMode: RenderMode.Prerender },
  { path: 'en', renderMode: RenderMode.Prerender },
  { path: 'legal/:doc', renderMode: RenderMode.Prerender, getPrerenderParams: docs },
  { path: 'en/legal/:doc', renderMode: RenderMode.Prerender, getPrerenderParams: docs },
  { path: 'changelog', renderMode: RenderMode.Prerender },
  { path: '**', renderMode: RenderMode.Client },
];
