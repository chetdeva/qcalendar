// All page copy lives here. Content comes from the Quanttoria site (github.com/chetdeva/quanttoria-8e, lib/site.ts
// and components/*). Keep it in sync by hand; there is no shared source.

export const BRAND = 'Quanttoria';
/** The public address search engines and link previews use (the site's canonical host). */
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.quanttoria.com';
export const ACCOUNTS_URL = process.env.NEXT_PUBLIC_ACCOUNTS_URL ?? 'http://localhost:3003';

export const site = {
  owner: {
    name: 'Princy Sugandh',
    role: 'Founder & Lead Math Educator',
    hours: '20000+',
    linkedinUrl: 'https://www.linkedin.com/in/princysugandh/',
  },
  whatsappNumber: '919119571369',
  whatsappDisplay: '+91 91195 71369',
  emails: ['pprincyaaghaww@quanttoria.com'],
  // Parents wrote these reviews on Trustpilot about classes with Princy at BYJU'S FutureSchool; this is that school's page filtered to her name.
  // It is not a Quanttoria Trustpilot page (there is none yet), so the page says where the reviews come from.
  reviewsSourceUrl: 'https://www.trustpilot.com/review/byjusfutureschool.com?search=princy&stars=5#search-reviews',
  whatsappMessage: "Hi Princy! I'd like to customize a personalized learning plan for my child. My child is in Grade ___.",
};

export const whatsappLink = (message: string = site.whatsappMessage) =>
  `https://wa.me/${site.whatsappNumber}?text=${encodeURIComponent(message)}`;

export const nav = [
  { label: 'Why Quanttoria', href: '#why' },
  { label: 'How it works', href: '#how-it-works' },
  { label: 'Live classroom', href: '#classroom' },
  { label: 'Meet our founder', href: '#tutor' },
  { label: 'Why parents trust us', href: '#reviews' },
  { label: 'Contact', href: '#contact' },
];

// Layout and wording follow the Figma design. Numbers and credentials are only ones the site already stated
// (20000+ hours, Grades 1 to 10, 13 five-star parent reviews); invented figures from the mock-up are not used.
export const hero = {
  banner: { lead: 'Personalized 1:1 learning', range: 'Grades 1–10', free: 'First class free! ✨' },
  eyebrow: 'Premier 1:1 mathematical mentorship',
  title: ['Confidence', 'unlocked.'],
  pills: [
    { icon: '★★★★★', text: '13 five-star parent reviews', tone: 'sun' },
    { icon: '🇺🇸', text: 'US curriculum support', tone: 'sky' },
    { icon: '⚡', text: '20,000+ teaching hours', tone: 'mint' },
  ],
  primary: 'Book your free 1:1 class 🚀',
  secondary: 'See how it works 💡',
  reassurance: 'Takes 60 seconds • No credit card required • Zero-commitment trial',
  chip: '🪄 Live interactive whiteboard',
  card: { value: '20,000+', label: 'Teaching hours', note: '🏆 Your first class is free' },
  sticker: ['From tears', 'to A’s! 🎓'],
  imageAlt: 'A smiling child learning math on a laptop, surrounded by fractions, shapes and numbers',
};

export const why = {
  eyebrow: '🦸 The secret sauce: math super-resilience',
  title: 'Children are not bad or weak at math. They just need a tailored approach.',
  subtitle: 'We meet children where they are, bridge their foundational gaps, and equip them with strategies to stay persistent and analyze challenging problems with confidence.',
  old: {
    icon: '😴', title: 'The old rote way', sub: 'Mechanical drills, blind memorization & test panic',
    items: ['“Just memorize formula #14 for tomorrow’s quiz or fail.”', 'Mistakes feel like personal failure, causing math shutdown and tears.', 'Forgotten 2 days after the test because no mental picture was built.'],
  },
  fresh: {
    icon: '🧠✨', title: 'The Quanttoria visual way', sub: 'Intuitive discovery, spatial geometry & genuine pride', ribbon: 'SUPERCHARGED ⚡',
    items: ['Visual, interactive proofs show the *why* before the formula.', 'Mistakes are treated like fun detective clues — building a high Adversity Quotient (AQ).', 'Lifelong intuitive mastery that lasts through middle school, high school & beyond.'],
  },
  proof: [['20,000+', 'teaching hours'], ['1:1', 'live attention'], ['100%', 'personalized plans']],
  pillars: {
    title: 'The 3 pillars of mathematical tenacity 🛡️',
    sub: 'Equipping your child with emotional grit and cognitive resilience that transfers to school and life.',
    list: [
      { icon: '🧩', tone: 'sky', title: '1. The “Why” over rote', text: 'Visual representations and real-world proofs come before every formula, so intuition clicks effortlessly.' },
      { icon: '🛡️', tone: 'sun', title: '2. AQ & productive struggle', text: 'Tricky steps become stimulating puzzles, shame goes away and students learn how to bounce back.' },
      { icon: '🌟', tone: 'rose', title: '3. Micro-milestone high fives', text: 'Validation for logical grit and smart questions builds authentic, bulletproof self-belief.' },
    ],
  },
};

