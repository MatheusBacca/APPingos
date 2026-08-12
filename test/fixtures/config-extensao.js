/**
 * O que `extensao/lib/config.gerado.js` seria, para os testes.
 *
 * O de verdade é escrito por `scripts/empacotar-extensao.mjs` a partir do `.env` e
 * fica fora do git (carrega a anon key e o ref do projeto). Sem este substituto,
 * `test/extensao-api.test.ts` só rodaria em quem já tivesse rodado
 * `npm run extensao` — o mapeamento está em `vitest.config.ts`.
 */
export const SUPABASE_URL = 'https://projeto-de-teste.supabase.co'
export const SUPABASE_KEY = 'anon-key-de-teste'
export const APP_URL = 'https://appingos.exemplo'
