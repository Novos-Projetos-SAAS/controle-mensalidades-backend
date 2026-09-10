import cors from 'cors';
import express from 'express';
import cookieParser from 'cookie-parser';

import docsRoutes from './documentation/docs.routes.js';
import errorHandler from './middlewares/errorHandler.middleware.js';
import { limitadorGeral } from './middlewares/rateLimit.middleware.js';
import requestId from './middlewares/requestId.middleware.js';

import routes from './routes/index.js';

import AppError from './shared/errors/AppError.js';

const app = express();

app.use(requestId);

app.use(cors());

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
