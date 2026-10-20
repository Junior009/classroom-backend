import express from "express";
import { asc, sql } from "drizzle-orm";
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

export default router;