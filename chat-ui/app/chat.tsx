'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api-client';

interface Message { id: number; senderId: string; body: string; createdAt: string }
interface Conversation { id: string; title: string; email: string; unread: number; lastMessage: Message | null; lastMessageAt: string }
interface Contact { id: string; name: string; email: string }

const LIST_MS = 15_000;
const THREAD_MS = 4_000;
const visible = () => document.visibilityState === 'visible';
const clock = (iso: string) => new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

export default function Chat() {
  const [me, setMe] = useState('');
  const [convs, setConvs] = useState<Conversation[] | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [picking, setPicking] = useState(false);
  const [query, setQuery] = useState('');
  const [contacts, setContacts] = useState<Contact[] | null>(null);
  const finder = useRef<HTMLDivElement>(null);
  const [error, setError] = useState('');
  const [reachError, setReachError] = useState(''); // a mentor link that did not work; the list refresh must not wipe it
  const [sending, setSending] = useState(false);
  const lastId = useRef(0);
  const end = useRef<HTMLDivElement>(null);
  const activeRef = useRef<string | null>(null);
  activeRef.current = active;

  const loadList = useCallback(async () => {
    try {
      const r = await api<{ me: string; conversations: Conversation[] }>('/api/conversations');
      setMe(r.me); setConvs(r.conversations); setError('');
    } catch (e) { setError((e as Error).message); }
  }, []);

  const markRead = useCallback(async (id: string) => {
    await api(`/api/conversations/${id}/read`, { method: 'POST' }).catch(() => {});
    loadList();
  }, [loadList]);

  // Poll only the open thread, only for what is new, and only while the tab is visible.
  const poll = useCallback(async () => {
    const id = activeRef.current;
    if (!id) return;
    try {
      const after = lastId.current;
      const r = await api<{ messages: Message[] }>(`/api/conversations/${id}/messages${after ? `?after=${after}` : ''}`);
      if (activeRef.current !== id) return; // switched conversation while waiting
      if (r.messages.length) {
        lastId.current = r.messages[r.messages.length - 1].id;
        setMessages((m) => (after ? [...m, ...r.messages] : r.messages));
        if (r.messages.some((m) => m.senderId !== me)) markRead(id);
      }
    } catch (e) { setError((e as Error).message); }
  }, [me, markRead]);

  // "Send Message" on a mentor's card opens the chat as /?mentor=<id>: reach out to that mentor, then show the conversation.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('mentor');
    if (!id) return;
    window.history.replaceState(null, '', window.location.pathname);
    api<{ id: string }>('/api/mentor-chat', { method: 'POST', body: JSON.stringify({ mentorId: id }) })
      .then(async (r) => { await loadList(); setActive(r.id); })
      .catch((e) => setReachError((e as Error).message));
  }, [loadList]);

  useEffect(() => { loadList(); const t = setInterval(() => visible() && loadList(), LIST_MS); return () => clearInterval(t); }, [loadList]);

  useEffect(() => {
    lastId.current = 0; setMessages([]);
    if (!active) return;
    poll(); markRead(active);
    const t = setInterval(() => visible() && poll(), THREAD_MS);
    return () => clearInterval(t);
  }, [active]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [messages]);

  // The search box is always there; the people load the first time it is used, and the results close on a click elsewhere or Escape.
  async function openPicker() {
    setPicking(true);
    if (contacts) return;
    try { setContacts((await api<{ contacts: Contact[] }>('/api/contacts')).contacts); } catch (e) { setError((e as Error).message); setContacts([]); }
  }
  useEffect(() => {
    if (!picking) return;
    const away = (e: MouseEvent) => { if (!finder.current?.contains(e.target as Node)) setPicking(false); };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [picking]);

  const needle = query.trim().toLowerCase();
  const matches = (contacts ?? []).filter((c) => !needle || c.name.toLowerCase().includes(needle) || c.email.toLowerCase().includes(needle));

  async function startWith(c: Contact) {
    try {
      const { id } = await api<{ id: string }>('/api/conversations', { method: 'POST', body: JSON.stringify({ partnerId: c.id }) });
      setPicking(false); setQuery(''); setReachError(''); await loadList(); setActive(id);
    } catch (e) { setError((e as Error).message); }
  }

  async function send() {
    const body = text.trim();
    if (!body || !active || sending) return;
    setSending(true);
    try {
      const m = await api<Message>(`/api/conversations/${active}/messages`, { method: 'POST', body: JSON.stringify({ body }) });
      setText(''); setError('');
      lastId.current = Math.max(lastId.current, m.id);
      setMessages((all) => (all.some((x) => x.id === m.id) ? all : [...all, m]));
      loadList();
    } catch (e) { setError((e as Error).message); } finally { setSending(false); }
  }

  const current = convs?.find((c) => c.id === active);

  return (
    <main className="chat" data-open={active ? 'thread' : 'list'}>
      <aside className="list" aria-label="Conversations">
        <div className="list-head">
          <h2>Conversations</h2>
        </div>
        <div className="finder" ref={finder}>
          <input
            type="search" aria-label="Search people to chat with" placeholder="Search people by name or email" autoComplete="off"
            value={query} onChange={(e) => { setQuery(e.target.value); if (!picking) void openPicker(); }} onFocus={() => void openPicker()}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setPicking(false);
              if (e.key === 'Enter' && matches[0]) { e.preventDefault(); void startWith(matches[0]); }
            }}
          />
          {picking && (
            <div className="picker" role="region" aria-label="Start a chat">
              {contacts === null && <p className="muted-line">Loading…</p>}
              {contacts?.length === 0 && <p className="muted-line">No one to chat with yet. You can chat with people you share a class with.</p>}
              {contacts && contacts.length > 0 && matches.length === 0 && <p className="muted-line">No one matches “{query.trim()}”.</p>}
              {matches.map((c) => <button key={c.id} type="button" className="row" onClick={() => startWith(c)}><span className="avatar" aria-hidden>{c.name[0]}</span><span className="row-text"><b>{c.name}</b><small>{c.email}</small></span></button>)}
            </div>
          )}
        </div>
        {reachError && <p className="err" role="alert">{reachError}</p>}
        {convs === null && <p className="muted-line">Loading…</p>}
        {convs?.length === 0 && !picking && <p className="muted-line" data-testid="no-conversations">No conversations yet. Search for someone you have a class with to start one.</p>}
        <ul>
          {convs?.map((c) => (
            <li key={c.id}>
              <button type="button" className={`row ${c.id === active ? 'sel' : ''}`} aria-current={c.id === active} onClick={() => setActive(c.id)}>
                <span className="avatar" aria-hidden>{c.title[0]}</span>
                <span className="row-text">
                  <b>{c.title}</b>
                  <small>{c.lastMessage ? `${c.lastMessage.senderId === me ? 'You: ' : ''}${c.lastMessage.body}` : 'No messages yet'}</small>
                </span>
                {c.unread > 0 && <span className="unread" role="img" aria-label={`${c.unread} unread`}>{c.unread}</span>}
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <section className="thread" aria-label={current ? `Conversation with ${current.title}` : 'Conversation'}>
        {!current && <p className="empty">Select a conversation, or start a new one.</p>}
        {current && (
          <>
            <div className="thread-head">
              <button type="button" className="nav-btn back" onClick={() => setActive(null)}>Back</button>
              <div className="head-text"><h2>{current.title}</h2>{current.email && <small>{current.email}</small>}</div>
            </div>
            <ol className="msgs" aria-live="polite">
              {messages.map((m) => (
                <li key={m.id} className={m.senderId === me ? 'mine' : 'theirs'}>
                  <p>{m.body}</p>
                  <time dateTime={m.createdAt}>{clock(m.createdAt)}</time>
                </li>
              ))}
              <div ref={end} />
            </ol>
            {error && <p className="err" role="alert">{error}</p>}
            <form className="composer" onSubmit={(e) => { e.preventDefault(); send(); }}>
              <textarea aria-label="Message" rows={1} maxLength={2000} placeholder="Write a message" value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} />
              <button type="submit" className="primary" disabled={!text.trim() || sending}>Send</button>
            </form>
          </>
        )}
        {!current && error && <p className="err" role="alert">{error}</p>}
      </section>
    </main>
  );
}
