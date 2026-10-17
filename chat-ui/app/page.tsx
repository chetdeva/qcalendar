import { getMe } from '@/lib/me';
import { dashboardUrl, usersUiUrl } from '@/lib/env';
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
    <div className="shell">
      <header className="top">
        <h1>Chat</h1>
        <div className="who">
          <span className="who-name">{me.full_name || me.email}</span>
          <span className={`badge badge-${me.role}`}>{me.role}</span>
          <a className="nav-btn as-link" href={dashboardUrl}>Dashboard</a>
          <a className="nav-btn as-link" href={`${usersUiUrl}/profile`}>Account</a>
          <form action={`${usersUiUrl}/auth/signout`} method="post">
            <button type="submit" className="nav-btn">Sign out</button>
          </form>
        </div>
      </header>
      <Chat />
    </div>
  );
}
