import { classroom as c } from '@/content/site';

// The graph in the whiteboard: the design's own vector pieces, placed on a 160 x 110 box (percent insets from Figma).
const PIECES: { src: string; inset: string; pad: string }[] = [
  { src: 'g-axis-x', inset: '81.82% 9.38% 18.18% 9.38%', pad: '-0.75px 0' },
  { src: 'g-axis-y', inset: '9.09% 90.63% 18.18% 9.38%', pad: '0 -0.75px' },
  { src: 'g-dx', inset: '63.64% 25% 36.36% 25%', pad: '-0.75px 0' },
  { src: 'g-dy', inset: '22.73% 25% 36.36% 75%', pad: '0 -0.75px' },
  { src: 'g-line', inset: '22.73% 25% 36.36% 25%', pad: '-3.39% -1.07% -3.89% -2.19%' },
  { src: 'g-pa', inset: '59.09% 71.88% 31.82% 21.88%', pad: '0' },
  { src: 'g-pb', inset: '18.18% 21.88% 72.73% 71.88%', pad: '0' },
];
const LABELS = [
  { t: 'A(2,3)', x: 25, y: 74, cls: '' }, { t: 'B(6,11)', x: 125, y: 14, cls: '' },
  { t: 'Δx = 4', x: 70, y: 73, cls: 'dx' }, { t: 'Δy = 8', x: 126, y: 41, cls: 'dy' },
];
const TOOL_ICON = ['tool-pen', 'tool-geo', 'tool-riddle'];

export default function Classroom() {
  const b = c.board;
  return (
    <section id="classroom" className="sec sec-white">
      <div className="wrap class-grid">
        <div className="class-copy">
          <p className="pill pill-sky">{c.eyebrow}</p>
          <h2>{c.title}</h2>
          <p className="intro-left">{c.text}</p>
          <ul className="features">
            {c.features.map((f) => (
              <li key={f.title} className={`tone-${f.tone}`}>
                <span className="icon-box icon-sm" aria-hidden>{f.icon}</span>
                <div><h4>{f.title}</h4><p>{f.text}</p></div>
              </li>
            ))}
          </ul>
        </div>
        <figure className="board" aria-label={b.caption}>
          <div className="board-bar">
            <div className="board-title"><i className="dot dot-r" /><i className="dot dot-y" /><i className="dot dot-g" /><span>{b.title}</span></div>
            <span className="live"><i />{b.live}</span>
          </div>
          <div className="canvas" aria-hidden>
            <div className="canvas-top">
              <div>
                <p className="challenge">{b.challenge}</p>
                <p className="points">Points: <b className="pa">A(2, 3)</b> and <b className="pb">B(6, 11)</b></p>
              </div>
              <div className="graph-box">
                <div className="graph">
                  {PIECES.map((p) => <span key={p.src} className="piece" style={{ inset: p.inset }}><img src={`/figma/${p.src}.svg`} alt="" style={{ inset: p.pad }} /></span>)}
                  {LABELS.map((l) => <span key={l.t} className={`g-label ${l.cls}`} style={{ left: l.x, top: l.y }}>{l.t}</span>)}
                </div>
              </div>
            </div>
            <div className="response">
              <div><span className="pen" aria-hidden>✍️</span><p><small>Student live handwriting:</small><b>m = 8 / 4 = 2</b></p></div>
              <span className="five">🎉 Perfect Logic! High Five! ✋</span>
            </div>
          </div>
          <div className="board-tools">
            <div>{b.tools.map((t, i) => <span key={t} className={i === 0 ? 'tool on' : 'tool'}><img src={`/figma/${TOOL_ICON[i]}.svg`} alt="" />{t}</span>)}</div>
            <span className="foot-note">{b.foot}</span>
          </div>
          <figcaption>{b.caption}</figcaption>
        </figure>
      </div>
    </section>
  );
}
