import express from "express";
import {and, desc, eq, getTableColumns, ilike, or, sql} from "drizzle-orm";
import {departments, subjects} from "../db/schema/index.js";
import { db } from "../db/index.js";

const router = express.Router();

router.post("/", async(req, res) => {
       try{
        const [createSubjects] = await db
            .insert(subjects)
            .values({...req.body})
            .returning({ id: subjects.id });

        if(!createSubjects) throw Error;

        res.status(201).json({ data: createSubjects });
    } catch (e) {
        console.error(`POST /subjects error ${e}`);
        res.status(500).json({ error: e})
    }
})

router.get("/", async (req, res) => {
    try {
        const {search, department, page = 1, limit = 10} = req.query;
        const currentPage = Math.max(1, parseInt(String(page), 10) || 1);
        const LimitPerPage = Math.min( Math.max(1, parseInt(String(limit), 10) || 10), 100); // Max 100 records per page

        const offset = (currentPage - 1) * LimitPerPage;

        const filterConditions = [];


        if (search) {
            filterConditions.push( or(
                ilike(subjects.name, `%${search}%`),
                ilike(subjects.description, `%${search}%`)
            )
         );
        }

        if (department) {
            const deptPattern = `%${String(department).replace(/[%_)]/g, '\\$&')}%`;
            filterConditions.push(ilike(departments.name, deptPattern));
        }

        const whereClause = filterConditions.length > 0 ? and(...filterConditions) : undefined;

        const countResult = await db
        .select({ count: sql<number>`count(*)` })
        .from(subjects)
        .leftJoin(departments, eq(subjects.departmentId, departments.id))
        .where(whereClause)
        .execute();

        const totalCount = countResult[0]?.count ?? 0;

        const subjectsList = await db
        .select({
            ... getTableColumns(subjects),
            department: {...getTableColumns(departments)},
        })
        .from(subjects)
        .leftJoin(departments, eq(subjects.departmentId, departments.id))
        .where(whereClause)
        .orderBy(desc(subjects.createdAt))
        .limit(LimitPerPage)
        .offset(offset);

        res.status(200).json({
            data: subjectsList,
            pagination: {
                total: totalCount,
                page: currentPage,
                limit: LimitPerPage,
                totalPages: Math.ceil(totalCount / LimitPerPage),
            }
        });

    } catch (error) {
        console.error("GET /subjects/Error fetching subjects:", error);
        res.status(500).json({error: "Internal Server Error"});
    }
});

router.get('/:id', async (req, res) => {
    const subjectId = Number(req.params.id);
    if (!Number.isInteger(subjectId) || subjectId < 1) {
        return res.status(400).json({ error: 'Invalid subject ID.' });
    }

    try {
        const [subject] = await db
            .select({
                ...getTableColumns(subjects),
                department: { ...getTableColumns(departments) },
            })
            .from(subjects)
            .leftJoin(departments, eq(subjects.departmentId, departments.id))
            .where(eq(subjects.id, subjectId));

        if (!subject) return res.status(404).json({ error: 'Subject not found.' });
        return res.status(200).json({ data: subject });
    } catch (error) {
        console.error(`GET /subjects/${subjectId} error:`, error);
        return res.status(500).json({ error: 'Failed to get subject.' });
    }
});

const updateSubject = async (req: express.Request, res: express.Response) => {
    const subjectId = Number(req.params.id);
    if (!Number.isInteger(subjectId) || subjectId < 1) {
        return res.status(400).json({ error: 'Invalid subject ID.' });
    }

    const body = req.body as Record<string, unknown>;
    const updates: Record<string, unknown> = {};
    for (const field of ['departmentId', 'name', 'code', 'description']) {
        if (Object.prototype.hasOwnProperty.call(body, field)) updates[field] = body[field];
    }

    if (Object.keys(updates).length === 0) {
        return res.status(400).json({ error: 'No editable fields provided.' });
    }

    try {
        const [updatedSubject] = await db
            .update(subjects)
            .set(updates)
            .where(eq(subjects.id, subjectId))
            .returning();

        if (!updatedSubject) return res.status(404).json({ error: 'Subject not found.' });
        return res.status(200).json({ data: updatedSubject });
    } catch (error) {
        const code = (error as { cause?: { code?: string }; code?: string })?.cause?.code
            ?? (error as { code?: string })?.code;
        console.error(`PUT /subjects/${subjectId} error:`, error);
        if (code === '23503') return res.status(409).json({ error: 'The selected department does not exist.' });
        if (code === '23505') return res.status(409).json({ error: 'A subject with this code already exists.' });
        return res.status(500).json({ error: 'Failed to update subject.' });
    }
};

router.put('/:id', updateSubject);
router.patch('/:id', updateSubject);

router.delete('/:id', async (req, res) => {
    const subjectId = Number(req.params.id);
    if (!Number.isInteger(subjectId) || subjectId < 1) {
        return res.status(400).json({ error: 'Invalid subject ID.' });
    }

    try {
        const [deletedSubject] = await db
            .delete(subjects)
            .where(eq(subjects.id, subjectId))
            .returning({ id: subjects.id });

        if (!deletedSubject) return res.status(404).json({ error: 'Subject not found.' });
        return res.status(200).json({ data: deletedSubject });
    } catch (error) {
        const code = (error as { cause?: { code?: string }; code?: string })?.cause?.code
            ?? (error as { code?: string })?.code;
        console.error(`DELETE /subjects/${subjectId} error:`, error);
        if (code === '23503') return res.status(409).json({ error: 'This subject is referenced by existing classes.' });
        return res.status(500).json({ error: 'Failed to delete subject.' });
    }
});

export default router;