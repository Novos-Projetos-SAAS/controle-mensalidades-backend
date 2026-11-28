import { randomUUID } from 'node:crypto';
import type { Request } from 'express';
import makeWASocket, { BufferJSON, DisconnectReason, initAuthCreds, proto } from '@whiskeysockets/baileys';
import type { AuthenticationState, SignalDataTypeMap } from '@whiskeysockets/baileys';
import pino from 'pino';
import QRCode from 'qrcode';
import db from '../../database/connection.js';
import AppError from '../../shared/errors/AppError.js';
import { janelaWhatsappAberta } from './whatsapp.janela.js';
import { abrirEstadoBaileys, chaveBaileys, cifrarEstadoBaileys } from './whatsapp.baileys.crypto.js';

const tabela = 'whatsapp_baileys_sessoes';
const tempoSessao = 3 * 60_000;
export type EscopoBaileys = { organizacao_id: string; area_negocio_id: string };
type Estado = { creds: AuthenticationState['creds']; keys: Record<string, Record<string, unknown>> };
type Sessao = {
    modo: 'DEMO' | 'ROTINA';
    lease: string;
    escopo: EscopoBaileys;
    socket: ReturnType<typeof makeWASocket> | null;
    status: 'CONECTANDO' | 'QR_CODE' | 'CONECTADO' | 'ERRO';
    qr: string | null;
    qrVersao: number;
    timer: ReturnType<typeof setTimeout> | null;
    gravacao: Promise<void>;
    encerrando: boolean;
    enviando: boolean;
    testado: boolean;
};
const sessoes = new Map<string, Sessao>();
const id = (e: EscopoBaileys) => e.organizacao_id + ':' + e.area_negocio_id;
const consulta = (e: EscopoBaileys) => db(tabela).where(e);
const erro = (mensagem: string, status: number, codigo: string) => new AppError(mensagem, status, codigo);

