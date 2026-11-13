/**
 * Se a Pluggy está configurada neste ambiente — só um booleano, nunca as chaves.
 *
 * A tela de contas conectadas pergunta isto antes de oferecer o botão: sem as
 * chaves no .env, o certo é explicar, e não deixar a pessoa descobrir clicando.
 */
export default defineEventHandler((event) => {
  const { pluggyClientId, pluggyClientSecret } = useRuntimeConfig(event)
  return { configurada: !!pluggyClientId && !!pluggyClientSecret }
})
