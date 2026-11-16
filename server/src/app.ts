import Fastify, { type FastifyError } from 'fastify';
import { config } from './config.js';
import db from './plugins/db.js';
import { MlError } from './clients/ml.js';
import { HttpError } from './errors.js';
import healthRoutes from './routes/health.js';
import crewRoutes from './routes/crew.js';
import missionRoutes from './routes/mission.js';

export async function buildApp() {
  const app = Fastify({ logger: { level: config.logLevel } });

  app.setErrorHandler((err: FastifyError | HttpError | MlError, req, reply) => {
    if ('validation' in err && err.validation) {
      // 422 for out-of-range telemetry (AIVI doc §10: "a safe 422 validation response").
      return reply.code(422).send({ error: 'Validation failed', message: err.message, details: err.validation });
    }
    if (err instanceof HttpError) return reply.code(err.status).send({ error: err.message, ...err.extra });
    if (err instanceof MlError) {
      const status = err.status >= 500 || err.status === 422 ? err.status : 502;
      return reply.code(status).send({ error: 'Inference service error', detail: err.detail });
    }
    req.log.error(err);
    const status = (err as FastifyError).statusCode ?? 500;
    return reply.code(status).send({ error: status >= 500 ? 'Internal server error' : err.message });
  });

  await app.register(db, { connectionString: config.databaseUrl });
  await app.register(healthRoutes);
  await app.register(crewRoutes, { prefix: '/crew' });
  await app.register(missionRoutes);

  return app;
}
