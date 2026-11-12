import express from "express";
import { and, asc, desc, eq, getTableColumns, inArray, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { attendanceRecords, classes, enrollments, grades, subjects } from "../db/schema/app.js";
import { user } from "../db/schema/auth.js";
import { requireRole } from "../middleware/authorize.js";

const router = express.Router();
const attendanceStatuses = ["present", "absent", "late", "excused"] as const;
type AttendanceStatus = (typeof attendanceStatuses)[number];

const isValidDate = (value: unknown): value is string =>
  typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));

const getOwnedClass = async (classId: number, teacherId: string) => {
  const [classRecord] = await db
    .select({ id: classes.id, capacity: classes.capacity })
    .from(classes)
    .where(and(eq(classes.id, classId), eq(classes.teacherId, teacherId)))
    .limit(1);
  return classRecord;
};

const parseClassId = (value: string) => {
  const classId = Number(value);
  return Number.isInteger(classId) && classId > 0 ? classId : null;
};

router.use(requireRole("teacher"));

router.get("/dashboard", async (req, res) => {
  const teacherId = req.user?.id;
  if (!teacherId) return res.status(401).json({ message: "Authentication required" });

  try {
    const teacherClasses = await db
      .select({ id: classes.id, name: classes.name, status: classes.status, createdAt: classes.createdAt })
      .from(classes)
      .where(eq(classes.teacherId, teacherId))
      .orderBy(desc(classes.createdAt));

    const classIds = teacherClasses.map(({ id }) => id);
    if (classIds.length === 0) {
      return res.status(200).json({
        data: { classCount: 0, studentCount: 0, attendanceRate: 0, averageGrade: 0, classes: [] },
      });
    }

    const [studentsResult, attendanceResult, gradesResult, enrollmentsByClass] = await Promise.all([
      db
        .select({ count: sql<number>`count(distinct ${enrollments.studentId})::int` })
        .from(enrollments)
        .where(inArray(enrollments.classId, classIds)),
      db
        .select({
          rate: sql<number>`coalesce(round(avg(case when ${attendanceRecords.status} in ('present', 'late') then 100.0 else 0 end)::numeric, 1), 0)::float`,
        })
        .from(attendanceRecords)
        .where(inArray(attendanceRecords.classId, classIds)),
      db
        .select({
          average: sql<number>`coalesce(round(avg(100.0 * ${grades.score} / nullif(${grades.maxScore}, 0))::numeric, 1), 0)::float`,
          count: sql<number>`count(*)::int`,
        })
        .from(grades)
        .where(inArray(grades.classId, classIds)),
      db
        .select({ classId: enrollments.classId, count: sql<number>`count(*)::int` })
        .from(enrollments)
        .where(inArray(enrollments.classId, classIds))
        .groupBy(enrollments.classId),
    ]);

    const countByClass = new Map(enrollmentsByClass.map(({ classId, count }) => [classId, count]));
    return res.status(200).json({
      data: {
        classCount: teacherClasses.length,
        studentCount: studentsResult[0]?.count ?? 0,
        attendanceRate: attendanceResult[0]?.rate ?? 0,
        averageGrade: gradesResult[0]?.average ?? 0,
        gradeCount: gradesResult[0]?.count ?? 0,
        classes: teacherClasses.map((classRecord) => ({
          ...classRecord,
          studentCount: countByClass.get(classRecord.id) ?? 0,
        })),
      },
    });
  } catch (error) {
    console.error("GET /teacher/dashboard: failed to load dashboard", error);
    return res.status(500).json({ message: "Could not load teacher dashboard" });
  }
});

router.get("/classes", async (req, res) => {
  const teacherId = req.user?.id;
  if (!teacherId) return res.status(401).json({ message: "Authentication required" });

  try {
    const page = Math.max(1, Number.parseInt(String(req.query.page ?? 1), 10) || 1);
    const limit = Math.min(Math.max(1, Number.parseInt(String(req.query.limit ?? 100), 10) || 100), 100);
    const [countResult, classesList] = await Promise.all([
      db.select({ count: sql<number>`count(*)::int` }).from(classes).where(eq(classes.teacherId, teacherId)),
      db
        .select({ ...getTableColumns(classes), subject: { ...getTableColumns(subjects) } })
        .from(classes)
        .leftJoin(subjects, eq(classes.subjectId, subjects.id))
        .where(eq(classes.teacherId, teacherId))
        .orderBy(asc(classes.name))
        .limit(limit)
        .offset((page - 1) * limit),
    ]);
    const total = countResult[0]?.count ?? 0;
    return res.status(200).json({
      data: classesList,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error("GET /teacher/classes: failed to load classes", error);
    return res.status(500).json({ message: "Could not load teacher classes" });
  }
});

router.get("/classes/:classId/students", async (req, res) => {
  const teacherId = req.user?.id;
  const classId = parseClassId(req.params.classId);
  if (!teacherId) return res.status(401).json({ message: "Authentication required" });
  if (!classId) return res.status(400).json({ message: "Invalid class ID" });

  try {
    if (!(await getOwnedClass(classId, teacherId))) {
      return res.status(404).json({ message: "Class not found" });
    }

    const students = await db
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
        isEnrolled: sql<boolean>`${enrollments.id} is not null`,
      })
      .from(user)
      .leftJoin(enrollments, and(eq(enrollments.studentId, user.id), eq(enrollments.classId, classId)))
      .where(eq(user.role, "student"))
      .orderBy(asc(user.name));

    return res.status(200).json({ data: students });
  } catch (error) {
    console.error(`GET /teacher/classes/${classId}/students failed`, error);
    return res.status(500).json({ message: "Could not load students" });
  }
});

