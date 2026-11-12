import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "../db/index.js"; // your drizzle instance
import * as schema from '../db/schema/auth.js'

export const auth = betterAuth({
    secret: process.env.BETTER_AUTH_SECRET!,
    baseURL: process.env.BETTER_AUTH_URL,
    trustedOrigins: [process.env.FRONTEND_URL!],
    advanced: {
        ipAddress: {
            ipAddressHeaders: ["x-forwarded-for"],
        },
    },
    database: drizzleAdapter(db, {
        provider: "pg", 
        schema,
    }),
    emailAndPassword: {
        enabled: true,
    },
    user: {
        additionalFields: {
            role: {
                type: 'string', required: false, defaultValue: 'student', input: false,
            },
            imageCldPubId: {
                type: 'string', required: false, input: true,
            }
        }
    }
});