import type { Actor } from './auth.ts';
import { requireAdmin } from './admin.ts';
import type { Ctx } from './events.ts';
import { enqueueAssignmentMail } from './outbox.ts';

export interface Person { email: string; name?: string | null }
interface Row {
  id: string; student_id: string; student_email: string; student_name: string | null; teacher_id: string; teacher_email: string; teacher_name: string | null;
  assigned_by: string | null; note: string | null; assigned_at: Date | string; ended_at: Date | string | null; ended_by: string | null; ended_note: string | null;
}
const iso = (d: Date | string | null) => (d ? new Date(d).toISOString() : null);
const view = (r: Row) => ({
  id: r.id, studentId: r.student_id, teacher: { id: r.teacher_id, name: r.teacher_name, email: r.teacher_email },
  assignedAt: iso(r.assigned_at), assignedBy: r.assigned_by, note: r.note, endedAt: iso(r.ended_at), endedBy: r.ended_by, endedNote: r.ended_note,
});

/**
 * Assigns a student to a teacher (or, with teacherId null, removes the assignment). The old assignment is closed, not
 * overwritten, so the history stays. Doing it again with the same teacher changes nothing and sends nothing.
 */
export async function assignTeacher(ctx: Ctx, actor: Actor, studentId: string, input: { teacherId: string | null; note?: string; student: Person; teacher?: Person }) {
  requireAdmin(actor);
  const by = actor.kind === 'user' ? actor.id : null;
  return ctx.db.tx(async (q) => {
    await q.query('select pg_advisory_xact_lock(hashtext($1))', [`assign:${studentId}`]);
    const current = (await q.query<Row>('select * from calendar.student_teacher where student_id = $1 and ended_at is null', [studentId]))[0];
    if ((current?.teacher_id ?? null) === input.teacherId) return { changed: false, current: current ? view(current) : null };

    if (current) await q.query('update calendar.student_teacher set ended_at = now(), ended_by = $2, ended_note = $3 where id = $1', [current.id, by, input.note ?? null]);
    let next: Row | undefined;
    if (input.teacherId) {
      next = (await q.query<Row>(
        `insert into calendar.student_teacher (student_id, student_email, student_name, teacher_id, teacher_email, teacher_name, assigned_by, note)
         values ($1,$2,$3,$4,$5,$6,$7,$8) returning *`,
        [studentId, input.student.email, input.student.name ?? null, input.teacherId, input.teacher!.email, input.teacher!.name ?? null, by, input.note ?? null],
      ))[0];
    }

    const student = { email: input.student.email, name: input.student.name ?? null };
    const teacher = next ? { email: next.teacher_email, name: next.teacher_name } : null;
    const previous = current ? { email: current.teacher_email, name: current.teacher_name } : null;
    const note = input.note ?? null;
    await enqueueAssignmentMail(q, [
      { audience: 'student', recipient: student, student, teacher, previousTeacher: previous, note },
      ...(teacher ? [{ audience: 'new_teacher' as const, recipient: teacher, student, teacher, previousTeacher: previous, note }] : []),
      ...(previous ? [{ audience: 'old_teacher' as const, recipient: previous, student, teacher, previousTeacher: previous, note }] : []),
    ]);
    return { changed: true, current: next ? view(next) : null };
  });
}

/** Every assignment a student has had, newest first. */
export async function assignmentHistory(ctx: Ctx, actor: Actor, studentId: string) {
  requireAdmin(actor);
  const rows = await ctx.db.query<Row>('select * from calendar.student_teacher where student_id = $1 order by assigned_at desc, id', [studentId]);
  return { assignments: rows.map(view) };
}
