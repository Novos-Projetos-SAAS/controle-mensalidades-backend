import app from './app.js';
import { env } from './configuration/env.js';

app.listen(env.PORT, () => {
    console.log(`Servidor executando na porta ${env.PORT}`);
});
