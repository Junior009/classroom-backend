import type { Request, Response, NextFunction } from 'express';
import aj from '../config/arcjet.js';
import { slidingWindow } from '@arcjet/node';
import { Socket } from 'node:dgram';

const securityMiddleware = async (req: Request, res: Response, next: NextFunction) => {
    if(process.env.NODE_ENV === 'test') return next();

    try {
        
         const role: RateLimitRole = req.user?.role ?? 'guest';

         let limit: number;
         let message: string;

         switch (role) {
            case 'admin':
                limit = 20;
                message = 'Admin request limit exceeded (20 per minute)';
                break;
            case 'teacher':
                limit = 10;
                message = 'Teacher request limit exceeded (10 per minute)';
                break;
            case 'student':
                limit = 10;
                message = 'Student request limit exceeded';
                break;
            default:
                limit = 10;
                message = 'Guest request limit exceeded (5 per minute), Please sign up for higher limits';
                break;

         }

         const client = aj.withRule(
            slidingWindow({
                mode: 'LIVE',
                interval: '1m',
                max: limit,
            })
         )

         const arcjetRequest = {
            headers: req.headers,
            method: req.method,
            url: req.originalUrl ?? req.url,
            socket: {remoteAddress: req.socket.remoteAddress ?? req.ip ?? '0.0.0.0'},
         }

         const decision = await client.protect(arcjetRequest);

         if(decision.isDenied() && decision.reason.isBot()){
            return res.status(403).json({error: 'Forbidden', message: 'Automated requests are not allowed. '});
         }

        if(decision.isDenied() && decision.reason.isShield()){
            return res.status(403).json({error: 'Forbidden', message: 'Request blocked by security policy '});
         }

                  if(decision.isDenied() && decision.reason.isRateLimit()){
            return res.status(429).json({error: 'Forbidden', message});
         }

         next();

    } catch (e) {
        console.error('Arcjet security middleware error:', e);     
        res.status(500).json({ error: 'Internal server error', message: 'Security middleware failed' });   
    }
}

export default securityMiddleware;