import { sql } from "drizzle-orm";
import { subjects, chapters, concepts, questions, type Database } from "@neet/db";

type Q = {
  stem: string;
  options: { key: string; text: string }[];
  correct: string;
};
type ConceptSeed = { name: string; difficulty: number; questions: Q[] };
type ChapterSeed = { name: string; concepts: ConceptSeed[] };
type SubjectSeed = { code: string; name: string; chapters: ChapterSeed[] };

const BANK: SubjectSeed[] = [
  {
    code: "physics",
    name: "Physics",
    chapters: [
      {
        name: "Laws of Motion",
        concepts: [
          {
            name: "Newton's Laws",
            difficulty: 2,
            questions: [
              {
                stem: "A body of mass 2 kg accelerates at 3 m/s². The net force on it is:",
                options: [
                  { key: "a", text: "1.5 N" },
                  { key: "b", text: "5 N" },
                  { key: "c", text: "6 N" },
                  { key: "d", text: "9 N" },
                ],
                correct: "c",
              },
              {
                stem: "Newton's first law is essentially a definition of:",
                options: [
                  { key: "a", text: "Force" },
                  { key: "b", text: "Inertia" },
                  { key: "c", text: "Momentum" },
                  { key: "d", text: "Energy" },
                ],
                correct: "b",
              },
            ],
          },
          {
            name: "Friction",
            difficulty: 3,
            questions: [
              {
                stem: "Kinetic friction is generally ___ limiting static friction.",
                options: [
                  { key: "a", text: "greater than" },
                  { key: "b", text: "less than" },
                  { key: "c", text: "equal to" },
                  { key: "d", text: "independent of" },
                ],
                correct: "b",
              },
              {
                stem: "The coefficient of friction has the unit:",
                options: [
                  { key: "a", text: "newton" },
                  { key: "b", text: "kg" },
                  { key: "c", text: "it is dimensionless" },
                  { key: "d", text: "m/s" },
                ],
                correct: "c",
              },
            ],
          },
        ],
      },
    ],
  },
  {
    code: "chemistry",
    name: "Chemistry",
    chapters: [
      {
        name: "Some Basic Concepts of Chemistry",
        concepts: [
          {
            name: "Mole Concept",
            difficulty: 2,
            questions: [
              {
                stem: "The number of atoms in 1 mole of a substance is:",
                options: [
                  { key: "a", text: "6.022 × 10²³" },
                  { key: "b", text: "3.011 × 10²³" },
                  { key: "c", text: "1.2 × 10²⁴" },
                  { key: "d", text: "10²³" },
                ],
                correct: "a",
              },
              {
                stem: "The molar mass of water (H₂O) in g/mol is:",
                options: [
                  { key: "a", text: "16" },
                  { key: "b", text: "18" },
                  { key: "c", text: "20" },
                  { key: "d", text: "2" },
                ],
                correct: "b",
              },
            ],
          },
          {
            name: "Stoichiometry",
            difficulty: 3,
            questions: [
              {
                stem: "For 2H₂ + O₂ → 2H₂O, moles of O₂ needed for 4 mol H₂:",
                options: [
                  { key: "a", text: "1" },
                  { key: "b", text: "2" },
                  { key: "c", text: "4" },
                  { key: "d", text: "8" },
                ],
                correct: "b",
              },
              {
                stem: "The limiting reagent in a reaction is the one that:",
                options: [
                  { key: "a", text: "is present in excess" },
                  { key: "b", text: "is consumed first" },
                  { key: "c", text: "acts as catalyst" },
                  { key: "d", text: "is a spectator" },
                ],
                correct: "b",
              },
            ],
          },
        ],
      },
    ],
  },
  {
    code: "biology",
    name: "Biology",
    chapters: [
      {
        name: "Cell: The Unit of Life",
        concepts: [
          {
            name: "Cell Organelles",
            difficulty: 1,
            questions: [
              {
                stem: "The 'powerhouse of the cell' is the:",
                options: [
                  { key: "a", text: "Nucleus" },
                  { key: "b", text: "Ribosome" },
                  { key: "c", text: "Mitochondria" },
                  { key: "d", text: "Golgi apparatus" },
                ],
                correct: "c",
              },
              {
                stem: "Protein synthesis in the cell occurs at the:",
                options: [
                  { key: "a", text: "Ribosome" },
                  { key: "b", text: "Lysosome" },
                  { key: "c", text: "Vacuole" },
                  { key: "d", text: "Centriole" },
                ],
                correct: "a",
              },
            ],
          },
          {
            name: "Cell Division",
            difficulty: 2,
            questions: [
              {
                stem: "The number of daughter cells produced in mitosis is:",
                options: [
                  { key: "a", text: "1" },
                  { key: "b", text: "2" },
                  { key: "c", text: "4" },
                  { key: "d", text: "8" },
                ],
                correct: "b",
              },
              {
                stem: "Reduction division refers to:",
                options: [
                  { key: "a", text: "Mitosis" },
                  { key: "b", text: "Meiosis" },
                  { key: "c", text: "Binary fission" },
                  { key: "d", text: "Budding" },
                ],
                correct: "b",
              },
            ],
          },
        ],
      },
    ],
  },
];

/** Idempotent: seeds the catalog only if the question bank is empty. */
export async function seedIfEmpty(db: Database): Promise<number> {
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(questions);
  if (count > 0) return count;

  let inserted = 0;
  await db.transaction(async (tx) => {
    for (const s of BANK) {
      const [subj] = await tx
        .insert(subjects)
        .values({ code: s.code, name: s.name })
        .returning();
      for (const ch of s.chapters) {
        const [chap] = await tx
          .insert(chapters)
          .values({ subjectId: subj.id, name: ch.name })
          .returning();
        for (const c of ch.concepts) {
          const [con] = await tx
            .insert(concepts)
            .values({ chapterId: chap.id, name: c.name, difficulty: c.difficulty })
            .returning();
          for (const q of c.questions) {
            await tx.insert(questions).values({
              conceptId: con.id,
              subject: s.code,
              stem: q.stem,
              options: q.options,
              answerKey: { correct: q.correct },
              difficulty: c.difficulty,
            });
            inserted++;
          }
        }
      }
    }
  });
  return inserted;
}
