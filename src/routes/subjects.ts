import express from "express";
import {and, desc, eq, getTableColumns, ilike, or, sql} from "drizzle-orm";
import {departments, subjects} from "../db/schema/app";
import { db } from "../db";

const router = express.Router();

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

export default router;