export const framework = {
  eyebrow: '🗺️ Predictable, tailored growth',
  title: 'How Quanttoria works 🚀',
  intro: 'Personalized learning is more than a worksheet with a name on it. We combine a thoughtful teacher, the right challenge and regular parent feedback to make every lesson count.',
  stages: [
    { icon: '🧭', tone: 'sky', title: 'Tell us about your child', text: 'Share their strengths, struggles, interests and goals. We listen before we teach.', chip: '🎯 Starts from where your child is' },
    { icon: '🧬', tone: 'sun', title: 'Build your learning plan', text: 'We match your child with a vetted math coach tailored to their needs with their pace and lesson style.', chip: '✨ A coach matched to your child' },
    { icon: '🚀', tone: 'violet', title: 'Your first demo lecture is free', text: 'Meet your teacher in a live, personalized session. No obligation.', chip: '🎨 Live and hands-on' },
    { icon: '🔁', tone: 'mint', title: 'Learn, track, and grow', text: 'Parents get clear feedback while children build skills, confidence and independence.', chip: '💛 Clear feedback for parents' },
  ],
};

export const classroom = {
  eyebrow: '🎨 The digital atelier',
  title: 'The Live Classroom: Where Math Becomes Tangible & Fun!',
  text: 'Standard tutoring is boring video calls with awkward screen sharing. Quanttoria turns the screen into an interactive mathematics playground with live visuals and hands-on manipulatives!',
  features: [
    { icon: '📐', tone: 'sky', title: 'Interactive visualizers', text: 'Shapes, coordinate grids, and curves move live so algebra turns into spatial intuition.' },
    { icon: '✏️', tone: 'sun', title: 'Shared whiteboard', text: 'Student and coach write, draw, and brainstorm together in real time.' },
    { icon: '🏆', tone: 'mint', title: 'US curriculum alignment', text: 'Common Core and state standards for Grades 1 to 10, with a clear path toward AP Calculus and AP Statistics.' },
  ],
  board: {
    title: 'Quanttoria Interactive Sandbox — Lesson: Coordinate Geometry',
    live: 'Coach Live',
    challenge: '✨ Challenge: Find the Slope (m) = (y₂ - y₁) / (x₂ - x₁)',
    tools: ['Pen', 'Graphs', 'Riddles'],
    foot: '✨ Shared pen • 1:1 live audio',
    caption: 'Illustration of a live class',
  },
};

export const founder = {
  eyebrow: '🍎 Academic rigor & big heart',
  title: 'Meet our founder',
  intro: 'Over 20,000 hours of 1:1 teaching across Grades 1 to 10, turning math dread into math triumphs!',
  tags: ['🍎 Founder & Lead Math Educator', 'Personalized Math Coach', 'Common Core + AP path'],
  role: 'Private 1:1 math coaching for Grades 1 to 10 · US Common Core and AP pathways',
  quote: 'As educators, we have to envision the future and work backwards from there. Today, more than ever, students need the ability to think logically, solve problems, and approach challenges with confidence. Throughout my career, I’ve had the privilege of guiding hundreds of students, nurturing their passion for mathematics and inspiring them to reach for advanced learning and bigger goals.',
  rating: '13 five-star parent reviews',
  stats: [
    { value: '20000+', label: 'Teaching hours' },
    { value: '1 to 10', label: 'Grades taught' },
    { value: 'Ed-Tech', label: 'Industry' },
  ],
};

