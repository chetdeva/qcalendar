// Types shared by the pages and the server routes. The shapes mirror calendar-service's API.
export type EventCategory = 'tutoring' | 'office_hours' | 'personal' | 'trial';
export type ParticipantStatus = 'invited' | 'accepted' | 'declined';
export type Role = 'student' | 'teacher' | 'admin';

export interface Participant {
  id: string; userId: string | null; email: string; name: string | null; status: ParticipantStatus; respondedAt: string | null;
  /** The student's note when they declined. */
  note: string | null;
}

/** A student's request to move a one-to-one class. The teacher sees every request; a student only their own. */
export interface ChangeRequest {
  id: string; start: string; end: string; note: string | null; status: 'pending' | 'approved' | 'rejected' | 'withdrawn'; createdAt: string;
}

export interface CalendarEvent {
  id: string; ownerId: string; ownerName: string | null; ownerEmail: string | null;
  title: string; description: string | null; location: string | null; meetingUrl: string | null;
  start: string; end: string; timezone: string; category: EventCategory; status: 'confirmed' | 'cancelled';
  externalRef: string | null;
  /** Everyone, for the teacher who owns the class and for admins; only yourself, for a student. */
  participants: Participant[];
  participantCount: number;
  /** Present when you are looking at the class as an invited student. */
  myStatus?: ParticipantStatus | null;
  /** The latest time-change request, when the list or the class was loaded with it. */
  changeRequest?: ChangeRequest | null;
  createdAt: string; updatedAt: string;
}

/** timezone: the student's own IANA zone, when they have set one (teachers and admins only see it to schedule). */
export interface Student { email: string; name?: string; userId?: string; timezone?: string | null }

export interface CalendarSettings {
  teacherId: string; timezone: string;
  workingHours: Record<'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat', [string, string][]>;
  bufferMinutes: number; slotStepMinutes: number;
}

export interface Me { id: string; email: string; full_name: string | null; role: Role; status: 'active' | 'disabled'; avatar_updated_at?: string | null }

export interface Person { id: string; name: string | null; email: string; timezone?: string | null }
