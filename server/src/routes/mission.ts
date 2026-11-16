import type { FastifyPluginAsync } from 'fastify';
import { getMission, updateMission } from '../services/mission.js';
import { addCountermeasure, listAlerts, listCountermeasures, setCountermeasureDone } from '../services/insights.js';

/** Mission-wide resources: mission parameters, the cross-crew alert feed, and the countermeasure checklist. */
const missionRoutes: FastifyPluginAsync = async (app) => {
  app.get('/mission', async () => getMission(app.dbx));

  app.put<{ Body: Record<string, string | number> }>(
    '/mission',
    {
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          minProperties: 1,
          properties: {
            name: { type: 'string', minLength: 1, maxLength: 80 },
            mission_day: { type: 'integer', minimum: 1, maximum: 1000 },
            phase: { type: 'string', minLength: 1, maxLength: 40 },
            duration_days: { type: 'integer', minimum: 1, maximum: 2000 },
            orbit_altitude_km: { type: 'integer', minimum: 0, maximum: 1000000 },
          },
        },
      },
    },
    async (req) => updateMission(app.dbx, req.body),
  );

  app.get<{ Querystring: { state: 'active' | 'all'; limit: number } }>(
    '/alerts',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            state: { type: 'string', enum: ['active', 'all'], default: 'active' },
            limit: { type: 'integer', minimum: 1, maximum: 500, default: 100 },
          },
        },
      },
    },
    async (req) => listAlerts(app.dbx, req.query),
  );

  app.get('/countermeasures', async () => listCountermeasures(app.dbx));

  app.post<{ Body: { label: string; crew_id?: string; source?: string } }>(
    '/countermeasures',
    {
      schema: {
        body: {
          type: 'object',
          required: ['label'],
          additionalProperties: false,
          properties: {
            label: { type: 'string', minLength: 1, maxLength: 200 },
            crew_id: { type: 'string', pattern: '^[A-Za-z0-9-]{2,64}$' },
            source: { type: 'string', enum: ['manual', 'digital_twin'] },
          },
        },
      },
    },
    async (req, reply) =>
      reply.code(201).send(await addCountermeasure(app.dbx, req.body.label, req.body.crew_id, req.body.source ?? 'manual')),
  );

  app.patch<{ Params: { id: number }; Body: { done: boolean } }>(
    '/countermeasures/:id',
    {
      schema: {
        params: { type: 'object', required: ['id'], properties: { id: { type: 'integer' } } },
        body: { type: 'object', required: ['done'], additionalProperties: false, properties: { done: { type: 'boolean' } } },
      },
    },
    async (req) => setCountermeasureDone(app.dbx, req.params.id, req.body.done),
  );
};

export default missionRoutes;
