import { Coaches, Framework, Header, Hero, PortalsSection, TrustAndFooter } from '@/components/Sections';

export default function Home() {
  return (
    <div id="top">
      <Header />
      <main>
        <Hero />
        <Framework />
        <Coaches />
        <PortalsSection />
      </main>
      <TrustAndFooter />
    </div>
  );
}
