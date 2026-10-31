import { ImageResponse } from 'next/og';

export const alt = 'Quanttoria: 1-on-1 online math tutoring for kids, Grades 1-10. First class free.';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function Image() {
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: 80, background: 'linear-gradient(135deg, #eff4ff 0%, #fff4cc 100%)', color: '#0d1c2f', fontFamily: 'sans-serif' }}>
        <div style={{ display: 'flex', fontSize: 40, fontWeight: 800, color: '#006194' }}>Quanttoria</div>
        <div style={{ display: 'flex', fontSize: 84, fontWeight: 800, lineHeight: 1.05, marginTop: 24 }}>1-on-1 online math tutoring for kids</div>
        <div style={{ display: 'flex', fontSize: 38, marginTop: 28, color: '#3f4850' }}>Grades 1-10 · Common Core · Your first class is free</div>
      </div>
    ),
    size,
  );
}
