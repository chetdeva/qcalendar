// Types shared by the pages and the server routes. The shapes mirror calendar-service's API.
export type EventCategory = 'tutoring' | 'office_hours' | 'personal';
export type ParticipantStatus = 'invited' | 'accepted' | 'declined';
export type Role = 'student' | 'teacher' | 'admin';

export interface Participant {
  id: string; userId: string | null; email: string; name: string | null; status: ParticipantStatus; respondedAt: string | null;
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
  createdAt: string; updatedAt: string;
}

export interface Student { email: string; name?: string; userId?: string }

export interface CalendarSettings {
  teacherId: string; timezone: string;
  workingHours: Record<'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat', [string, string][]>;
  bufferMinutes: number; slotStepMinutes: number;
}

export interface Me { id: string; email: string; full_name: string | null; role: Role; status: 'active' | 'disabled' }

export interface Person { id: string; name: string | null; email: string }