export function escopoBaileys(req: Request): EscopoBaileys {
    if (!req.auth?.areaNegocioId) throw erro('Selecione uma área.', 400, 'AREA_NAO_INFORMADA');
    return { organizacao_id: req.auth.organizacaoId, area_negocio_id: req.auth.areaNegocioId };
}
function habilitado(e: EscopoBaileys) {
    return process.env.WHATSAPP_BAILEYS_DEMO_ENABLED === 'true' &&
        process.env.WHATSAPP_BAILEYS_DEMO_ORG_ID === e.organizacao_id &&
        process.env.WHATSAPP_BAILEYS_DEMO_AREA_ID === e.area_negocio_id &&
        process.env.NODE_ENV !== 'test';
}
function exigir(e: EscopoBaileys) {
    if (!habilitado(e)) throw erro('Demonstração não habilitada nesta área.', 403, 'BAILEYS_DEMO_DESABILITADA');
    try { return chaveBaileys(); } catch {
        throw erro('Chave de sessão não configurada.', 503, 'BAILEYS_CHAVE_INDISPONIVEL');
    }
}
async function encerrar(s: Sessao, apagar = false) {
    if (s.encerrando) return;
    s.encerrando = true;
    s.qr = null;
    if (s.timer) clearTimeout(s.timer);
    try { s.socket?.end(undefined); } catch { /* lease será liberado abaixo */ }
    await s.gravacao.catch(() => {});
    try {
        await consulta(s.escopo).where('lease_id', s.lease).update({
            lease_id: null, lease_ate: null,
            ...(apagar ? { estado_cifrado: null, pareada: false } : {}),
        });
    } finally {
        if (sessoes.get(id(s.escopo)) === s) sessoes.delete(id(s.escopo));
    }
}
function encerrarSeguro(s: Sessao, apagar = false) {
    void encerrar(s, apagar).catch(() => {});
}
export async function statusBaileys(e: EscopoBaileys) {
    if (!habilitado(e)) return { habilitado: false, status: 'DESABILITADO', qr: null, salvo: false, ultimoTeste: null, destinatarioTeste: null, modo: null, testado: false, rotinaAtiva: false };
    const row = await consulta(e).first('estado_cifrado', 'pareada', 'ultimo_teste');
    const s = sessoes.get(id(e));
    const numero = process.env.WHATSAPP_BAILEYS_DEMO_TEST_NUMBER ?? '';
    return {
        habilitado: true,
        status: s && !s.encerrando ? s.status : 'DESCONECTADO',
        qr: s && !s.encerrando ? s.qr : null,
        salvo: !!row?.estado_cifrado && !!row?.pareada,
        modo: s?.modo ?? null,
        testado: s?.testado ?? false,
        rotinaAtiva: process.env.WHATSAPP_BAILEYS_AUTOMATIC_ENABLED === 'true',
        ultimoTeste: row?.ultimo_teste ?? null,
        destinatarioTeste: /^55[1-9]\d{9,10}$/.test(numero) ? '+' + numero : null,
    };
}
export async function iniciarBaileys(e: EscopoBaileys, modo: 'DEMO' | 'ROTINA' = 'DEMO') {
    const chave = exigir(e);
    const existente = sessoes.get(id(e));
    if (existente) {
        if (existente.modo !== modo || modo === 'ROTINA') throw erro('Sessão ocupada.', 409, 'BAILEYS_SESSAO_OCUPADA');
        return statusBaileys(e);
    }
    await db(tabela).insert(e).onConflict(['organizacao_id', 'area_negocio_id']).ignore();
    const lease = randomUUID();
    const reservado = await consulta(e).where(function () {
        this.whereNull('lease_id').orWhere('lease_ate', '<', db.fn.now());
    }).update({ lease_id: lease, lease_ate: new Date(Date.now() + tempoSessao + 60_000) });
    if (!reservado) throw erro('Sessão ocupada. Aguarde alguns minutos.', 409, 'BAILEYS_SESSAO_OCUPADA');
    const s: Sessao = { modo, lease, escopo: e, socket: null, status: 'CONECTANDO', qr: null, qrVersao: 0, timer: null,
        gravacao: Promise.resolve(), encerrando: false, enviando: false, testado: false };
    sessoes.set(id(e), s);
    s.timer = setTimeout(() => encerrarSeguro(s), tempoSessao);
    s.timer.unref();
    try {
        const row = await consulta(e).where('lease_id', lease).first('estado_cifrado');
        if (!row) throw new Error('LEASE_PERDIDO');
        const estado: Estado = row.estado_cifrado
            ? JSON.parse(abrirEstadoBaileys(row.estado_cifrado, id(e), chave), BufferJSON.reviver) as Estado
            : { creds: initAuthCreds(), keys: {} };
        function salvar() {
            if (s.encerrando) return Promise.reject(new Error('SESSAO_ENCERRADA'));
            const cifra = cifrarEstadoBaileys(JSON.stringify(estado, BufferJSON.replacer), id(e), chave);
            s.gravacao = s.gravacao.then(async () => {
                const n = await consulta(e).where('lease_id', lease).where('lease_ate', '>', db.fn.now())
                    .update({ estado_cifrado: cifra, pareada: Boolean(estado.creds.registered) });
                if (!n) throw new Error('LEASE_PERDIDO');
            });
            void s.gravacao.catch(() => encerrarSeguro(s));
            return s.gravacao;
        }
        if (modo === 'ROTINA' && (!row.estado_cifrado || !estado.creds.registered)) throw new Error('SESSAO_NAO_PAREADA');
        const auth: AuthenticationState = {
            creds: estado.creds,
            keys: {
                async get<T extends keyof SignalDataTypeMap>(type: T, ids: string[]) {
                    const result: { [key: string]: SignalDataTypeMap[T] } = {};
                    for (const key of ids) {
                        const value = estado.keys[type]?.[key];
                        if (value != null) {
                            result[key] = (type === 'app-state-sync-key'
                                ? proto.Message.AppStateSyncKeyData.fromObject(value as Record<string, unknown>)
                                : value) as SignalDataTypeMap[T];
                        }
                    }
                    return result;
                },
                async set(data) {
                    for (const [type, entries] of Object.entries(data)) {
                        const bucket = estado.keys[type] ?? (estado.keys[type] = Object.create(null) as Record<string, unknown>);
                        for (const [key, value] of Object.entries(entries ?? {})) {
                            if (value == null) delete bucket[key];
                            else bucket[key] = value;
                        }
                    }
                    await salvar();
                },
            },
        };
        let reiniciou = false;
        const conectar = () => {
            if (s.encerrando) return;
            const socket = makeWASocket({ auth, logger: pino({ level: 'silent' }), syncFullHistory: false, markOnlineOnConnect: false });
            s.socket = socket;
            socket.ev.on('creds.update', () => {
                if (s.socket === socket && !s.encerrando) void salvar().catch(() => {});
            });
            socket.ev.on('connection.update', (u) => {
                if (s.socket !== socket || s.encerrando) return;
                if (u.qr) {
                    if (modo === 'ROTINA') { encerrarSeguro(s); return; }
                    s.status = 'QR_CODE';
                    const qr = u.qr;
                    const versao = ++s.qrVersao;
                    s.qr = null;
                    void QRCode.toDataURL(qr, { margin: 2, width: 280 }).then((imagem) => {
                        if (s.socket === socket && !s.encerrando && s.status === 'QR_CODE' && versao === s.qrVersao) s.qr = imagem;
                    }).catch(() => encerrarSeguro(s));
                }
                if (u.connection === 'open') {
                    s.qr = null;
                    s.status = 'CONECTANDO';
                    void salvar().then(() => {
                        if (s.socket === socket && !s.encerrando) s.status = 'CONECTADO';
                    }).catch(() => {});
                }
                if (u.connection === 'close') {
                    s.qr = null;
                    const code = (u.lastDisconnect?.error as { output?: { statusCode?: number } } | undefined)?.output?.statusCode;
                    if (code === DisconnectReason.restartRequired && !reiniciou) {
                        reiniciou = true;
                        s.status = 'CONECTANDO';
                        void s.gravacao.then(() => conectar()).catch(() => encerrarSeguro(s));
                    } else {
                        encerrarSeguro(s, code === DisconnectReason.loggedOut);
                    }
                }
            });
        };
        conectar();
        return statusBaileys(e);
    } catch {
        await encerrar(s).catch(() => {});
        throw erro('Não foi possível iniciar a sessão.', 503, 'BAILEYS_SESSAO_INDISPONIVEL');
    }
}
export async function testarBaileys(e: EscopoBaileys) {
    exigir(e);
    const numero = process.env.WHATSAPP_BAILEYS_DEMO_TEST_NUMBER ?? '';
    if (!/^55[1-9]\d{9,10}$/.test(numero)) throw erro('Destinatário de teste não configurado.', 400, 'BAILEYS_DESTINO_INVALIDO');
    const s = sessoes.get(id(e));
    if (!s || s.modo !== 'DEMO' || s.encerrando || s.status !== 'CONECTADO' || !s.socket || s.enviando || s.testado) {
        throw erro('Conecte a sessão ou inicie uma nova demonstração.', 409, 'BAILEYS_TESTE_INDISPONIVEL');
    }
    s.enviando = true;
    s.testado = true;
    try {
        const n = await consulta(e).where('lease_id', s.lease).where('lease_ate', '>', db.fn.now())
            .update({ ultimo_teste: 'RESULTADO_INCERTO', ultimo_teste_em: db.fn.now() });
        if (!n || s.encerrando) throw new Error('LEASE_PERDIDO');
        const msg = await s.socket.sendMessage(numero + '@s.whatsapp.net', {
            text: 'Olá! Esta é uma mensagem de demonstração do sistema de controle de mensalidades.',
        });
        await s.gravacao;
        if (!msg?.key?.id) throw new Error('RESULTADO_INCERTO');
        await consulta(e).where('lease_id', s.lease).update({ ultimo_teste: 'SUBMETIDO' });
        return { status: 'SUBMETIDO' };
    } catch {
        throw erro('Resultado incerto. Confira o celular antes de tentar novamente.', 502, 'BAILEYS_RESULTADO_INCERTO');
    } finally { s.enviando = false; }
}
export async function pararBaileys(e: EscopoBaileys) {
    exigir(e);
    const s = sessoes.get(id(e));
    if (s?.modo === 'ROTINA') throw erro('Rotina em andamento.', 409, 'BAILEYS_SESSAO_OCUPADA');
    if (s?.enviando) throw erro('Aguarde o envio em andamento.', 409, 'BAILEYS_ENVIO_EM_ANDAMENTO');
    if (s) await encerrar(s);
    return statusBaileys(e);
}
export async function esquecerBaileys(e: EscopoBaileys) {
    exigir(e);
    if (sessoes.has(id(e))) throw erro('Encerre a conexão antes de apagar a sessão.', 409, 'BAILEYS_SESSAO_OCUPADA');
    const n = await consulta(e).where(function () {
        this.whereNull('lease_id').orWhere('lease_ate', '<', db.fn.now());
    }).update({ estado_cifrado: null, pareada: false, lease_id: null, lease_ate: null });
    if (!n && await consulta(e).first('lease_id')) throw erro('Sessão ocupada.', 409, 'BAILEYS_SESSAO_OCUPADA');
    return statusBaileys(e);
}
export async function pararTodasBaileys() {
    await Promise.allSettled([...sessoes.values()].map((s) => encerrar(s)));
}

