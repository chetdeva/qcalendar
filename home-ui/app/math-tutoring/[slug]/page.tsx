import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import SeoPage from '@/components/SeoPage';
import { bySlug, pages } from '@/content/pages';

export const dynamicParams = false;
export const generateStaticParams = () => pages.map((p) => ({ slug: p.slug }));

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const p = bySlug((await params).slug);
  if (!p) return {};
  return { title: p.title, description: p.description, alternates: { canonical: `/math-tutoring/${p.slug}` } };
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const p = bySlug((await params).slug);
  if (!p) notFound();
  return <SeoPage p={p} />;
}
