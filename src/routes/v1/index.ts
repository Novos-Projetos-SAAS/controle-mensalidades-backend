import { Router } from 'express';

import authRoutes from '../../modules/auth/auth.routes.js';
import healthRoutes from '../../modules/health/health.routes.js';
import areasNegocioRoutes from '../../modules/areas_negocio/areas_negocio.routes.js';
import modulosRoutes from '../../modules/modulos/modulos.routes.js';
import areasModulosRoutes from '../../modules/areas_modulos/areas_modulos.routes.js';
import contextoRoutes from '../../modules/contexto/contexto.routes.js';
import organizacoesRoutes from '../../modules/organizacoes/organizacoes.routes.js';
import usuariosRoutes from '../../modules/usuarios/usuarios.routes.js';
import clientesRoutes from '../../modules/clientes/clientes.routes.js';
import servicosRoutes from '../../modules/servicos/servicos.routes.js';
import profissionaisRoutes from '../../modules/profissionais/profissionais.routes.js';
import agendamentosRoutes from '../../modules/agendamentos/agendamentos.routes.js';
import permissoesClinicasRoutes from '../../modules/profissionais/permissoes_clinicas.routes.js';
import vinculoUsuarioRoutes from '../../modules/profissionais/vinculo_usuario.routes.js';
import financeiroRoutes from '../../modules/financeiro/financeiro.routes.js';
import whatsappRoutes from '../../modules/whatsapp/whatsapp.routes.js';
import { pagamentosPublicRoutes } from '../../modules/pagamentos/pagamentos.routes.js';

const v1Routes = Router();

v1Routes.use('/auth', authRoutes);
v1Routes.use('/health', healthRoutes);
v1Routes.use('/areas-negocio', areasNegocioRoutes);
v1Routes.use('/modulos', modulosRoutes);
v1Routes.use('/areas-negocio', areasModulosRoutes);
v1Routes.use('/contexto', contextoRoutes);
v1Routes.use('/organizacoes', organizacoesRoutes);
v1Routes.use('/usuarios', usuariosRoutes);
v1Routes.use('/clientes', clientesRoutes);
v1Routes.use('/servicos', servicosRoutes);

v1Routes.use('/profissionais', profissionaisRoutes);

// Permissões clínicas administrativas.
v1Routes.use('/profissionais', permissoesClinicasRoutes);

// Gerenciamento administrativo do vínculo usuário-profissional.
v1Routes.use('/profissionais', vinculoUsuarioRoutes);

v1Routes.use('/agendamentos', agendamentosRoutes);
v1Routes.use('/financeiro', financeiroRoutes);
v1Routes.use('/whatsapp', whatsappRoutes);
v1Routes.use('/pagamentos', pagamentosPublicRoutes);

export default v1Routes;
