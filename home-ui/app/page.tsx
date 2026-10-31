import BookingForm from '@/components/BookingForm';
import Classroom from '@/components/Classroom';
import JsonLd from '@/components/JsonLd';
import { Faq, Footer, Founder, Framework, Header, Hero, Reviews, Why } from '@/components/Sections';

export default function Home() {
  return (
    <div id="top">
      <JsonLd />
      <Header />
      <main>
        <Hero />
        <Why />
        <Framework />
        <Classroom />
        <Founder />
        <Reviews />
        <Faq />
        <BookingForm />
      </main>
      <Footer />
    </div>
  );
}
