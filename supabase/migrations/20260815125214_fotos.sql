-- ============================================================================
-- APPingos — Fotos.
--
-- O módulo existe para uma pergunta só: "posso postar esta?". Uma pessoa manda a
-- foto (ou o vídeo), a outra curte, e é o par de coraçõezinhos que autoriza. Sem
-- isso a conversa acontece no WhatsApp, some no rolar da tela, e a resposta se
-- perde antes de virar post.
--
-- Três decisões carregam o arquivo:
--
--   1. QUEM ENVIA JÁ CURTIU. Um trigger insere a curtida do autor junto com a
--      linha. Mandar uma foto é dizer "gosto desta"; obrigar o autor a clicar no
--      coração da própria foto para o par fechar seria pedir que ele repita o que
--      o envio já disse, e deixaria a maioria das fotos empacada por engano.
--
--   2. APROVADA = TODO MUNDO DO ESPAÇO CURTIU, e não "duas curtidas". A regra
--      escrita em cima da contagem de membros vale igual no espaço pessoal (uma
--      pessoa, aprovada ao enviar) e sobreviveria a um espaço de três. Fixar o
--      número 2 aqui seria fixar a forma da família no schema.
--
--   3. `aprovada_em` é DERIVADO mas GRAVADO. Dá para calcular a cada leitura
--      contando curtidas, e ainda assim a coluna existe: é por ela que a tela
--      filtra e ordena, e é a transição dela para "não nulo" que dispara o aviso.
--      Um trigger a recalcula a cada curtida — nenhuma escrita do app a toca.
--
-- Os arquivos ficam num bucket PRIVADO do Storage; o banco guarda só o caminho.
-- Ver a seção "Storage" mais abaixo para o porquê do caminho começar pelo espaço.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Tabelas
-- ----------------------------------------------------------------------------

create table public.foto (
  id          uuid primary key default gen_random_uuid(),
  space_id    uuid not null references public.space (id) on delete cascade,
  enviada_por uuid not null references auth.users (id) on delete cascade,

  -- O caminho dentro do bucket `fotos`, no formato `<space_id>/<uuid>.<ext>`.
  -- Único porque duas linhas apontando para o mesmo arquivo transformariam
  -- apagar uma delas em quebrar a outra.
  caminho     text not null unique check (trim(caminho) <> ''),

  -- Texto com CHECK, e não enum, pelo mesmo motivo de `papel` e `destino`:
  -- acrescentar 'audio' um dia é alterar a constraint, não migrar um tipo.
  --
  -- Guardado em vez de derivado do mime a cada leitura porque é por ele que a
  -- tela decide entre <img> e <video>, e porque filtrar "só os vídeos" não
  -- deveria pedir um LIKE em text.
  tipo        text not null check (tipo in ('imagem', 'video')),
  mime        text not null check (trim(mime) <> ''),
  tamanho     bigint check (tamanho > 0),

  -- A legenda que vai junto quando a foto for postada. Opcional: a maioria das
  -- fotos entra aqui para ser aprovada, não para ser escrita.
  legenda     text,

  /*
   * Mantida pelo trigger `foto_recalcular_aprovacao`, nunca pelo app.
   *
   * Nulo = falta alguém curtir. Preenchido = todo mundo do espaço curtiu, e o
   * valor é o instante em que a última curtida entrou.
   */
  aprovada_em timestamptz,

  -- "Já foi para o Instagram." Fecha o ciclo: sem isto a galeria vira uma pilha
  -- de aprovadas que ninguém sabe se já saíram, e a fila para de significar algo
  -- depois do primeiro mês.
  postada_em  timestamptz,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  -- Postar o que ninguém aprovou é justamente o que o módulo veio evitar.
  constraint foto_postada_depois_de_aprovada check (
    postada_em is null or aprovada_em is not null
  )
);

