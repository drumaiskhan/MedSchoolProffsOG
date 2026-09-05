import { and, eq, isNull, or } from "drizzle-orm";
import { db, usersTable, programsTable, academicYearsTable, modulesTable } from "@workspace/db";

export interface StudentTargeting {
  programKind: string | null;
  yearNumber: number | null;
}

/** Looks up a student's normalized program kind (e.g. "MBBS") and year
 * number (1-5) from their academic placement. Returns nulls if the student
 * hasn't been assigned a program/year yet — they'll only see globally
 * targeted content until an admin (or their own profile) sets these. */
export async function getStudentTargeting(userId: number): Promise<StudentTargeting> {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) return { programKind: null, yearNumber: null };

  const [program] = user.programId ? await db.select().from(programsTable).where(eq(programsTable.id, user.programId)) : [];
  const [academicYear] = user.academicYearId ? await db.select().from(academicYearsTable).where(eq(academicYearsTable.id, user.academicYearId)) : [];

  return {
    programKind: program?.kind ? program.kind.trim().toUpperCase() : null,
    yearNumber: academicYear?.yearNumber ?? null,
  };
}

/** Returns the IDs of every active module visible to a student with this
 * targeting. A module with a null programTargetKind/yearTargetNumber is
 * visible to everyone on that axis; a module targeting a specific
 * kind/year is only visible to matching students. */
export async function getVisibleModuleIds(targeting: StudentTargeting): Promise<number[]> {
  const rows = await db
    .select({ id: modulesTable.id })
    .from(modulesTable)
    .where(and(
      eq(modulesTable.active, true),
      or(isNull(modulesTable.programTargetKind), targeting.programKind ? eq(modulesTable.programTargetKind, targeting.programKind) : isNull(modulesTable.programTargetKind)),
      or(isNull(modulesTable.yearTargetNumber), targeting.yearNumber !== null ? eq(modulesTable.yearTargetNumber, targeting.yearNumber) : isNull(modulesTable.yearTargetNumber)),
    ));
  return rows.map((r) => r.id);
}

/** Human-readable summary of a module's targeting, for admin UI badges. */
export function describeModuleTargeting(programTargetKind: string | null, yearTargetNumber: number | null): string {
  const programLabel = programTargetKind || "All Programs";
  const yearLabel = yearTargetNumber ? `${yearTargetNumber}${["th", "st", "nd", "rd"][yearTargetNumber % 10 > 3 || Math.floor(yearTargetNumber % 100 / 10) === 1 ? 0 : yearTargetNumber % 10]} Year` : "All Years";
  return `${programLabel} + ${yearLabel}`;
}
