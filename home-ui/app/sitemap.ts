import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/content/site';

// Every public page. Add the grade and goal pages here as they are built.
const PATHS = ['/', '/privacy', '/terms'];

export default function sitemap(): MetadataRoute.Sitemap {
  return PATHS.map((p) => ({ url: `${SITE_URL}${p}`, changeFrequency: p === '/' ? 'weekly' : 'yearly', priority: p === '/' ? 1 : 0.3 }));
}
