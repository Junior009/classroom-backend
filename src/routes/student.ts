import express from "express";
import { and, desc, eq, getTableColumns, ilike, or, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { classes, departments, enrollments, subjects } from "../db/schema/app.js";
import { user } from "../db/schema/auth.js";

const router = express.Router();

const requireStudent: express.RequestHandler = (req, res, next) => {
  if (!req.user) {
    res.status(401).json({ message: "Authentication required" });
    return;
  }

  if (req.user.role !== "student") {
    res.status(403).json({ message: "Student access required" });
    return;
  }

  next();
};

router.use(requireStudent);

router.get("/classes", async (req, res) => {
  const studentId = req.user?.id;
  if (!studentId) return res.status(401).json({ message: "Authentication required" });

  try {
    const currentPage = Math.max(1, Number.parseInt(String(req.query.page ?? 1), 10) || 1);
    const pageSize = Math.min(Math.max(1, Number.parseInt(String(req.query.limit ?? 10), 10) || 10), 100);
    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
    const enrollmentJoin = and(
      eq(enrollments.classId, classes.id),
      eq(enrollments.studentId, studentId),
    );
    const whereClause = and(
      or(eq(classes.status, "active"), sql`${enrollments.id} is not null`),
      search
        ? or(
            ilike(classes.name, `%${search}%`),
            ilike(subjects.name, `%${search}%`),
            ilike(user.name, `%${search}%`),
          )
        : undefined,
    );

    const [countResult, classesList] = await Promise.all([
      db
        .select({ count: sql<number>`count(distinct ${classes.id})::int` })
        .from(classes)
        .leftJoin(enrollments, enrollmentJoin)
        .leftJoin(subjects, eq(classes.subjectId, subjects.id))
        .leftJoin(user, eq(classes.teacherId, user.id))
        .where(whereClause),
      db
        .select({
          ...getTableColumns(classes),
          subject: { ...getTableColumns(subjects) },
          teacher: { id: user.id, name: user.name, email: user.email, image: user.image },
          department: { ...getTableColumns(departments) },
          isEnrolled: sql<boolean>`${enrollments.id} is not null`,
        })
        .from(classes)
        .leftJoin(enrollments, enrollmentJoin)
        .leftJoin(subjects, eq(classes.subjectId, subjects.id))
        .leftJoin(user, eq(classes.teacherId, user.id))
        .leftJoin(departments, eq(subjects.departmentId, departments.id))
        .where(whereClause)
        .orderBy(desc(enrollments.createdAt), desc(classes.createdAt))
        .limit(pageSize)
        .offset((currentPage - 1) * pageSize),
    ]);

    const total = countResult[0]?.count ?? 0;
    return res.status(200).json({
      data: classesList,
      pagination: {
        page: currentPage,
        limit: pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  } catch (error) {
    console.error("GET /student/classes: failed to fetch classes", error);
    return res.status(500).json({ message: "Could not fetch classes" });
  }
});

router.get("/classes/:id", async (req, res) => {
  const studentId = req.user?.id;
  const classId = Number(req.params.id);
  if (!studentId) return res.status(401).json({ message: "Authentication required" });
  if (!Number.isInteger(classId) || classId < 1) {
    return res.status(400).json({ message: "Invalid class ID" });
  }

  try {
    const [classDetails] = await db
      .select({
        ...getTableColumns(classes),
        subject: { ...getTableColumns(subjects) },
        teacher: { id: user.id, name: user.name, email: user.email, image: user.image },
        department: { ...getTableColumns(departments) },
        isEnrolled: sql<boolean>`${enrollments.id} is not null`,
      })
      .from(classes)
      .leftJoin(
        enrollments,
        and(eq(enrollments.classId, classes.id), eq(enrollments.studentId, studentId)),
      )
      .leftJoin(subjects, eq(classes.subjectId, subjects.id))
      .leftJoin(user, eq(classes.teacherId, user.id))
      .leftJoin(departments, eq(subjects.departmentId, departments.id))
      .where(and(
        eq(classes.id, classId),
        or(eq(classes.status, "active"), sql`${enrollments.id} is not null`),
      ))
      .limit(1);

    if (!classDetails) return res.status(404).json({ message: "Class not found" });
    return res.status(200).json({ data: classDetails });
  } catch (error) {
    console.error(`GET /student/classes/${classId}: failed to fetch class`, error);
    return res.status(500).json({ message: "Could not fetch class" });
  }
});

export default router;
