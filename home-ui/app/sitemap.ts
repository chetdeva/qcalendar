import type { MetadataRoute } from 'next';
import { pages } from '@/content/pages';
import { SITE_URL } from '@/content/site';

// Every public page. 
const PATHS = ['/', ...pages.map((p) => `/math-tutoring/${p.slug}`), '/privacy', '/terms'];

export default function sitemap(): MetadataRoute.Sitemap {
  return PATHS.map((p) => ({ url: `${SITE_URL}${p}`, changeFrequency: p === '/' ? 'weekly' : 'monthly', priority: p === '/' ? 1 : p.startsWith('/math') ? 0.8 : 0.3 }));
}
