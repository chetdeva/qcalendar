import { Icon } from './img';

/** The left column: what Quanttoria is for. Static; nothing here claims numbers or results we do not have. */
export function Story() {
  return (
    <div className="au-left">
      <section className="au-story">
        <div className="au-story-top"><span className="au-chip"><Icon name="sparkle" width={13} height={12} /> K-10 Math Mastery</span></div>
        <div className="au-photo">
          <img src="/images/auth/photo.jpg" alt="A child learning math with a coach on a laptop" />
          <figure className="au-quote">
            <span className="au-quote-ico"><Icon name="bulb" width={14} height={18} /></span>
            <div>
              <blockquote>&ldquo;Where math anxiety turns into &lsquo;Aha!&rsquo; moments.&rdquo;</blockquote>
              <figcaption>Live 1:1 coaching that builds confidence in K-10 math.</figcaption>
            </div>
          </figure>
        </div>
      </section>
      <div className="au-safe">
        <span className="au-safe-ico"><Icon name="shield-check" width={18} height={18} /></span>
        <div>
          <b>Safe, ad-free learning</b>
          <p>100% ad-free and COPPA-safe, so students can focus on learning.</p>
        </div>
      </div>
      <aside className="au-streak">
        <span className="au-streak-ico"><Icon name="flame" width={16} height={19} /></span>
        <div>
          <b>Build a daily streak</b>
          <p>Finish tasks every day to earn Sparky XP.</p>
        </div>
      </aside>
    </div>
  );
}
