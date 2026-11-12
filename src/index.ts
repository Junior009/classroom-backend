
import AgentAPI from 'apminsight';  
AgentAPI.config();

import express from 'express';
import cors from 'cors';
import subjectsRouter from './routes/subjects.js';
import departmentsRouter from './routes/departments.js';
import usersRouter from './routes/users.js';
import classesRouter from './routes/classes.js'
import studentRouter from './routes/student.js';
import teacherRouter from './routes/teacher.js';
import sessionMiddleware from './middleware/session.js';
import securityMiddleware from './middleware/security.js';
import {toNodeHandler} from 'better-auth/node';
import {auth} from "./lib/auth.js";

const app = express();
const PORT = process.env.PORT || 8000;
const trustedProxyCidrs = (process.env.TRUSTED_PROXY_CIDRS ?? "")
  .split(",")
  .map((cidr) => cidr.trim())
  .filter(Boolean);

app.set("trust proxy", trustedProxyCidrs);

if (!process.env.FRONTEND_URL) {
  throw new Error('FRONTEND_URL is not defined in .env file');
}

app.use(cors({
  origin: new URL(process.env.FRONTEND_URL).origin,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true
}));

const forwardResolvedClientIp: express.RequestHandler = (req, _res, next) => {
  const clientIp = req.ip || req.socket.remoteAddress;
  if (clientIp) req.headers["x-forwarded-for"] = clientIp;
  next();
};

app.all('/api/auth/{*splat}', forwardResolvedClientIp, toNodeHandler(auth));

app.use(express.json());
app.use(sessionMiddleware);
app.use(securityMiddleware);

app.use('/api/subjects', subjectsRouter);
app.use('/api/departments', departmentsRouter);
app.use('/api/users', usersRouter);
app.use('/api/classes', classesRouter);
app.use('/api/student', studentRouter);
app.use('/api/teacher', teacherRouter);

app.get('/', (req, res) => {
  res.send('Hello, Classroom API!');
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
