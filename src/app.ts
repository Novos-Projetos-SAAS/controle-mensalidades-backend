import cors from 'cors';
import express from 'express';
import cookieParser from 'cookie-parser';

import { env } from './configuration/env.js';
import { criarOpcoesCors, resolverOrigensCors } from './configuration/cors.js';
import docsRoutes from './documentation/docs.routes.js';
import errorHandler from './middlewares/errorHandler.middleware.js';
import { limitadorGeral } from './middlewares/rateLimit.middleware.js';
import requestId from './middlewares/requestId.middleware.js';

import routes from './routes/index.js';

import AppError from './shared/errors/AppError.js';

const app = express();
const origensCors = resolverOrigensCors(env.CORS_ALLOWED_ORIGINS, env.NODE_ENV);

app.use(requestId);

app.use(cors(criarOpcoesCors(origensCors)));

app.use('/api/v1/whatsapp/webhook', express.raw({ type: 'application/json', limit: '1mb' }));
app.use(express.json());

app.use(cookieParser());
app.use('/docs', docsRoutes);
app.use('/api', limitadorGeral, routes);

app.use((req, _res, next) => {
    next(
        new AppError(
            `Rota ${req.method} ${req.originalUrl} não encontrada.`,
            404,
            'ROTA_NAO_ENCONTRADA',
        ),
    );
});

app.use(errorHandler);

export default app;
