import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "../db/index.js"; // your drizzle instance
import * as schema from '../db/schema/auth.js'

const frontendUrl = process.env.FRONTEND_URL;
if (!frontendUrl) throw new Error("FRONTEND_URL is not defined");

const authUrl = process.env.BETTER_AUTH_URL;
if (!authUrl) throw new Error("BETTER_AUTH_URL is not defined");

const isProduction = process.env.NODE_ENV === "production";

export const auth = betterAuth({
    secret: process.env.BETTER_AUTH_SECRET!,
    baseURL: new URL(authUrl).origin,
    trustedOrigins: [new URL(frontendUrl).origin],
    advanced: {
        ipAddress: {
            ipAddressHeaders: ["x-forwarded-for"],
        },
        defaultCookieAttributes: {
            sameSite: isProduction ? "none" : "lax",
            secure: isProduction,
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