router.post("/classes/:classId/students", async (req, res) => {
  const teacherId = req.user?.id;
  const classId = parseClassId(req.params.classId);
  const studentId = req.body?.studentId;
  if (!teacherId) return res.status(401).json({ message: "Authentication required" });
  if (!classId || typeof studentId !== "string") {
    return res.status(400).json({ message: "A valid class and student are required" });
  }

  try {
    const classRecord = await getOwnedClass(classId, teacherId);
    if (!classRecord) return res.status(404).json({ message: "Class not found" });

    const [student] = await db
      .select({ id: user.id })
      .from(user)
      .where(and(eq(user.id, studentId), eq(user.role, "student")))
      .limit(1);
    if (!student) return res.status(404).json({ message: "Student not found" });

    const [enrollmentCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(enrollments)
      .where(eq(enrollments.classId, classId));
    if ((enrollmentCount?.count ?? 0) >= classRecord.capacity) {
      return res.status(409).json({ message: "Class capacity has been reached" });
    }

    const [enrollment] = await db
      .insert(enrollments)
      .values({ classId, studentId })
      .onConflictDoNothing()
      .returning();
    if (!enrollment) return res.status(409).json({ message: "Student is already enrolled" });

    return res.status(201).json({ data: enrollment });
  } catch (error) {
    console.error(`POST /teacher/classes/${classId}/students failed`, error);
    return res.status(500).json({ message: "Could not enroll student" });
  }
});

router.delete("/classes/:classId/students/:studentId", async (req, res) => {
  const teacherId = req.user?.id;
  const classId = parseClassId(req.params.classId);
  const studentId = req.params.studentId;
  if (!teacherId) return res.status(401).json({ message: "Authentication required" });
  if (!classId) return res.status(400).json({ message: "Invalid class ID" });

  try {
    if (!(await getOwnedClass(classId, teacherId))) {
      return res.status(404).json({ message: "Class not found" });
    }
    const [deleted] = await db
      .delete(enrollments)
      .where(and(eq(enrollments.classId, classId), eq(enrollments.studentId, studentId)))
      .returning({ id: enrollments.id });
    if (!deleted) return res.status(404).json({ message: "Enrollment not found" });
    return res.status(200).json({ data: deleted });
  } catch (error) {
    console.error(`DELETE /teacher/classes/${classId}/students/${studentId} failed`, error);
    return res.status(500).json({ message: "Could not remove student" });
  }
});

router.get("/classes/:classId/attendance", async (req, res) => {
  const teacherId = req.user?.id;
  const classId = parseClassId(req.params.classId);
  const attendanceDate = req.query.date;
  if (!teacherId) return res.status(401).json({ message: "Authentication required" });
  if (!classId || !isValidDate(attendanceDate)) {
    return res.status(400).json({ message: "A valid class ID and date are required" });
  }

  try {
    if (!(await getOwnedClass(classId, teacherId))) {
      return res.status(404).json({ message: "Class not found" });
    }
    const roster = await db
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
        status: attendanceRecords.status,
        note: attendanceRecords.note,
      })
      .from(enrollments)
      .innerJoin(user, eq(enrollments.studentId, user.id))
      .leftJoin(attendanceRecords, and(
        eq(attendanceRecords.classId, classId),
        eq(attendanceRecords.studentId, user.id),
        eq(attendanceRecords.attendanceDate, attendanceDate),
      ))
      .where(eq(enrollments.classId, classId))
      .orderBy(asc(user.name));
    return res.status(200).json({ data: roster });
  } catch (error) {
    console.error(`GET /teacher/classes/${classId}/attendance failed`, error);
    return res.status(500).json({ message: "Could not load attendance" });
  }
});

