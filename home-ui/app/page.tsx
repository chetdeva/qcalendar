import BookingForm from '@/components/BookingForm';
import Classroom from '@/components/Classroom';
import { Footer, Founder, Framework, Header, Hero, Reviews, Why } from '@/components/Sections';

export default function Home() {
  return (
    <div id="top">
      <Header />
      <main>
        <Hero />
        <Why />
        <Framework />
        <Classroom />
        <Founder />
        <Reviews />
        <BookingForm />
      </main>
      <Footer />
    </div>
  );
}
