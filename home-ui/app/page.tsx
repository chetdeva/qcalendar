import PlanDialog from '@/components/PlanDialog';
import { Footer, Founder, Framework, Header, Hero, Reviews, Why } from '@/components/Sections';

export default function Home() {
  return (
    <div id="top">
      <Header />
      <main>
        <Hero />
        <Why />
        <Framework />
        <Founder />
        <Reviews />
      </main>
      <Footer />
      <PlanDialog />
    </div>
  );
}