router.put("/classes/:classId/attendance", async (req, res) => {
  const teacherId = req.user?.id;
  const classId = parseClassId(req.params.classId);
  const { date: attendanceDate, records } = req.body ?? {};
  if (!teacherId) return res.status(401).json({ message: "Authentication required" });
  if (!classId || !isValidDate(attendanceDate) || !Array.isArray(records)) {
    return res.status(400).json({ message: "A valid class, date and attendance list are required" });
  }

  const validRecords = records.every((record: unknown) => {
    if (!record || typeof record !== "object") return false;
    const entry = record as { studentId?: unknown; status?: unknown; note?: unknown };
    return typeof entry.studentId === "string"
      && attendanceStatuses.includes(entry.status as AttendanceStatus)
      && (entry.note === undefined || entry.note === null || (typeof entry.note === "string" && entry.note.length <= 1000));
  });
  if (!validRecords) return res.status(400).json({ message: "Attendance contains invalid entries" });

  try {
    if (!(await getOwnedClass(classId, teacherId))) {
      return res.status(404).json({ message: "Class not found" });
    }
    const roster = await db
      .select({ studentId: enrollments.studentId })
      .from(enrollments)
      .where(eq(enrollments.classId, classId));
    const enrolledIds = new Set(roster.map(({ studentId }) => studentId));
    if (records.some((record: { studentId: string }) => !enrolledIds.has(record.studentId))) {
      return res.status(400).json({ message: "Attendance can only be recorded for enrolled students" });
    }

    await db.transaction(async (transaction) => {
      for (const record of records as { studentId: string; status: AttendanceStatus; note?: string | null }[]) {
        await transaction
          .insert(attendanceRecords)
          .values({
            classId,
            studentId: record.studentId,
            attendanceDate,
            status: record.status,
            note: record.note ?? null,
            markedBy: teacherId,
          })
          .onConflictDoUpdate({
            target: [attendanceRecords.classId, attendanceRecords.studentId, attendanceRecords.attendanceDate],
            set: { status: record.status, note: record.note ?? null, markedBy: teacherId, updatedAt: new Date() },
          });
      }
    });
    return res.status(200).json({ data: { saved: records.length } });
  } catch (error) {
    console.error(`PUT /teacher/classes/${classId}/attendance failed`, error);
    return res.status(500).json({ message: "Could not save attendance" });
  }
});

router.get("/classes/:classId/grades", async (req, res) => {
  const teacherId = req.user?.id;
  const classId = parseClassId(req.params.classId);
  if (!teacherId) return res.status(401).json({ message: "Authentication required" });
  if (!classId) return res.status(400).json({ message: "Invalid class ID" });

  try {
    if (!(await getOwnedClass(classId, teacherId))) {
      return res.status(404).json({ message: "Class not found" });
    }
    const classGrades = await db
      .select({ ...getTableColumns(grades), student: { id: user.id, name: user.name, email: user.email } })
      .from(grades)
      .innerJoin(user, eq(grades.studentId, user.id))
      .where(eq(grades.classId, classId))
      .orderBy(desc(grades.assessmentDate), asc(user.name));
    return res.status(200).json({ data: classGrades });
  } catch (error) {
    console.error(`GET /teacher/classes/${classId}/grades failed`, error);
    return res.status(500).json({ message: "Could not load grades" });
  }
});

router.post("/classes/:classId/grades", async (req, res) => {
  const teacherId = req.user?.id;
  const classId = parseClassId(req.params.classId);
  const { studentId, assessmentName, score, maxScore, assessmentDate, feedback } = req.body ?? {};
  const numericScore = Number(score);
  const numericMaxScore = Number(maxScore);
  if (!teacherId) return res.status(401).json({ message: "Authentication required" });
  if (
    !classId
    || typeof studentId !== "string"
    || typeof assessmentName !== "string"
    || !assessmentName.trim()
    || assessmentName.trim().length > 255
    || !Number.isFinite(numericScore)
    || !Number.isFinite(numericMaxScore)
    || numericScore < 0
    || numericMaxScore <= 0
    || numericScore > numericMaxScore
    || !isValidDate(assessmentDate)
    || (feedback !== undefined && feedback !== null && (typeof feedback !== "string" || feedback.length > 2000))
  ) {
    return res.status(400).json({ message: "Provide a valid student, assessment, score, maximum score and date" });
  }

  try {
    if (!(await getOwnedClass(classId, teacherId))) {
      return res.status(404).json({ message: "Class not found" });
    }
    const [enrollment] = await db
      .select({ id: enrollments.id })
      .from(enrollments)
      .where(and(eq(enrollments.classId, classId), eq(enrollments.studentId, studentId)))
      .limit(1);
    if (!enrollment) return res.status(400).json({ message: "Student is not enrolled in this class" });

    const [grade] = await db
      .insert(grades)
      .values({
        classId,
        studentId,
        assessmentName: assessmentName.trim(),
        score: numericScore,
        maxScore: numericMaxScore,
        assessmentDate,
        feedback: feedback ?? null,
        gradedBy: teacherId,
      })
      .onConflictDoUpdate({
        target: [grades.classId, grades.studentId, grades.assessmentName],
        set: {
          score: numericScore,
          maxScore: numericMaxScore,
          assessmentDate,
          feedback: feedback ?? null,
          gradedBy: teacherId,
          updatedAt: new Date(),
        },
      })
      .returning();
    return res.status(201).json({ data: grade });
  } catch (error) {
    console.error(`POST /teacher/classes/${classId}/grades failed`, error);
    return res.status(500).json({ message: "Could not save grade" });
  }
});

export default router;