/** Automação ainda restrita à organização, área e destinatário da demonstração. */
export async function abrirBaileysRotina(e: EscopoBaileys) {
    exigir(e);
    if (process.env.WHATSAPP_BAILEYS_AUTOMATIC_ENABLED !== 'true' || !janelaWhatsappAberta(new Date())) {
        throw erro('Rotina não habilitada ou fora do horário.', 403, 'BAILEYS_ROTINA_BLOQUEADA');
    }
    await iniciarBaileys(e, 'ROTINA');
    const s = sessoes.get(id(e));
    if (!s || s.modo !== 'ROTINA') throw new Error('SESSAO_INDISPONIVEL');
    try {
        const limite = Date.now() + 30_000;
        while (!s.encerrando && s.status !== 'CONECTADO' && Date.now() < limite) {
            await new Promise<void>((resolve) => setTimeout(resolve, 500));
        }
        if (s.encerrando || s.status !== 'CONECTADO') throw new Error('BAILEYS_CONEXAO_INDISPONIVEL');
        return {
            async enviar(destinatario: string, texto: string) {
                const numero = process.env.WHATSAPP_BAILEYS_DEMO_TEST_NUMBER ?? '';
                if (!/^55[1-9]\d{9,10}$/.test(numero) || destinatario !== '+' + numero ||
                    !janelaWhatsappAberta(new Date()) || s.encerrando || s.status !== 'CONECTADO' ||
                    !s.socket || s.enviando || process.env.WHATSAPP_BAILEYS_AUTOMATIC_ENABLED !== 'true') {
                    throw new Error('BAILEYS_ENVIO_BLOQUEADO');
                }
                s.enviando = true;
                try {
                    if (!(await consulta(e).where('lease_id', s.lease).where('lease_ate', '>', db.fn.now()).first('lease_id')) || s.encerrando) {
                        throw new Error('LEASE_PERDIDO');
                    }
                    const msg = await s.socket.sendMessage(numero + '@s.whatsapp.net', { text: texto });
                    await s.gravacao;
                    if (!msg?.key?.id) throw new Error('RESULTADO_INCERTO');
                    return msg.key.id;
                } finally { s.enviando = false; }
            },
            encerrar: () => encerrar(s),
        };
    } catch (error) {
        await encerrar(s).catch(() => {});
        throw error;
    }
}
