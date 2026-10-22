import express from "express";
import { asc, eq, sql } from "drizzle-orm";
import { departments } from "../db/schema/index.js";
import { db } from "../db/index.js";

const router = express.Router();

router.get("/", async (req, res) => {
    try {
        const { page = 1, limit = 100 } = req.query;
        const currentPage = Math.max(1, parseInt(String(page), 10) || 1);
        const limitPerPage = Math.min(Math.max(1, parseInt(String(limit), 10) || 100), 100);
        const offset = (currentPage - 1) * limitPerPage;

        const countResult = await db
            .select({ count: sql<number>`count(*)` })
            .from(departments)
            .execute();

        const totalCount = countResult[0]?.count ?? 0;
        const departmentsList = await db
            .select()
            .from(departments)
            .orderBy(asc(departments.name))
            .limit(limitPerPage)
            .offset(offset);

        res.status(200).json({
            data: departmentsList,
            pagination: {
                total: totalCount,
                page: currentPage,
                limit: limitPerPage,
                totalPages: Math.ceil(totalCount / limitPerPage),
            }
        });
    } catch (error) {
        console.error("GET /departments/Error fetching departments:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

router.get('/:id', async (req, res) => {
    const departmentId = Number(req.params.id);
    if (!Number.isInteger(departmentId) || departmentId < 1) {
        return res.status(400).json({ error: 'Invalid department ID.' });
    }

    try {
        const [department] = await db
            .select()
            .from(departments)
            .where(eq(departments.id, departmentId));

        if (!department) return res.status(404).json({ error: 'Department not found.' });
        return res.status(200).json({ data: department });
    } catch (error) {
        console.error(`GET /departments/${departmentId} error:`, error);
        return res.status(500).json({ error: 'Failed to get department.' });
    }
});

/*router.get('/:id', async (req, res) => {
    const classId = Number(req.params.id);

    if(!Number.isFinite(classId)) return res.status(400).json({ error: 'No Class found.' });

    const [classDetails] = await db
        .select({
            ...getTableColumns(classes),
            subject: {
                ...getTableColumns(subjects),
            },
            department: {
                ...getTableColumns(departments),
            },
            teacher: {
                ...getTableColumns(user),
            }
        })
        .from(classes)
        .leftJoin(subjects, eq(classes.subjectId, subjects.id))
        .leftJoin(user, eq(classes.teacherId, user.id))
        .leftJoin(departments, eq(subjects.departmentId, departments.id))
        .where(eq(classes.id, classId))

    if(!classDetails) return res.status(404).json({ error: 'No Class found.' });

    res.status(200).json({ data: classDetails });
}) */

router.post('/', async (req, res) => {
    try {
        const [createdDepartment] = await db
            .insert(departments)
            .values({...req.body})
            .returning({ id: departments.id });

        if(!createdDepartment) throw Error;

        res.status(201).json({ data: createdDepartment });
    } catch (e) {
        console.error(`POST / Department error ${e}`);
        res.status(500).json({ error: e})
    }
})

const updateDepartment = async (req: express.Request, res: express.Response) => {
    const departmentId = Number(req.params.id);
    if (!Number.isInteger(departmentId) || departmentId < 1) {
        return res.status(400).json({ error: 'Invalid department ID.' });
    }

    const body = req.body as Record<string, unknown>;
    const updates: Record<string, unknown> = {};
    for (const field of ['name', 'code', 'description']) {
        if (Object.prototype.hasOwnProperty.call(body, field)) updates[field] = body[field];
    }

    if (Object.keys(updates).length === 0) {
        return res.status(400).json({ error: 'No editable fields provided.' });
    }

    try {
        const [updatedDepartment] = await db
            .update(departments)
            .set(updates)
            .where(eq(departments.id, departmentId))
            .returning();

        if (!updatedDepartment) return res.status(404).json({ error: 'Department not found.' });
        return res.status(200).json({ data: updatedDepartment });
    } catch (error) {
        const code = (error as { cause?: { code?: string }; code?: string })?.cause?.code
            ?? (error as { code?: string })?.code;
        console.error(`PUT /departments/${departmentId} error:`, error);
        if (code === '23505') return res.status(409).json({ error: 'A department with this code already exists.' });
        return res.status(500).json({ error: 'Failed to update department.' });
    }
};

router.put('/:id', updateDepartment);
router.patch('/:id', updateDepartment);

router.delete('/:id', async (req, res) => {
    const departmentId = Number(req.params.id);
    if (!Number.isInteger(departmentId) || departmentId < 1) {
        return res.status(400).json({ error: 'Invalid department ID.' });
    }

    try {
        const [deletedDepartment] = await db
            .delete(departments)
            .where(eq(departments.id, departmentId))
            .returning({ id: departments.id });

        if (!deletedDepartment) return res.status(404).json({ error: 'Department not found.' });
        return res.status(200).json({ data: deletedDepartment });
    } catch (error) {
        const code = (error as { cause?: { code?: string }; code?: string })?.cause?.code
            ?? (error as { code?: string })?.code;
        console.error(`DELETE /departments/${departmentId} error:`, error);
        if (code === '23503') return res.status(409).json({ error: 'This department contains subjects and cannot be deleted.' });
        return res.status(500).json({ error: 'Failed to delete department.' });
    }
});

export default router;