// All page copy lives here. Everything below is PLACEHOLDER content taken from the Figma mock:
// the brand, coaches, reviews, ratings and credentials are not real. Replace before launch.

export const BRAND = 'MathExcellence';
export const ACCOUNTS_URL = process.env.NEXT_PUBLIC_ACCOUNTS_URL ?? 'http://localhost:3003';

export const nav = [
  { label: 'Why Us & Mission', href: '#why' },
  { label: 'How It Works', href: '#how-it-works' },
  { label: 'Meet Coaches', href: '#coaches' },
  { label: 'Interactive Portals', href: '#portals' },
];

export const hero = {
  badge: 'US Common Core & State Standards Aligned • Grades 1–10',
  title: ['Confidence', 'Unlocked.'],
  body: 'Children are not inherently “bad at math”—they simply need a tailored approach. At {brand}, we teach the “why” behind every formula to cultivate intuitive logical reasoning. We champion Adversity Quotient (AQ), empowering students with the resilience to grapple with challenging problems without giving up.',
  note: '100% Free • No Credit Card • 45-Min Evaluation',
  stats: [
    { value: '4.98', unit: '/5', label: 'Trustpilot (1,420+ reviews)' },
    { value: '94%', unit: '', label: 'Grade gain in 90 days' },
    { value: 'Top 1%', unit: '', label: 'MIT & Stanford mentors' },
  ],
  card: { tag: 'Socratic 1:1 Guided Inquiry', title: 'Adversity Quotient (AQ) Focus', text: 'Building stubborn persistence in complex multi-step problems', chip: 'Proven' },
};

export const grades = [
  { id: '1-5', title: 'Grades 1–5', sub: 'Foundations' },
  { id: '6-8', title: 'Grades 6–8', sub: 'Pre-Alg & Logic' },
  { id: '9-10', title: 'Grades 9–10', sub: 'Algebra & Geo' },
];

export const focusAreas = [
  'Building Math Confidence & Overcoming Math Anxiety',
  'Catching Up on Foundational Gaps',
  'Advanced Enrichment & Competition Prep (AMC 8)',
  'Test Prep (state tests, MAP, SAT)',
  'Homework Support & Study Habits',
];

export const framework = {
  eyebrow: 'Pedagogical Framework',
  title: 'How {brand} Transforms Learners',
  intro: 'A four-stage progression that replaces mechanical memorization with deep conceptual intuition and resilient self-efficacy.',
  stages: [
    { icon: '🎯', title: 'Diagnostic Deep Dive', text: 'We pinpoint hidden conceptual fractures rather than just grading answers. A student struggling with 7th-grade algebra often has an undetected 4th-grade fraction model gap.', tag: 'Comprehensive 36-Skill Audit' },
    { icon: '🧩', title: 'Precision Coach Pairing', text: 'Matched with a dedicated mentor aligned with your child’s emotional temperament, neurotype, and pace. Same trusted coach every single week for authentic relational safety.', tag: '100% Coach Match Guarantee' },
    { icon: '💡', title: 'The “Why” Breakthrough', text: 'Students manipulate virtual physical models before seeing abstract formulas. By discovering the Pythagorean logic visually, the formula becomes second nature forever.', tag: 'Interactive Visual Proofs' },
    { icon: '🚀', title: 'Autonomous Mastery (AQ)', text: 'We cultivate high Adversity Quotient. Learners embrace productive struggle, dissect their own errors without frustration, and transition into independent self-starters.', tag: 'Self-Driven Homework Ease' },
  ],
};

export const coaches = {
  eyebrow: 'Elite Pedagogical Talent',
  title: 'Meet Your Child’s Dedicated Coach',
  vetting: { title: 'Top 1% Strict Tutor Vetting', text: 'Over 20,000+ verified global teaching hours across US curricula' },
  list: [
    { name: 'Dr. Sarah Lin', initials: 'SL', rating: '4.98 (3,200+ hrs)', creds: 'Harvard M.Ed. • MIT BS', role: 'Middle School Algebra & Olympiad Lead', bio: '9+ years transforming test anxiety into geometric intuition. Specializes in AMC 8 competition training, non-routine logic puzzles, and quadratic visualization.', praise: 'Sarah helped my 8th-grade son conquer Polynomials without breaking a sweat.' },
    { name: 'Marcus Vance', initials: 'MV', rating: '4.99 (4,100+ hrs)', creds: 'Stanford BS Applied Math', role: 'Elementary Foundations & Pre-Algebra Specialist', bio: '8+ years fostering unstoppable early number sense. Renowned for turning abstract fractions, ratios, and integers into engaging tactile adventures.', praise: 'Marcus brought infectious joy back into our evening homework routines.' },
  ],
  bar: {
    eyebrow: 'Pedagogical Standard',
    title: 'The 1% Acceptance Bar',
    text: 'We interview over 400 applicants for every single tutor we onboard. Our vetting includes:',
    checks: ['Dual FBI & State Level Background Clearance', 'Socratic Blind Mock-Teaching Audition', 'Adversity Quotient & Empathy EQ Battery', 'Continuous Bi-Weekly Peer Pedagogical Reviews'],
    cta: 'Request Tutor Matching Consultation',
  },
};

