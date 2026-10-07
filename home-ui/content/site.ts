// All page copy lives here. Content comes from the Quanttoria site (github.com/chetdeva/quanttoria-8e, lib/site.ts
// and components/*). Keep it in sync by hand; there is no shared source.

export const BRAND = 'Quanttoria';
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
  emails: ['pprincyaaghaww@quanttoria.com', 'pprincyaaghaww@gmail.com'],
  // As used on the Quanttoria site (a Trustpilot search for Princy's reviews).
  trustpilotUrl: 'https://www.trustpilot.com/review/byjusfutureschool.com?search=princy&stars=5#search-reviews',
  whatsappMessage: "Hi Princy! I'd like to customize a personalized learning plan for my child. My child is in Grade ___.",
};

export const whatsappLink = (message: string = site.whatsappMessage) =>
  `https://wa.me/${site.whatsappNumber}?text=${encodeURIComponent(message)}`;

export const nav = [
  { label: 'Why Quanttoria', href: '#why' },
  { label: 'How it works', href: '#how-it-works' },
  { label: 'Meet our founder', href: '#tutor' },
  { label: 'Why parents trust us', href: '#reviews' },
  { label: 'Contact', href: '#contact' },
];

export const hero = {
  badge: 'Personalized 1:1 learning, Grades 1 to 10',
  title: ['Math no fear,', 'when we’re here.'],
  body: 'Every child learns differently. {brand} brings together the expert teacher, pace and practice to help your child feel confident, enjoy learning and thrive in maths—from catching up to reaching their next big milestone.',
  stats: [
    { value: '20000+', unit: ' hrs', label: 'Teaching experience' },
    { value: '1 : 1', unit: '', label: 'Live class format' },
    { value: 'Free', unit: '', label: 'First class' },
  ],
  stickers: ['3/4 + 1/4 = 1', 'Confidence unlocked'],
  imageAlt: 'A smiling child learning math on a laptop, surrounded by fractions, shapes and numbers',
};

export const grades = Array.from({ length: 10 }, (_, i) => `Grade ${i + 1}`);

export const why = {
  eyebrow: 'Why Quanttoria',
  title: 'Children are not bad or weak at maths. They just need a tailored approach.',
  introLead: 'Here’s how we help every child feel confident in maths. We:',
  intro: ['Meet children where they are', 'Bridge foundational gaps', 'Train them to apply strategies', 'Keep going when a problem is hard and analyse it rightfully'],
  imageAlt: 'Two children pointing excitedly at a whiteboard showing fractions, blocks and shapes',
  reasons: [
    { icon: '👀', title: 'Understanding first', text: 'We explain the why behind each method, so your child builds detailed understanding and reasoning instead of relying on memorised steps.' },
    { icon: '🌎', title: 'US curriculum support', text: 'Personalized support for Common Core, AP pathways and state standards from Grade 1 to 10.' },
    { icon: '🏆', title: 'Ready for what’s next', text: 'Strong foundations and thoughtful challenges help students feel confident and ready for classroom milestones, competitive exams, AP goals, and their next big step.' },
    { icon: '✨', title: 'Private and personalised', text: 'Every lesson is shaped around one child: their pace, learning gaps, strengths, goals and confidence.' },
  ],
};

export const framework = {
  eyebrow: 'How Quanttoria works',
  title: 'A learning plan that grows with your child.',
  intro: 'Personalized learning is more than a worksheet with a name on it. We combine a thoughtful teacher, the right challenge and regular parent feedback to make every lesson count.',
  stages: [
    { icon: '💬', title: 'Tell us about your child', text: 'Share their strengths, struggles, interests and goals. We listen before we teach.' },
    { icon: '📋', title: 'Build your learning plan', text: 'We match your child with a vetted maths coach tailored to their needs with their pace and lesson style.' },
    { icon: '🎥', title: 'Your first demo lecture is free', text: 'Meet your teacher in a live, personalized session. No obligation.' },
    { icon: '📈', title: 'Learn, track, and grow', text: 'Parents get clear feedback while children build skills, confidence and independence.' },
  ],
  boards: [
    { name: 'Common Core', text: 'Build strong foundations, reasoning and problem-solving habits.' },
    { name: 'AP Calculus', text: 'Prepare for limits, derivatives, integrals and exam-style thinking.' },
    { name: 'AP Statistics', text: 'Make data, probability and interpretation feel less intimidating.' },
    { name: 'State standards', text: 'Stay aligned with your child’s local classroom expectations.' },
  ],
  boardsTitle: 'A plan that speaks your child’s school language.',
  boardsText: 'From everyday classroom confidence to ambitious AP goals, we connect the dots between where your child is today and where they want to go next.',
  outcomesTitle: 'What your child walks away with',
  outcomes: [
    'Clear understanding of concepts and the reasons behind each method and formula',
    'Confidence analysing word problems and unfamiliar questions',
    'Practical strategies for applying maths beyond worked examples',
    'Preparation for global curricula, assessments and competitions',
    'Resilience, independence and logical thinking that lasts',
  ],
  whoTitle: 'Who we teach',
  who: ['Grade 1-2', 'Grade 3-5', 'Grade 6-8', 'Grade 9-10', 'US standards'],
  whoText: 'Classes run live with a shared interactive whiteboard. Homework and class activities are shared after every session for repractice.',
  whoNote: 'We develop more than IQ. Every class also builds patience, resilience and the adversity quotient your child needs to keep going when a problem is hard.',
  free: { title: 'Your first demo lecture is free', text: 'A live, personalized session for your child to meet their teacher and experience the {brand} difference. No obligation.', cta: 'Book your free demo' },
};

