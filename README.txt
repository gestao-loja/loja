# Gestão Loja — páginas separadas

Estrutura:
- index.html — login
- dashboard.html — dashboard
- produtos.html — produtos
- variacoes.html — variações
- estoque.html — estoque
- styles.css — estilos compartilhados
- app.js — conexão Supabase, autenticação e funções compartilhadas

## Configuração

Abra `app.js` e preencha:
const SUPABASE_URL = "SUA_URL";
const SUPABASE_ANON_KEY = "SUA_CHAVE_ANON";

Use somente a chave ANON/PUBLISHABLE, nunca a service_role.

As páginas continuam usando as mesmas tabelas e RPCs do código original:
- gestao_loja_usuarios
- gestao_loja_lojas
- gestao_loja_produtos
- gestao_loja_produtos_variacoes
- gestao_loja_clientes
- gestao_loja_movimentacoes_estoque
- gestao_loja_ajustar_estoque
- gestao_loja_movimentar_estoque

Observação:
A navegação agora é feita por arquivos separados, mas a sessão de autenticação do Supabase continua sendo compartilhada entre as páginas.