export const reviews = {
  title: 'Trustpilot 4.9 out of 5',
  sub: 'Verified Parent Reviews Across 44 US States',
  badge: '100% Real Unfiltered Feedback',
  list: [
    { title: '“From tears to the 98th percentile!”', text: '“My daughter went from daily tears over 7th-grade fractions to scoring in the 98th percentile on her Northwest Evaluation Association MAP assessment. Coach Marcus gave her genuine self-belief.”', who: 'Rachel M. (Parent of 7th Grader)', where: 'Austin, TX' },
    { title: '“No more math resistance”', text: '“Instead of memorizing steps like a robot, our son now explains the logic behind Pythagorean theorem to us at dinner! The whiteboard tech and live manipulatives make all the difference.”', who: 'David & Karen K. (Grade 5)', where: 'Naperville, IL' },
    { title: '“Adversity Quotient is real”', text: '“Dr. Sarah doesn’t give him the answers. She teaches him how to pause, test assumptions, and persist. He used to freeze when he made a mistake; now he says ‘Mistakes are how the brain grows.’”', who: 'Priya S. (Grade 9 Algebra)', where: 'San Jose, CA' },
  ],
};

export const portals = {
  eyebrow: 'Dual Interactive Experience',
  title: 'Live Learning & Management Portals',
  student: {
    live: { when: 'Starts in 8 minutes', title: 'Live 1:1 Session with Coach Sarah Lin', topic: 'Topic: Multi-Step Linear Equations & Balance Scale Logic' },
    level: { label: 'Level 7 Scholar', streak: '14-Day Streak', name: 'Math Alchemist', xp: 2450, next: 550, milestones: ['Equation Master', 'Geo Explorer', 'AQ Resilient'] },
    assignments: [
      { kind: 'Khan Repractice', due: 'Due Tomorrow', title: 'Slope-Intercept Graphing Puzzles (5 Qs)', meta: 'Est. 12 mins', action: 'Start' },
      { kind: 'Coach Audio Note', due: 'Yesterday', title: 'Feedback on Pythagorean Leg Problem #4', meta: '', action: 'Listen to Dr. Sarah (1m 14s)' },
    ],
    radar: { eyebrow: 'MAP & Common Core Growth Matrix', title: 'Topic Proficiency Radar & Breakdown', overall: 'Overall: 85% Mastery', topics: [['Algebraic Thinking & Functions', 92], ['Geometric Intuition & Spatial Models', 88], ['Data, Statistics & Probability', 84], ['Proportional Reasoning & Fractions', 76]] as [string, number][], note: 'Leo solved 3 quadratic word problems independently without asking for hints! Adversity Quotient up +14%.' },
  },
  teacher: {
    title: 'Today’s roster',
    rows: [
      { name: 'Leo R. (Grade 7)', time: '4:00 PM', topic: 'Linear equations', status: 'Confirmed' },
      { name: 'Ava T. (Grade 4)', time: '5:00 PM', topic: 'Fraction models', status: 'Confirmed' },
      { name: 'Noah P. (Grade 9)', time: '6:30 PM', topic: 'Quadratics', status: 'Awaiting reply' },
    ],
    note: 'Session notes, assignments and parent reports are managed from one place.',
  },
};

export const trust = [
  { title: 'State Standards Aligned', text: 'Rigorous US Common Core and custom state curriculum mastery.' },
  { title: 'NCTM Member Institution', text: 'Adhering to National Council of Teachers of Mathematics pedagogy.' },
  { title: '100% Satisfaction Guarantee', text: 'Risk-free trial with seamless coach matching guarantee.' },
];

export const footer = {
  about: 'Pioneering student-centered 1:1 online math mentorship across Grades 1 through 10. Building unbreakable conceptual foundations, academic honors, and authentic problem-solving joy.',
  columns: [
    { title: 'Grades 1–5', lead: 'Elementary Foundations', links: ['Grade 1: Number Bonds & Place Value', 'Grade 2: Fluency & Problem Solving', 'Grade 3: Multiplication & Division Logic', 'Grade 4: Multi-Digit Operations & Fractions', 'Grade 5: Decimals, Volumes & Ratios'] },
    { title: 'Grades 6–8', lead: 'Middle School Mastery', links: ['Grade 6: Pre-Algebra Foundations', 'Grade 7: Proportions & Expressions', 'Grade 8: Linear Systems & Functions', 'Math Kangaroo & AMC 8 Prep', 'Accelerated Honors Track'] },
    { title: 'Grades 9–10 & Support', lead: 'Algebra & Geometry', links: ['Algebra I: Quadratics & Systems', 'High School Euclidean Geometry', 'Algebra II & Trigonometry Foundations', 'Parent Consultation Desk', '24/7 Academic Support Team'] },
  ],
  legal: ['Privacy Policy', 'Terms of Service', 'Curriculum Standards'],
};

export const fill = (s: string) => s.replaceAll('{brand}', BRAND);
