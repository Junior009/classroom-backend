import express from "express";
import { and, desc, eq, getTableColumns, ilike, or, sql } from "drizzle-orm";
import { user } from "../db/schema/index.js";
import { db } from "../db/index.js";

const router = express.Router();

router.get("/", async (req, res) => {
    try {
        const { search, role, page = 1, limit = 10 } = req.query;
        const currentPage = Math.max(1, parseInt(String(page), 10) || 1);
        const LimitPerPage = Math.min(Math.max(1, parseInt(String(limit), 10) || 10), 100);

        const offset = (currentPage - 1) * LimitPerPage;

        const filterConditions = [];

        if (search) {
            filterConditions.push(or(
                ilike(user.name, `%${String(search)}%`),
                ilike(user.email, `%${String(search)}%`)
            ));
        }

        if (role) {
            filterConditions.push(eq(user.role, String(role) as "student" | "teacher" | "admin"));
        }

        const whereClause = filterConditions.length > 0 ? and(...filterConditions) : undefined;

        const countResult = await db
            .select({ count: sql<number>`count(*)` })
            .from(user)
            .where(whereClause)
            .execute();

        const totalCount = countResult[0]?.count ?? 0;

        const usersList = await db
            .select({ ...getTableColumns(user) })
            .from(user)
            .where(whereClause)
            .orderBy(desc(user.createdAt))
            .limit(LimitPerPage)
            .offset(offset);

        res.status(200).json({
            data: usersList,
            pagination: {
                total: totalCount,
                page: currentPage,
                limit: LimitPerPage,
                totalPages: Math.ceil(totalCount / LimitPerPage),
            }
        });
    } catch (error) {
        console.error("GET /users/Error fetching users:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

export default router;