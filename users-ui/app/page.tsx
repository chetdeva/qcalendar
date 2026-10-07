import { redirect } from 'next/navigation';
import { currentSession } from '@/lib/supabase/server';

export default async function Home() {
  redirect((await currentSession()) ? '/profile' : '/login');
}
