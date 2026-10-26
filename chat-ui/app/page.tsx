import { getMe } from '@/lib/me';
import { AppHeader } from '@components/app-header';
import { SiteFooter } from '@components/site-footer';
import Chat from './chat';

export default async function Page() {
  const result = await getMe();
  if ('error' in result) {
    return (
      <main className="boot-error" role="alert">
        <h1>Something went wrong</h1>
        <p>{result.error}</p>
        <a href="/">Try again</a>
      </main>
    );
  }
  const { me } = result;
  return (
    <>
      <div className="shell">
        <AppHeader current="chat" name={me.full_name || me.email} role={me.role} />
        <Chat />
      </div>
      <SiteFooter /> {/* under the full-height chat: scroll down to see it */}
    </>
  );
}
