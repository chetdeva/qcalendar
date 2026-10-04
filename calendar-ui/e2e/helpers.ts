import type { APIRequestContext } from '@playwright/test';

export const API_PORT = 3100;
export const WEB_PORT = 3102;
export const API_URL = `http://localhost:${API_PORT}`;
export const API_KEY = 'e2e-key-e2e-key-e2e-key-e2e-key';

const headers = { authorization: `Bearer ${API_KEY}`, 'content-type': 'application/json' };

/** Today's date in UTC. The suite runs the browser in UTC so this matches what the calendar shows. */
export const todayUtc = () => new Date().toISOString().slice(0, 10);

export async function seedSettings(request: APIRequestContext) {
  const allDay: [string, string][] = [['00:00', '23:59']];
  const res = await request.put(`${API_URL}/v1/settings`, {
    headers,
    data: {
      timezone: 'UTC',
      slotStepMinutes: 30,
      bufferMinutes: 0,
      workingHours: { sun: allDay, mon: allDay, tue: allDay, wed: allDay, thu: allDay, fri: allDay, sat: allDay },
    },
  });
  if (!res.ok()) throw new Error(`seedSettings failed: ${res.status()}`);
}

export async function cancelAll(request: APIRequestContext) {
  const { events } = await (await request.get(`${API_URL}/v1/events`, { headers })).json();
  for (const e of events) await request.delete(`${API_URL}/v1/events/${e.id}`, { headers });
}

export async function createEvent(request: APIRequestContext, data: Record<string, unknown>) {
  const res = await request.post(`${API_URL}/v1/events`, { headers, data });
  if (!res.ok()) throw new Error(`createEvent failed: ${res.status()} ${await res.text()}`);
  return res.json();
}

export async function listEvents(request: APIRequestContext) {
  const { events } = await (await request.get(`${API_URL}/v1/events`, { headers })).json();
  return events as { id: string; title: string; start: string; end: string; attendees: string[]; category: string }[];
}
