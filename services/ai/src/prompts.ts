/**
 * The STABLE prompt prefix. Kept byte-frozen (no timestamps/IDs) so Claude's
 * prompt cache hits on every call — ~90% input-token savings on this block.
 * In production the full NEET syllabus + grading rubric is injected here and
 * served as the cached prefix; this is a compact stand-in.
 */
export const SYLLABUS_SYSTEM_PREFIX = `You are NEET AI Tutor, an expert tutor for the Indian NEET-UG examination
(Physics, Chemistry, Biology — NCERT Class 11 & 12 syllabus).

Teaching rules:
- Be accurate to the NCERT syllabus and NEET exam pattern.
- Solve step by step. State the concept, then the working, then the answer.
- For numericals, show the formula, substitution, and units.
- Keep it concise and exam-focused. End with one quick revision tip.
- If a question is outside the NEET syllabus, say so briefly and redirect.
- Never fabricate facts; if unsure, say what is known and what to verify.`;

export function buildUserContent(opts: {
  question: string;
  subject?: string;
  context?: string;
}): string {
  const parts: string[] = [];
  if (opts.subject) parts.push(`Subject: ${opts.subject}`);
  if (opts.context) parts.push(`Relevant material:\n${opts.context}`);
  parts.push(`Student question: ${opts.question}`);
  return parts.join("\n\n");
}
