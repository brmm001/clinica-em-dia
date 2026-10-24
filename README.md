# Clínica em Dia — MVP independente

Next.js 16 + TypeScript + Neon PostgreSQL + Better Auth.
Nome provisório: confirmar marca e domínio antes do lançamento público.
Não há alterações, deploys, canonicals, sitemap ou scripts no site Benavera.
O único vínculo comercial é um link opcional para benavera.com.br, marcado como sponsored.

## Implementado
- Editor responsivo de orçamento, itens, quantidades, desconto e entrada.
- Parcelamento com tabela Price, até 36 parcelas, taxa informada pelo usuário.
- Impressão A4 / Salvar como PDF no navegador; logo local opcional.
- Cadastro e login com Better Auth; sessões e limites de requisição no PostgreSQL.
- API de histórico e gravação com verificação de sessão e filtro obrigatório por usuário.
- Banco Neon exclusivo; script de tabela de orçamentos.
- Preview com noindex e robots bloqueado por padrão.

## Antes de ativar contas / publicar
1. Criar repositório NOVO e privado no GitHub (sugestão: clinica-em-dia). Não usar repo benavera.
2. Criar projeto NOVO Vercel, framework Next.js, e conectar o novo repo.
3. Provisionar Neon exclusivo, separado dos dados da Benavera. Usar a URL pooled com SSL.
4. Configurar DATABASE_URL, BETTER_AUTH_SECRET (aleatório, mínimo 32 caracteres) e BETTER_AUTH_URL (origem exata deste app) no projeto novo. Nunca usar NEXT_PUBLIC_ para segredos.
5. Instalar dependências: npm ci. Após o vínculo da Vercel e verificação das variáveis, aplicar as migrações:
   - npx auth@latest migrate --config ./auth.config.ts
   - aplicar db/001-quotes.sql no banco novo, após as tabelas do Better Auth.
6. Validar cadastro, login, logout, salvamento e recarga de histórico com duas contas, provando isolamento. Fluxo real de Neon ainda NÃO testado.
7. Completar recuperação de senha, confirmação de e-mail e política de privacidade / retenção com a identidade do operador antes de abrir cadastro publicamente. O MVP não envia e-mails nem dados ao parceiro.
8. Somente no domínio independente definitivo: configurar NEXT_PUBLIC_SITE_URL e SEO_INDEXABLE=true. Manter previews sem indexação.
9. Configurar medição de tráfego e conversão no projeto novo. Analytics/Search Console ainda não conectados.

## Comportamento sem conexão com banco
Editor e impressão funcionam sem banco. O cadastro e histórico ficam indisponíveis de forma explícita; nenhuma gravação é simulada. Campos não são persistidos no navegador. Recarregar a página perde o rascunho. Logo não é armazenada no histórico.

## Verificações
npm test
npm run typecheck
npm run build

Os testes cobrem valores com desconto/entrada, entrada excessiva, cálculo Price e validação. Build compila frontend e APIs. Acesso real ao banco, impressão visual e fluxo de autenticação em navegador precisam de validação após provisionamento.

## Publicação nesta sessão
Criação na Vercel bloqueada por 403 (autorização da equipe necessária).
A integração GitHub disponível permite consultar/editar repositórios existentes, mas não expõe criação de repositório novo.
Nenhum recurso de banco foi criado e nenhum site foi publicado.
