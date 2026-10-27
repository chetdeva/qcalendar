'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CameraIcon, CheckIcon } from './icons';

const SIZE = 256;

/** Centre-crops the picture to a square and re-encodes it: small to send, and the camera's location data is dropped. */
async function square(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file); // throws for anything that is not a picture
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE;
  canvas.getContext('2d')!.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, SIZE, SIZE);
  bitmap.close();
  for (const type of ['image/webp', 'image/jpeg']) {
    const blob = await new Promise<Blob | null>((done) => canvas.toBlob(done, type, 0.85));
    if (blob?.type === type) return blob;
  }
  throw new Error('This browser could not prepare the picture.');
}

export function AvatarEditor({ initials, avatar }: { initials: string; avatar: string | null }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function send(run: () => Promise<Response>) {
    setBusy(true); setError('');
    try {
      const res = await run();
      if (!res.ok) throw new Error(((await res.json().catch(() => ({}))).error?.message as string) ?? 'Could not save the picture.');
      router.refresh(); // the header and this hero are rendered on the server: ask for them again
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // so choosing the same file again still fires
    if (!file) return;
    let blob: Blob;
    try { blob = await square(file); } catch { return setError('That file is not a picture we can read. Use a PNG, JPEG or WebP.'); }
    await send(() => fetch('/api/avatar', { method: 'PUT', headers: { 'content-type': blob.type }, body: blob }));
  }

  return (
    <div className="pf-avatar-col">
      <div className="pf-avatar">
        {avatar ? <img src={`/api/avatar?v=${encodeURIComponent(avatar)}`} alt="Your profile picture" width={80} height={80} /> : <span aria-hidden>{initials}</span>}
        <i className="pf-tick" aria-hidden><CheckIcon size={14} /></i>
        <button type="button" className="pf-cam" aria-label="Change photo" title="Change photo" disabled={busy} onClick={() => input.current?.click()}><CameraIcon size={14} /></button>
      </div>
      <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={pick} aria-label="Choose a profile picture" />
      {avatar && <button type="button" className="pf-remove" disabled={busy} onClick={() => send(() => fetch('/api/avatar', { method: 'DELETE' }))}>Remove photo</button>}
      {error && <p className="pf-avatar-err" role="alert">{error}</p>}
    </div>
  );
}
