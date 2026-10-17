import { redirect } from 'next/navigation';
import { landing } from '@/lib/env';
import { currentSession } from '@/lib/supabase/server';

export default async function Home() {
  redirect((await currentSession()) ? landing : '/login');
}
