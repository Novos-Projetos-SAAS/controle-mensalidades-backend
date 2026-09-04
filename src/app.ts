import cors from 'cors';
import express from 'express';

import errorHandler from './middlewares/errorHandler.middleware.js';
import requestId from './middlewares/requestId.middleware.js';

import routes from './routes/index.js';

import AppError from './shared/errors/AppError.js';

const app = express();

app.use(requestId);

app.use(cors());

app.use(express.json());

app.use('/api', routes);

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
