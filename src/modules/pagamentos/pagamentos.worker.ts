import { env } from '../../configuration/env.js';
import { pagamentosService } from './pagamentos.routes.js';

let timer: ReturnType<typeof setInterval> | undefined;
let running: Promise<void> | undefined;
let stopping = false;

export function iniciarRotinaPagamentos() {
    if (timer || env.NODE_ENV === 'test') return;
    stopping = false;
    const tick = () => {
        if (running || stopping) return;
        running = pagamentosService
            .executarCiclo()
            .catch((error: unknown) => {
                // Do not include SQL, bindings, request URLs or provider bodies in job logs.
                const code =
                    error && typeof error === 'object' && 'code' in error
                        ? String(error.code)
                        : 'ROTINA_INDISPONIVEL';
                console.warn('Rotina de pagamentos aguardando recuperação.', { codigo: code });
            })
            .finally(() => {
                running = undefined;
            });
    };
    timer = setInterval(tick, 60000);
    timer.unref();
    tick();
}

export async function pararRotinaPagamentos() {
    stopping = true;
    clearInterval(timer);
    timer = undefined;
    await running;
}