create table public.foto_curtida (
  foto_id    uuid not null references public.foto (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (foto_id, user_id)
);

create index foto_space_idx on public.foto (space_id, created_at desc);
create index foto_curtida_user_idx on public.foto_curtida (user_id);

create trigger foto_updated_at
  before update on public.foto
  for each row execute function public.tocar_updated_at();

-- ----------------------------------------------------------------------------
-- O que não se edita depois de gravado
--
-- `space_id`, `enviada_por` e `caminho` nascem juntos e descrevem um arquivo que
-- já está no Storage. Um update em `space_id` moveria a linha para um espaço cujo
-- membro não alcança o arquivo (a policy do Storage lê o caminho, não a linha), e
-- o resultado seria um card permanentemente quebrado — sem erro em lugar nenhum.
-- A policy de update precisa continuar aberta para legenda e `postada_em`, então
-- quem barra é um trigger.
-- ----------------------------------------------------------------------------

create function public.foto_origem_protegida()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.space_id is distinct from old.space_id
     or new.enviada_por is distinct from old.enviada_por
     or new.caminho is distinct from old.caminho then
    raise exception 'a origem da foto não muda — apague e envie de novo';
  end if;

  return new;
end;
$$;

create trigger foto_origem_protegida
  before update on public.foto
  for each row execute function public.foto_origem_protegida();

-- ----------------------------------------------------------------------------
-- Aprovação
-- ----------------------------------------------------------------------------

/*
  Recalcula `aprovada_em` a cada curtida que entra ou sai.

  SECURITY DEFINER porque escreve em `public.foto`, e quem curte pode não ter
  passagem de update pela RLS quando a policy mudar um dia. O que ele grava não
  depende de quem chamou — é contagem — então não há decisão a delegar.

  A data é `now()` no momento em que o par fecha, e não a do `created_at` da
  última curtida, porque as duas são a mesma coisa dentro da transação e `now()`
  não pede um select a mais.

  Descurtir volta `aprovada_em` para nulo: se uma das duas pessoas mudou de
  ideia, a foto não está mais aprovada — e uma aprovação que sobrevive à retirada
  do voto que a criou é a única forma de este módulo mentir.
*/
create function public.foto_recalcular_aprovacao()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_foto     uuid := coalesce(new.foto_id, old.foto_id);
  v_space    uuid;
  v_membros  int;
  v_curtidas int;
begin
  select f.space_id into v_space from public.foto f where f.id = v_foto;

  -- A foto some antes das curtidas quando a linha é apagada em cascata; sem esta
  -- saída o trigger tentaria atualizar o que já não existe.
  if v_space is null then
    return coalesce(new, old);
  end if;

  select count(*) into v_membros
  from public.membership m where m.space_id = v_space;

  select count(*) into v_curtidas
  from public.foto_curtida c where c.foto_id = v_foto;

  update public.foto
     set aprovada_em = case when v_curtidas >= v_membros then now() else null end
   where id = v_foto
     -- Sem isto, cada curtida reescreveria a data de uma foto já aprovada e
     -- reemitiria o aviso de aprovação.
     and (aprovada_em is null) = (v_curtidas >= v_membros);

  return coalesce(new, old);
end;
$$;

create trigger foto_curtida_recalcula
  after insert or delete on public.foto_curtida
  for each row execute function public.foto_recalcular_aprovacao();

/*
  Quem envia já curtiu — a decisão 1 do cabeçalho.

  AFTER INSERT, e não um insert feito pelo app junto: assim a regra vale também
  para a linha que entrar por SQL ou por outra RPC no futuro, e não há o estado
  intermediário "foto sem nenhuma curtida" nem por um instante.
*/
create function public.foto_curtida_do_autor()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.foto_curtida (foto_id, user_id)
  values (new.id, new.enviada_por)
  on conflict do nothing;

  return new;
end;
$$;

create trigger foto_curtida_do_autor
  after insert on public.foto
  for each row execute function public.foto_curtida_do_autor();

-- ----------------------------------------------------------------------------
-- RLS
-- ----------------------------------------------------------------------------

alter table public.foto enable row level security;
alter table public.foto_curtida enable row level security;

create policy foto_select on public.foto
  for select to authenticated
  using (public.is_space_member(space_id));

create policy foto_insert on public.foto
  for insert to authenticated
  with check (public.is_space_member(space_id) and enviada_por = auth.uid());

-- Aberta para qualquer membro porque legenda e "já postei" são coordenação, não
-- reescrita do que o outro mandou. O que não se mexe está no trigger acima.
create policy foto_update on public.foto
  for update to authenticated
  using (public.is_space_member(space_id))
  with check (public.is_space_member(space_id));

-- Apagar é de quem enviou ou do admin — mesmo desenho de `interesse_delete`.
create policy foto_delete on public.foto
  for delete to authenticated
  using (
    public.is_space_member(space_id)
    and (enviada_por = auth.uid() or public.is_space_admin(space_id))
  );

/*
  Mesma lógica de `can_access_entry`: SECURITY DEFINER para a policy de curtida
  não precisar atravessar a RLS de `foto`.
*/
create function public.pode_ver_foto(p_foto uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.foto f
    join public.membership m on m.space_id = f.space_id
    where f.id = p_foto
      and m.user_id = auth.uid()
  );
$$;

create policy foto_curtida_select on public.foto_curtida
  for select to authenticated
  using (public.pode_ver_foto(foto_id));

-- Ninguém curte no lugar do outro: é o voto dele que autoriza o post.
create policy foto_curtida_insert on public.foto_curtida
  for insert to authenticated
  with check (public.pode_ver_foto(foto_id) and user_id = auth.uid());

create policy foto_curtida_delete on public.foto_curtida
  for delete to authenticated
  using (user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- RPC
-- ----------------------------------------------------------------------------

/*
  Curte ou descurte, e devolve como ficou.

  Como RPC porque o gesto é um só (um toque no coração) e o caminho depende do
  estado atual. Resolver isso no app pediria uma leitura antes da escrita, e dois
  toques rápidos poderiam ler o mesmo estado e escrever o mesmo lado duas vezes.

  SECURITY INVOKER (o padrão) de propósito: as policies acima já dizem quem pode
  curtir o quê, e rodar como invocador mantém uma fonte de verdade só para isso.
*/
create function public.alternar_curtida(p_foto uuid)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  v_apagadas int;
begin
  delete from public.foto_curtida
   where foto_id = p_foto and user_id = auth.uid();

  get diagnostics v_apagadas = row_count;

  if v_apagadas > 0 then
    return false;
  end if;

  insert into public.foto_curtida (foto_id, user_id) values (p_foto, auth.uid());
  return true;
end;
$$;

grant execute on function public.alternar_curtida(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- Notificações
--
-- Dois eventos, e nenhum deles é "fulano curtiu". Numa dupla, a primeira curtida
-- que chega depois do envio já é a que aprova — avisar as duas coisas mandaria
-- dois pushes pelo mesmo toque no coração. O que interessa é quando a foto entra
-- na fila e quando ela sai autorizada.
-- ----------------------------------------------------------------------------

create function public.notificar_foto()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.notificar(
    p_space       => new.space_id,
    p_tipo        => 'foto_nova',
    p_ator        => coalesce(auth.uid(), new.enviada_por),
    p_dados       => jsonb_build_object('tipo', new.tipo, 'legenda', new.legenda),
    p_rota        => '/fotos',
    -- Mandar as fotos do fim de semana é um gesto só, feito em rajada. Sem a
    -- janela, doze arquivos viram doze avisos e a pessoa desliga a categoria.
    --
    -- E é por isso que este é o único gatilho do app sem `entidade`: `notificar()`
    -- agrupa por `entidade_id`, que seria diferente a cada arquivo e nunca casaria.
    -- O que se agrupa aqui é "chegaram fotos", não uma delas — e a rota leva à
    -- galeria, onde as três estão lado a lado de qualquer forma.
    p_janela      => interval '2 hours'
  );

  return new;
end;
$$;

create trigger foto_notifica
  after insert on public.foto
  for each row execute function public.notificar_foto();

/*
  O aviso que fecha o ciclo, disparado pela transição de `aprovada_em`.

  Só na virada de nulo para preenchido: `foto_recalcular_aprovacao` já não
  reescreve a data de uma foto aprovada, e a condição repetida aqui é a rede de
  segurança para o dia em que alguém mexer naquele update.

  O ator é quem curtiu por último — `notificar()` o exclui, que é o certo: ele
  acabou de tocar no coração e sabe. Quem precisa saber é quem mandou a foto.
*/
create function public.notificar_foto_aprovada()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.aprovada_em is not null or new.aprovada_em is null then
    return new;
  end if;

  perform public.notificar(
    p_space       => new.space_id,
    p_tipo        => 'foto_aprovada',
    p_ator        => coalesce(auth.uid(), new.enviada_por),
    p_dados       => jsonb_build_object('tipo', new.tipo, 'legenda', new.legenda),
    p_entidade    => 'foto',
    p_entidade_id => new.id,
    p_rota        => '/fotos'
  );

  return new;
end;
$$;

create trigger foto_notifica_aprovada
  after update of aprovada_em on public.foto
  for each row execute function public.notificar_foto_aprovada();

-- ----------------------------------------------------------------------------
-- Storage
--
-- O bucket é PRIVADO: uma foto de casal com URL pública adivinhável é o oposto
-- do que este módulo promete. A tela lê por URL assinada, de curta duração.
--
-- O caminho é `<space_id>/<uuid>.<ext>`, e a primeira pasta ser o espaço é o que
-- torna as policies abaixo possíveis: `storage.objects` não tem `space_id`, e sem
-- essa convenção a única forma de autorizar seria um join com `public.foto` — que
-- ainda não existe no instante do upload, já que o arquivo sobe primeiro.
--
-- E o arquivo sobe primeiro de propósito. Na ordem inversa, um upload que falha
-- deixa uma linha apontando para nada: um card quebrado, visível e sem conserto
-- pela tela. Nesta ordem, o que sobra de um insert que falha é um arquivo órfão —
-- invisível, e que só custa bytes.
-- ----------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'fotos',
  'fotos',
  false,
  -- 50 MB é o teto do plano gratuito do Supabase para um arquivo. O limite vive
  -- aqui além de viver no app porque a validação da tela é conveniência (avisa
  -- antes de gastar a subida) e esta é a que de fato barra.
  52428800,
  array[
    'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif',
    'video/mp4', 'video/quicktime', 'video/webm'
  ]
)
on conflict (id) do nothing;

/*
  O espaço que o caminho anuncia, ou nulo quando ele não anuncia nenhum.

  Existe para as policies não escreverem `((storage.foldername(name))[1])::uuid`
  direto, e o motivo é um jeito específico de quebrar: `storage.objects` é uma
  tabela só, compartilhada por TODOS os buckets. Um cast solto dentro do `using`
  estoura em qualquer caminho que não comece por um uuid — e o `bucket_id =
  'fotos'` ao lado não protege, porque o Postgres não promete avaliar os lados de
  um AND na ordem em que foram escritos. O primeiro bucket que este projeto criar
  para outra coisa (avatares, comprovantes) passaria a receber erro no upload,
  vindo de uma policy que nem é dele.

  Devolver nulo em vez de estourar resolve por construção: `is_space_member(null)`
  é falso, que é a resposta certa para um caminho que não diz de quem é.
*/
create function public.espaco_do_caminho(p_nome text)
returns uuid
language sql
stable
set search_path = ''
as $$
  select case
    when (storage.foldername(p_nome))[1] ~
         '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    then ((storage.foldername(p_nome))[1])::uuid
  end;
$$;

create policy fotos_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'fotos'
    and public.is_space_member(public.espaco_do_caminho(name))
  );

create policy fotos_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'fotos'
    and public.is_space_member(public.espaco_do_caminho(name))
  );

/*
  Apagar o arquivo é de quem o subiu ou do admin do espaço, espelhando
  `foto_delete`. `owner_id` é gravado pelo Storage com o uid de quem fez o upload;
  a comparação é com texto porque a coluna é text, não uuid.
*/
create policy fotos_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'fotos'
    and public.is_space_member(public.espaco_do_caminho(name))
    and (
      owner_id = auth.uid()::text
      or public.is_space_admin(public.espaco_do_caminho(name))
    )
  );
