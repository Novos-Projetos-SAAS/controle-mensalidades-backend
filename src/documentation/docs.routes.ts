import { Router } from 'express';

import openApiDocument from './openapi.js';

const docsRoutes = Router();

const swaggerHtml = `<!doctype html>
<html lang="pt-BR">
<head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Plataforma Modular API - Swagger</title>
    <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
</head>
<body>
    <div id="swagger-ui"></div>
    <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
    <script>
        window.onload = function () {
            window.ui = SwaggerUIBundle({
                url: '/docs/openapi.json',
                dom_id: '#swagger-ui',
                deepLinking: true,
                displayRequestDuration: true,
                filter: true,
                persistAuthorization: true,
                tryItOutEnabled: true,
            });
        };
    </script>
</body>
</html>`;

docsRoutes.get('/', (_req, res) => {
    res.type('html').send(swaggerHtml);
});

docsRoutes.get('/openapi.json', (_req, res) => {
    res.json(openApiDocument);
});

export default docsRoutes;
