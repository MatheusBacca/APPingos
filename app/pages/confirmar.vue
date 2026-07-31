<script setup lang="ts">
// Destino do redirect do Supabase depois do link de confirmação / OAuth.
// O módulo já trocou o code por sessão antes de chegar aqui.
definePageMeta({ layout: 'auth' })
useHead({ title: 'Confirmando · APPingos' })

const user = useSupabaseUser()
const router = useRouter()
const { resolverSeHouver } = useConvitePendente()

watchEffect(async () => {
  if (!user.value) return
  await resolverSeHouver()
  await router.replace('/')
})
</script>

<template>
  <p class="text-center text-sm text-muted-foreground">
    Confirmando o seu acesso…
  </p>
</template>
