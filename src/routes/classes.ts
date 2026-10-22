import express from "express";
import {and, desc, eq, getTableColumns, ilike, or, sql} from "drizzle-orm";

import {db} from "../db/index.js";
import {classes, departments, subjects} from '../db/schema/app.js'
import { user } from '../db/schema/auth.js'

const router = express.Router();

// Get all classes with optional search, filtering and pagination
router.get("/", async (req, res) => {
    try {
        const { search, subject, teacher, page = 1, limit = 10 } = req.query;

        const currentPage = Math.max(1, parseInt(String(page), 10) || 1);
        const limitPerPage = Math.min(Math.max(1, parseInt(String(limit), 10) || 10), 100); // Max 100 records per page

        const offset = (currentPage - 1) * limitPerPage;

        const filterConditions = [];

        // If search query exists, filter by class name OR invite code
        if (search) {
            filterConditions.push(
                or(
                    ilike(classes.name, `%${search}%`),
                    ilike(classes.inviteCode, `%${search}%`)
                )
            );
        }

        // If subject filter exists, match subject name
        if (subject) {
            const subjectPattern = `%${String(subject).replace(/[%_]/g, '\\$&')}%`;
            filterConditions.push(ilike(subjects.name, subjectPattern));
        }

        // If teacher filter exists, match teacher name
        if (teacher) {
            const teacherPattern = `%${String(teacher).replace(/[%_]/g, '\\$&')}%`;
            filterConditions.push(ilike(user.name, teacherPattern));
        }

        // Combine all filters using AND if any exist
        const whereClause = filterConditions.length > 0 ? and(...filterConditions) : undefined;

        const countResult = await db
            .select({ count: sql<number>`count(*)`})
            .from(classes)
            .leftJoin(subjects, eq(classes.subjectId, subjects.id))
            .leftJoin(user, eq(classes.teacherId, user.id))
            .where(whereClause);

        const totalCount = countResult[0]?.count ?? 0;

        const classesList = await db
            .select({
                ...getTableColumns(classes),
                subject: { ...getTableColumns(subjects) },
                teacher: { ...getTableColumns(user) }
            })
            .from(classes)
            .leftJoin(subjects, eq(classes.subjectId, subjects.id))
            .leftJoin(user, eq(classes.teacherId, user.id))
            .where(whereClause)
            .orderBy(desc(classes.createdAt))
            .limit(limitPerPage)
            .offset(offset);

        res.status(200).json({
            data: classesList,
            pagination: {
                page: currentPage,
                limit: limitPerPage,
                total: totalCount,
                totalPages: Math.ceil(totalCount / limitPerPage),
            }
        })

    } catch (e) {
        console.error(`GET /classes error: ${e}`);
        res.status(500).json({ error: 'Failed to get classes' });
    }
})

// Get class details with teacher, subject, and department
router.get('/:id', async (req, res) => {
    const classId = Number(req.params.id);

    if(!Number.isInteger(classId) || classId < 1) return res.status(400).json({ error: 'Invalid class ID.' });

    try {
        const [classDetails] = await db
            .select({
                ...getTableColumns(classes),
                subject: { ...getTableColumns(subjects) },
                department: { ...getTableColumns(departments) },
                teacher: { ...getTableColumns(user) }
            })
            .from(classes)
            .leftJoin(subjects, eq(classes.subjectId, subjects.id))
            .leftJoin(user, eq(classes.teacherId, user.id))
            .leftJoin(departments, eq(subjects.departmentId, departments.id))
            .where(eq(classes.id, classId));

        if(!classDetails) return res.status(404).json({ error: 'Class not found.' });

        res.status(200).json({ data: classDetails });
    } catch (error) {
        console.error(`GET /classes/${classId} error:`, error);
        res.status(500).json({ error: 'Failed to get class' });
    }
})

router.post('/', async (req, res) => {
    try {
        const [createdClass] = await db
            .insert(classes)
            .values({...req.body, inviteCode: Math.random().toString(36).substring(2, 9), schedules: []})
            .returning({ id: classes.id });

        if(!createdClass) throw Error;

        res.status(201).json({ data: createdClass });
    } catch (e) {
        console.error(`POST /classes error ${e}`);
        res.status(500).json({ error: e})
    }
})

const updateClass = async (req: express.Request, res: express.Response) => {
    const classId = Number(req.params.id);
    if (!Number.isInteger(classId) || classId < 1) {
        return res.status(400).json({ error: 'Invalid class ID.' });
    }

    const body = req.body as Record<string, unknown>;
    const updates: Record<string, unknown> = {};
    const editableFields = [
        'subjectId', 'teacherId', 'name', 'bannerCldPubId', 'bannerUrl',
        'description', 'capacity', 'status', 'schedules'
    ];

    for (const field of editableFields) {
        if (Object.prototype.hasOwnProperty.call(body, field)) updates[field] = body[field];
    }

    if (Object.keys(updates).length === 0) {
        return res.status(400).json({ error: 'No editable fields provided.' });
    }

    try {
        const [updatedClass] = await db
            .update(classes)
            .set(updates)
            .where(eq(classes.id, classId))
            .returning();

        if (!updatedClass) return res.status(404).json({ error: 'Class not found.' });
        return res.status(200).json({ data: updatedClass });
    } catch (error) {
        const code = (error as { cause?: { code?: string }; code?: string })?.cause?.code
            ?? (error as { code?: string })?.code;
        console.error(`PUT /classes/${classId} error:`, error);
        if (code === '23503') return res.status(409).json({ error: 'A referenced subject or teacher does not exist.' });
        if (code === '23505') return res.status(409).json({ error: 'The class invite code is already in use.' });
        return res.status(500).json({ error: 'Failed to update class.' });
    }
};

router.put('/:id', updateClass);
router.patch('/:id', updateClass);

router.delete('/:id', async (req, res) => {
    const classId = Number(req.params.id);
    if (!Number.isInteger(classId) || classId < 1) {
        return res.status(400).json({ error: 'Invalid class ID.' });
    }

    try {
        const [deletedClass] = await db
            .delete(classes)
            .where(eq(classes.id, classId))
            .returning({ id: classes.id });

        if (!deletedClass) return res.status(404).json({ error: 'Class not found.' });
        return res.status(200).json({ data: deletedClass });
    } catch (error) {
        console.error(`DELETE /classes/${classId} error:`, error);
        return res.status(500).json({ error: 'Failed to delete class.' });
    }
});

export default router;