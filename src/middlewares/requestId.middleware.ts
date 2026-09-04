import { randomUUID } from 'node:crypto';

import type { Request, Response, NextFunction } from 'express';

export default function requestId(req: Request, res: Response, next: NextFunction) {
    const identificador = randomUUID();

    req.requestId = identificador;

    res.setHeader('X-Request-Id', identificador);

    next();
}
