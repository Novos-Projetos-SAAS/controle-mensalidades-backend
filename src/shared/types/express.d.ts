declare global {
    namespace Express {
        interface Request {
            requestId: string;

            usuario?: {
                id: string;
            };

            auth?: {
                usuarioId: string;
                organizacaoId: string;
                areaNegocioId?: string;
                perfil: string;
            };
        }
    }
}

export {};
