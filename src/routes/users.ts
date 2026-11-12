import express from "express";
import { and, desc, eq, getTableColumns, ilike, ne, or, sql } from "drizzle-orm";
import { user } from "../db/schema/index.js";
import { db } from "../db/index.js";
import { auth } from "../lib/auth.js";

const router = express.Router();
const roles = ["student", "teacher", "admin"] as const;

const isRole = (role: unknown): role is (typeof roles)[number] =>
    typeof role === "string" && roles.includes(role as (typeof roles)[number]);

const requireAdmin: express.RequestHandler = (req, res, next) => {
    if (!req.user) {
        res.status(401).json({ message: "Authentication required" });
        return;
    }

    if (req.user.role !== "admin") {
        res.status(403).json({ message: "Administrator access required" });
        return;
    }

    next();
};

router.use(requireAdmin);

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
            if (!isRole(role)) {
                return res.status(400).json({ message: "Invalid user role" });
            }
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

router.post("/", async (req, res) => {
    const { name, email, password, role } = req.body ?? {};
    const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";

    if (
        typeof name !== "string" || !name.trim() ||
        !normalizedEmail.includes("@") ||
        typeof password !== "string" || password.length < 8 || password.length > 128 ||
        !isRole(role)
    ) {
        return res.status(400).json({ message: "Provide a name, valid email, password (8-128 characters), and valid role" });
    }

    try {
        const existingUser = await db
            .select({ id: user.id })
            .from(user)
            .where(eq(user.email, normalizedEmail))
            .limit(1);

        if (existingUser.length > 0) {
            return res.status(409).json({ message: "A user with this email already exists" });
        }

        const created = await auth.api.signUpEmail({
            body: { name: name.trim(), email: normalizedEmail, password },
        });
        const [createdUser] = await db
            .update(user)
            .set({ role })
            .where(eq(user.id, created.user.id))
            .returning();

        return res.status(201).json({ data: createdUser });
    } catch (error) {
        console.error("POST /users: failed to create user", error);
        return res.status(400).json({ message: "Could not create user. Check the email and password." });
    }
});

router.get("/:id", async (req, res) => {
    try {
        const [userRecord] = await db
            .select({ ...getTableColumns(user) })
            .from(user)
            .where(eq(user.id, req.params.id))
            .limit(1);

        if (!userRecord) {
            return res.status(404).json({ message: "User not found" });
        }

        return res.status(200).json({ data: userRecord });
    } catch (error) {
        console.error("GET /users/:id: failed to fetch user", error);
        return res.status(500).json({ message: "Could not fetch user" });
    }
});

router.put("/:id", async (req, res) => {
    const { name, email, role } = req.body ?? {};
    const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
    const userId = req.params.id;

    if (typeof name !== "string" || !name.trim() || !normalizedEmail.includes("@") || !isRole(role)) {
        return res.status(400).json({ message: "Provide a name, valid email, and valid role" });
    }

    try {
        const [targetUser] = await db
            .select({ id: user.id, role: user.role })
            .from(user)
            .where(eq(user.id, userId))
            .limit(1);

        if (!targetUser) {
            return res.status(404).json({ message: "User not found" });
        }

        if (targetUser.role === "admin" && role !== "admin") {
            const [adminCount] = await db
                .select({ count: sql<number>`count(*)::int` })
                .from(user)
                .where(eq(user.role, "admin"));

            if ((adminCount?.count ?? 0) <= 1) {
                return res.status(409).json({ message: "The last administrator cannot be demoted" });
            }
        }

        const duplicate = await db
            .select({ id: user.id })
            .from(user)
            .where(and(eq(user.email, normalizedEmail), ne(user.id, userId)))
            .limit(1);

        if (duplicate.length > 0) {
            return res.status(409).json({ message: "A user with this email already exists" });
        }

        const [updatedUser] = await db
            .update(user)
            .set({ name: name.trim(), email: normalizedEmail, role })
            .where(eq(user.id, userId))
            .returning();

        return res.status(200).json({ data: updatedUser });
    } catch (error) {
        console.error("PUT /users/:id: failed to update user", error);
        return res.status(500).json({ message: "Could not update user" });
    }
});

router.delete("/:id", async (req, res) => {
    const userId = req.params.id;

    if (userId === req.user?.id) {
        return res.status(400).json({ message: "You cannot delete your own account" });
    }

    try {
        const [targetUser] = await db
            .select({ id: user.id, role: user.role })
            .from(user)
            .where(eq(user.id, userId))
            .limit(1);

        if (!targetUser) {
            return res.status(404).json({ message: "User not found" });
        }

        if (targetUser.role === "admin") {
            const [adminCount] = await db
                .select({ count: sql<number>`count(*)::int` })
                .from(user)
                .where(eq(user.role, "admin"));

            if ((adminCount?.count ?? 0) <= 1) {
                return res.status(409).json({ message: "The last administrator cannot be deleted" });
            }
        }

        await db.delete(user).where(eq(user.id, userId));
        return res.status(200).json({ data: targetUser });
    } catch (error) {
        console.error("DELETE /users/:id: failed to delete user", error);
        return res.status(500).json({ message: "Could not delete user" });
    }
});

export default router;