export const reviews = {
  eyebrow: 'Why parents trust us',
  title: 'Progress feels better when our family is part of the journey.',
  banner: {
    title: '13 five-star reviews of Princy’s teaching',
    sub: 'Parents wrote them on Trustpilot in 2022 and 2023, about classes with Princy at BYJU’S FutureSchool. Quanttoria’s own reviews are coming.',
  },
  all: 'See them on Trustpilot',
  // Word for word, as the parent wrote them (spelling included), with the reviewer's Trustpilot name, date and a link to that review.
  list: [
    { name: 'Chandan Kumar Anjani', date: 'Mar 2023', url: 'https://www.trustpilot.com/reviews/6420df6c056eb195adcf987c', text: 'I started BYJU with a demo class with Ms Princy Sugandh. My daughters got so much involved in the first class as she wanted to join BYJU because of the DEMO class only. We are close to complete 1 year with Princy. I felt she pushes my daughter to get best out of her and set pretty high standard in teaching. She puts lot of effort not on improving her in the subject she is teaching but otherwise as well. She appreciate when good job and gives feedback to parents when needed to help improve as well. Thanks for being her teacher.' },
    { name: 'Worldwidetraveler', date: 'Mar 2023', url: 'https://www.trustpilot.com/reviews/641b65dbd294dce647fba70e', text: 'Ms Princy Sugandh has been our son’s math teacher for the past year. We have seen our child’s math skill set improve considerably under her guidance. She is punctual, stern, helps him problem solve as well as encourages him to critically think before tackling problems. She has set high expectations for our child and puts a lot of efforts into her teaching each class. We are very grateful to having her as our son’s teacher, for her expertise and her commitment towards our child.' },
    { name: 'Shilpi', date: 'Mar 2023', url: 'https://www.trustpilot.com/reviews/641cb677328e2bd094e34513', text: 'Thank you Miss Princy Sugandha to teach my kid math in an amazing style.He is very happy to learn all the new techniques..Thank you once again.' },
    { name: 'Georgene Rondero', date: 'May 2022', url: 'https://www.trustpilot.com/reviews/627c621d166eb7ecbf444cf1', text: 'BYJU Future School is extraordinary! My son, who is autistic with learning disabilities, is really doing well all due to his fantastic instructor, Princy Sugandh. She is so patient and kind, but firm and demands that he always performs his best. I would wholeheartedly recommend this program for anyone!' },
    { name: 'customer', date: 'Dec 2022', url: 'https://www.trustpilot.com/reviews/63a132b22338b6d417a12c9e', text: 'Ms Princy Sugandh was my son’s Byjus teacher. She was an excellent teacher, very patient with my son, he is autistic, it was challenging during some classes but she handled it very well. My son loved her classes and she became a trusted advisor for me as well in regards to ways of handling his condition. She is very detailed. Thank you Ms Princy for being a part of his learning! My best wishes and prayers to you always.' },
    { name: 'Gaya N', date: 'Mar 2023', url: 'https://www.trustpilot.com/reviews/641cd3f3a40c1ff2c910b100', text: 'Mr. Princy is an amazing teacher, very assertive and goal oriented with my son. She challenges him to be his best.' },
  ],
};

export const booking = {
  eyebrow: '🎁 Your first class is free',
  title: 'Experience the Magic in Your Free First Class!',
  sub: 'Zero cost, zero pressure. Meet your teacher in a live, personalized session built around your child.',
  grades: [
    { icon: '🐣', label: 'Grades 1–2', note: 'Early Foundations' },
    { icon: '🧩', label: 'Grades 3–5', note: 'Fractions & Logic' },
    { icon: '📐', label: 'Grades 6–8', note: 'Pre-Algebra' },
    { icon: '🚀', label: 'Grades 9–10', note: 'Algebra & Geometry' },
  ],
  goals: ['Bridging Gaps', 'Building Confidence', 'Olympiad / Competitions', 'School Homework'],
  submit: 'Claim your child’s free 1:1 session 🎁',
  reassure: ['Takes 60 seconds', 'No credit card required', 'Free first class'],
  note: 'This opens WhatsApp with your details filled in. Nothing is stored on this site.',
};

export const footer = {
  about: 'Personalized online math learning for US students in Grades 1 to 10.',
};

export const fill = (s: string) => s.replaceAll('{brand}', BRAND);
