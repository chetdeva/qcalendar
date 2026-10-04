import { createBrowserClient } from '@supabase/ssr';
import { cookieOptions } from '../cookies.ts';
import { supabaseKey, supabaseUrl } from '../env.ts';

export const createClient = () => createBrowserClient(supabaseUrl, supabaseKey, { cookieOptions: cookieOptions() });
