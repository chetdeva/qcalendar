// Landing pages for the searches parents actually make: one per grade band and one per goal. Each has its own copy.
export type Faq = { q: string; a: string };
export type SeoPageData = {
  slug: string; kind: 'grade' | 'goal'; short: string; title: string; description: string; h1: string; intro: string;
  who: string[]; lesson: string[]; faq: Faq[]; plan?: 0 | 1 | 2; // index into pricing.plans, for grade pages
};

export const pages: SeoPageData[] = [
  {
    slug: 'grades-1-2', kind: 'grade', short: 'Grades 1–2', plan: 0,
    title: 'Online Math Tutor for Grades 1-2 | Quanttoria',
    description: '1-on-1 online math tutoring for 1st and 2nd graders: number sense, addition, subtraction and place value taught with pictures and play. First class free.',
    h1: 'Online math tutoring for Grades 1–2',
    intro: 'The first two years set how a child feels about math for a long time. We build number sense with pictures, objects and games, so counting, adding and subtracting make sense before they are memorized.',
    who: ['Children who count on fingers and want to move beyond it', 'Kids who find worksheets boring or stressful', 'Families who want a strong start before 3rd grade'],
    lesson: ['A short warm-up game with numbers', 'New idea shown with drawings and manipulatives on a shared whiteboard', 'Guided practice where your child explains their thinking', 'A quick recap sent to you as a parent'],
    faq: [
      { q: 'Is a one-hour class too long for a 6- or 7-year-old?', a: 'Classes mix short activities and movement breaks, and the teacher paces each class to your child’s attention.' },
      { q: 'Do we need any materials?', a: 'Only a laptop or tablet, paper and a pencil. Everything else is on the shared whiteboard.' },
    ],
  },
  {
    slug: 'grades-3-5', kind: 'grade', short: 'Grades 3–5', plan: 0,
    title: 'Online Math Tutor for Grades 3-5 | Quanttoria',
    description: '1-on-1 online math tutoring for 3rd to 5th graders: multiplication, division, fractions and word problems, aligned with Common Core. First class free.',
    h1: 'Online math tutoring for Grades 3–5',
    intro: 'This is where fractions, multiplication and word problems arrive, and where many children first decide they are “bad at math”. We make fractions and logic visual so they stick.',
    who: ['4th and 5th graders struggling with fractions or long division', 'Children who know the facts but freeze on word problems', 'Kids ready for more challenge than the classroom gives'],
    lesson: ['Review of last week’s homework, mistakes treated as clues', 'A visual model of the new idea, such as fraction bars or area diagrams', 'Word problems built step by step until your child can do them alone', 'A short note to you on what to practice'],
    faq: [
      { q: 'Do you follow what my child’s school is teaching?', a: 'Yes. We follow Common Core and your state’s standards and can work alongside the current unit or fill earlier gaps.' },
      { q: 'Can you help with 4th grade fractions?', a: 'Fractions are one of the most common reasons families come to us. We use bars, number lines and real-world sharing before any rules.' },
    ],
  },
  {
    slug: 'grades-6-8', kind: 'grade', short: 'Grades 6–8', plan: 1,
    title: 'Online Math Tutor for Middle School (Grades 6-8) | Quanttoria',
    description: '1-on-1 online math tutoring for middle schoolers: ratios, pre-algebra and equations explained visually so algebra feels manageable. First class free.',
    h1: 'Online math tutoring for Grades 6–8',
    intro: 'Middle school math moves fast: ratios, negative numbers, equations and the first real algebra. A child who missed one idea in 5th grade can feel lost by 7th. We find the gap and close it.',
    who: ['Students whose math grades dropped after elementary school', 'Kids who need pre-algebra confidence before 8th or 9th grade', 'Learners aiming for advanced math or competitions'],
    lesson: ['Quick diagnostic questions to see what is solid', 'The “why” of the new topic shown on graphs and diagrams', 'Practice problems that rise in difficulty', 'Test-prep and homework help when a deadline is near'],
    faq: [
      { q: 'My child is behind on earlier topics. Can you go back?', a: 'Yes. Most middle schoolers need a mix of catching up and keeping up with the class, and the plan covers both.' },
      { q: 'Do you teach Algebra 1 in 8th grade?', a: 'Yes, for students who take it early, along with pre-algebra for everyone else.' },
    ],
  },
  {
    slug: 'grades-9-10', kind: 'grade', short: 'Grades 9–10', plan: 2,
    title: 'Online Math Tutor for High School (Grades 9-10) | Quanttoria',
    description: '1-on-1 online math tutoring for 9th and 10th graders: Algebra 1, Geometry and Algebra 2 with clear explanations, plus a path to AP Calculus.',
    h1: 'Online math tutoring for Grades 9–10',
    intro: 'Algebra and geometry in high school decide which math paths stay open. We teach proofs, functions and equations so students understand them, not just pass the next test.',
    who: ['Students in Algebra 1, Geometry or Algebra 2 who want a stronger grade', 'Teens planning AP Calculus or AP Statistics in 11th or 12th grade', 'Students preparing for math contests'],
    lesson: ['Review of the current school unit', 'Worked examples where the student leads and the teacher guides', 'Exam-style questions with feedback on reasoning, not just answers', 'A study plan for the next two weeks'],
    faq: [
      { q: 'Do you teach AP Calculus?', a: 'Grades 9 and 10 build the foundation for it. We map the path from Algebra 2 and Precalculus toward AP Calculus and AP Statistics.' },
      { q: 'Can you help right before a test?', a: 'Yes. Tell us the date on the booking form and we plan the classes around it.' },
    ],
  },
  {
    slug: 'closing-gaps', kind: 'goal', short: 'Closing gaps',
    title: 'Math Tutor to Close Learning Gaps | Quanttoria',
    description: 'Is your child behind in math? Our 1-on-1 online tutor finds the missing skills, fills them in order and gets your child back on track.',
    h1: 'Closing gaps in your child’s math',
    intro: 'Math builds on itself, so one missing idea quietly breaks the next five. We find the exact point where understanding stopped and rebuild from there, at your child’s pace.',
    who: ['Children who say “I don’t get it” in class', 'Kids who changed schools or missed weeks of learning', 'Students whose grades fall even though they study'],
    lesson: ['A friendly diagnostic in the free class, no scores shared with the school', 'A short list of the gaps, in the order to fix them', 'Lessons that rebuild each idea with pictures first', 'Regular check-ins so you can see progress'],
    faq: [
      { q: 'How do you know where the gaps are?', a: 'In the free class the teacher asks questions that reveal how your child thinks, then explains what she found.' },
      { q: 'How long does it take to catch up?', a: 'It depends on the gap. Many families see more confidence within the first month, and we give you an honest estimate after the free class.' },
    ],
  },
  {
    slug: 'confidence-and-math-anxiety', kind: 'goal', short: 'Math anxiety',
    title: 'Math Anxiety Tutor for Kids Online | Quanttoria',
    description: 'A patient 1-on-1 online tutor for children who fear math. We turn mistakes into clues and rebuild confidence one small win at a time.',
    h1: 'Help for kids who are anxious about math',
    intro: 'Math anxiety is real and common: tears over homework, stomachaches before tests, “I’m just not a math person”. It comes from fear of being wrong, not from lack of ability. Our classes make being wrong safe.',
    who: ['Children who cry or avoid math homework', 'Kids who freeze on timed tests', 'Parents who feel anxious about math themselves and don’t know how to help'],
    lesson: ['Easy wins first, so the class starts with success', 'Mistakes treated like detective clues, never failures', 'Challenge raised slowly and only when your child is ready', 'Praise for effort and smart questions, not only right answers'],
    faq: [
      { q: 'Have you taught children with autism or other learning differences?', a: 'Yes. Parents of autistic students have written about Princy’s patience in their reviews. Tell us about your child before the first class.' },
      { q: 'Should I sit in on the class?', a: 'You are welcome to for the free class. Many parents step back once their child is comfortable.' },
    ],
  },
  {
    slug: 'math-olympiad-coaching', kind: 'goal', short: 'Olympiad coaching',
    title: 'Math Olympiad Coaching for Kids Online | Quanttoria',
    description: '1-on-1 online coaching for kids preparing for math competitions such as MATHCOUNTS and AMC 8: problem-solving strategies, not memorized tricks.',
    h1: 'Math Olympiad and competition coaching',
    intro: 'Competition math rewards creative thinking over speed of recall. We teach strategies for unfamiliar problems: drawing, working backwards, patterns and clean logical writing.',
    who: ['Strong students who want more than school math', 'Kids preparing for contests like MATHCOUNTS or AMC 8', 'Children who enjoy puzzles and want to learn how to think about them'],
    lesson: ['A new problem-solving strategy each class', 'Past-style contest problems solved together', 'Timed practice once the ideas are secure', 'Review of every mistake to build stamina and calm'],
    faq: [
      { q: 'Which competitions do you prepare for?', a: 'Common US ones for these grades, such as MATHCOUNTS and AMC 8, plus school and regional contests. Tell us which one when you book.' },
      { q: 'Is it only for top students?', a: 'No. Curious students who like challenge do well. We start where your child is.' },
    ],
  },
  {
    slug: 'common-core-math-help', kind: 'goal', short: 'Common Core help',
    title: 'Common Core Math Help for Parents and Kids | Quanttoria',
    description: 'Confused by your child’s Common Core math homework? A 1-on-1 online tutor explains the methods so your child and you understand them.',
    h1: 'Common Core math help',
    intro: 'Number bonds, area models and “friendly numbers” can look strange to parents who learned another way. The ideas are sound once explained. We teach your child the school method and the reasoning behind it, so homework stops being a fight.',
    who: ['Parents who can’t follow their child’s homework', 'Children who get answers by the old method but lose marks for “showing the strategy”', 'Families who want school and tutoring to agree'],
    lesson: ['Your child’s actual homework as the starting point', 'The school’s method explained step by step with pictures', 'A comparison with the shortcut, so both make sense', 'A one-page note for you on how to help at home'],
    faq: [
      { q: 'Do you follow my child’s school?', a: 'We follow Common Core and state standards and can work from your child’s homework and textbook.' },
      { q: 'Will you teach my child tricks that conflict with school?', a: 'No. We teach the school method first and add shortcuts only after the reasoning is understood.' },
    ],
  },
];

export const bySlug = (slug: string) => pages.find((p) => p.slug === slug);
