'use client';

import { useEffect, useState } from 'react';
import { api } from '../api-client';

interface Lead { id: number; createdAt: string; parentName: string; email: string; phone: string | null; grade: string; goal: string | null; timeZone: string | null; source: string | null }

/** Admins: the latest free-class requests from the website form (the teacher also gets each one by email). */
export function WebsiteLeads() {
  const [data, setData] = useState<{ total: number; leads: Lead[] } | null>(null);
  useEffect(() => { api<{ total: number; leads: Lead[] }>('/api/leads').then(setData, () => {}); }, []);
  if (!data?.leads.length) return null;
  return (
    <section className="freereq" aria-label="Website requests">
      <h3>Website requests <span>{data.total}</span></h3>
      <ul>
        {data.leads.map((l) => (
          <li key={l.id}>
            <div>
              <b>{l.parentName}</b>
              <small><a href={`mailto:${l.email}`}>{l.email}</a>{l.phone ? ` · ${l.phone}` : ''}</small>
              <small>{l.grade}{l.goal ? ` · ${l.goal}` : ''}{l.timeZone ? ` · ${l.timeZone}` : ''} · {new Date(l.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}{l.source ? ` · ${l.source}` : ''}</small>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