export const founder = {
  eyebrow: 'Meet our founder',
  tagline: 'Personalised Maths Coach',
  quote: 'As educators, we have to envision the future and work backwards from there. Today, more than ever, students need the ability to think logically, solve problems, and approach challenges with confidence. Throughout my career, I’ve had the privilege of guiding hundreds of students, nurturing their passion for mathematics and inspiring them to reach for advanced learning and bigger goals.',
  text: 'Together, our coaches create an inclusive, interactive, supportive learning environment where questions are welcome, progress is visible and every student gets the right kind of challenge.',
  credentials: [
    { label: 'Teaching hours', value: site.owner.hours },
    { label: 'Industry', value: 'Ed-Tech' },
    { label: 'Grades', value: '1 to 10' },
    { label: 'US pathways', value: 'Common Core + AP' },
  ],
};

export const reviews = {
  eyebrow: 'Why parents trust us',
  title: 'Progress feels better when families are part of the journey.',
  stats: [['20,000+', 'teaching hours'], ['1:1', 'live attention'], ['100%', 'personalized plans']],
  heading: 'Clients rated us 5 stars on Trustpilot',
  all: 'Read all reviews',
  list: [
    { name: 'Chandan Kumar Anjani', where: 'United States', text: 'I started with a demo class with Ms Princy Sugandh. My daughters got so much involved in the first class that she wanted to join because of the demo class only. We are close to completing 1 year with Princy. I felt she pushes my daughter to get the best out of her and sets a pretty high standard in teaching. She puts a lot of effort not only into improving her in the subject she is teaching, but otherwise as well. She appreciates a good job and gives feedback to parents when needed to help improve as well. Thanks for being her teacher.' },
    { name: 'Parent', where: 'United States', text: 'Ms Princy Sugandh has been our son’s math teacher for the past year. We have seen our child’s math skill set improve considerably under her guidance. She is punctual, stern, helps him problem solve as well as encourages him to critically think before tackling problems. She has set high expectations for our child and puts a lot of effort into her teaching each class. We are very grateful to having her as our son’s teacher, for her expertise and her commitment towards our child.' },
    { name: 'Shilpi', where: 'United States', text: 'Thank you Miss Princy Sugandh for teaching my kid math in an amazing style. He is very happy to learn all the new techniques. Thank you once again.' },
    { name: 'Georgene Rondero', where: 'United States', text: 'My son, who is autistic with learning disabilities, is really doing well all due to his fantastic instructor, Princy Sugandh. She is so patient and kind, but firm and demands that he always performs his best. I would wholeheartedly recommend this program for anyone!' },
    { name: 'Parent', where: 'United States', text: 'Ms Princy Sugandh was my son’s teacher. She was an excellent teacher, very patient with my son — he is autistic, it was challenging during some classes but she handled it very well. My son loved her classes and she became a trusted advisor for me as well in regards to ways of handling his condition. She is very detailed. Thank you Ms Princy for being a part of his learning!' },
    { name: 'Gaya N.', where: 'Canada', text: 'Princy is an amazing teacher, very assertive and goal oriented with my son. She challenges him to be his best.' },
  ],
};

export const footer = {
  about: 'Personalized online maths learning for US students in Grades 1 to 10.',
};

export const fill = (s: string) => s.replaceAll('{brand}', BRAND);
