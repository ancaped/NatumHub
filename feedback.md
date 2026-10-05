# Nexus — Playbook e Espelho de Feedbacks

> **Fonte oficial da verdade:** PostgreSQL, database `natumhub`. Credenciais em `Saves/postgres.env`.
> **Atualizado automaticamente:** 05/10/2026, 08:27:00

---

## 📋 1. Fila de Trabalho Ativa (queued / in_progress)

| Prio | ID Completo | ID Curto | Solicitante | Data/Hora | Tipo | Página | Status | Descrição | Notas Admin |
| ---: | ----------- | -------- | ----------- | --------- | ---- | ------ | ------ | --------- | ----------- |
| **100** | `rtx125e5nvj` | `rtx125e5` | EdsonFerrari | 2026-09-23 13:06:55 | 🔴 Bug | Compras > Matéria-Prima | `queued` | Vamos la, Criar uma aba chamada itens semelhantes, vai acontecer o seguinte, todos itens que eu marcar como semelhante, você deve juntar o estoque dos dois nessa aba, assim, fica facil pra mim saber qual o estoque real desses itens semelhantes | - |
| **101** | `s52yeds57lb` | `s52yeds5` | EdsonFerrari | 2026-09-29 01:06:48 | 🔵 Sugestão/Feedback | Acomapnhaento de producao > Quadros | `queued` | Algumas pequenas ideias de otimizacao visual e de usuabilidade para otimizar a experiencia quadro a quadro   Quadro Pesagem    botoes que contem nomes, como concluir producao, p fila, deveria ser apenas icones, nada mais , reduzindo assim o tamanho do quadro, digo isso em todos os quadros, producao, rotulagem, envase e ordens, vamos otimizar para melhorar a experiencia   Data da abertura da ordem deveria ser corrigida, me parece muito errada.  quando eu adiar um item deveria mostrar ele ainda na data anterior, mas como adiado apenas, tendo um historico assim dos itens adiados, podendo ver se o planejamento foi completo ou nao  por exemplo, botao concluir producao, deveria ser apenas concluir, marcando o planejamento como realizar, certo , isso nos outros quadros tbm   Quadro de producao  tirar esse botao ligar caldeira, nao precisamos dele, como falando anteriormente, precisamos apenas saber o que foi concluido ou nao, adiado ou nao, se foi concluido, significa que a caldeira foi ligada no dia, nao precisamos do horario especifico agora pra isso   Quadro de rotulagem  apenas implementar o que foi sugerido anteriormente, melhorando a coesao  Quadro Envase   implementar o que foi sugerido anteriormente, podemos, remover essa parte chamada conforme, onde mostra o ph,   remover por hora essa parte de historico de lote dos itens, em todos os quadros, manter apenas a informacao de quando foi adicionado e os detalhes do lote em si, que seria o botao de olho, entao, mostrando detalhes de quando foi pra pesagem, quando foi pra producao, quando foi rotulado e quando foi envasado, estimativa de envase, e depois que a ordem tiver fechada no sistema, mostrar a quantidade real envasada, tendo assim um historico de aproveitamento de massa.  Botao onde aparece programado, em espera, envasado e etc, precisa ser removido, ter apenas o botao pausa, se caso o motivo da pausa for envase parcial, poderemos colocar a quantidade envasada e o motivo de nao ter envasado o restante.  no mais precisamos apenas melhorar coesao visual ajustando para ficar mais produtivo e dinamico, o visual dos quadros esta bom, precisamos de microajustes de coesao para melhorar a usuabilidade | - |

---

## 🟡 2. Triagem (Novos Feedbacks Submetidos - pending)

_Nenhum item em triagem no momento._

---

## 🔵 3. Em Aberto (Aguardando Revisão do Supervisor - awaiting_review)

| Prio | ID Completo | ID Curto | Solicitante | Data/Hora | Tipo | Página | Status | Descrição | Notas Admin |
| ---: | ----------- | -------- | ----------- | --------- | ---- | ------ | ------ | --------- | ----------- |
| **101** | `96i9uzlnw78` | `96i9uzln` | EdsonFerrari | 2026-09-30 20:41:14 | 🔵 Sugestão/Feedback | Produção > Gerenciamento > Fila de Produção | `awaiting_review` | quero modificar como a fila de produção funciona, regras para a conclusão desse feedback.   Primeiro : analise o feedback e tente entende-lo, fazendo perguntas e tirando duvidas  Segundo: Monte um planejamento e mostre visualmente como ficaria, vou passar ajustes necessarios e você implemente logo depois  Por ultimo : verifique se econtrou algum erro de implementação ou codigo e conserte.  Vamos alterar de fila de produção, para planejamento semanal de ordem, quero um quadro completo de segunda a sexta, levando em conta o caledario brasileiro e respeitando feriados, ok ?   Nesse quadro precisamos do seguinte  Primeira coluna, reatores:   aqui, vamos colocar os reatores da produção, seriam os seguintes:  100kg 250kg 500kg 1000kg 40kg - produções quentes e pequenas  como forma de exemplo usaremos esses atualmente, então posteriormente vou passar os corretos e suas utilidades reais   ai nas nomeações de coluna acima ficariam de segunda a sexta   reatores seg ter quat quin sex 40kg 100kg 250kg 500kg 1000kg  visualmente seria isso, agora falando de função, aqui vamos tentar interligar ao maximo com o gerenciamento de produção, atualmente, não temos uma correta classificação dos produtos, digamos assim, definição de categorias claras, por exemplo Shampoo de uma mesma base, mascara de uma mesma familia, produção quente, produção frio, produção máxima ou minima permitida, pode envasar até determinado tempo e etc, entende, atualmente não temos isso, e tambem o calculo de insumo da produção pra semana, atualmente conseguimos fazer apenas planejamento diario, mais nada, precisamos melhorar nisso  seja associando os dados dos insumos, por exemplo, esses shampoos tais tem a mesma formulação, alterando apenas a fragancia, então, poderemos tirar uma base e produzir eles em determinado dia e etc   no quadro eu colocaria uma produção por tanque, diariamente, e organizaria a semana. Então, eu posso fazer isso manualmente, adicionando produto a produto em gerenciamento de produção, ou quero que ter uma opção para gerenciamento automatico desse planejamento, tipo, voce cria um codigo euristico e determina a melhor organização de produção da semana, organizando os insumos, verificando a previsão de chegada dos insumos em pedidos, para evitar ao maximo rupturas de produtos e afins, em gerenciamento de produção a gente tem o que é objetivo, mas com os dados dos reatores, teremos como maximizar para usar sempre o maximo dos reatores, consegue entender ? | - |

---

## ⛔ 4. Reprovados / Não Aplicáveis (wont_fix)

| Prio | ID Curto | Solicitante | Tipo | Página | Motivo / Descrição |
| ---: | -------- | ----------- | ---- | ------ | ------------------ |
| **100** | `h5rdv5ra` | EdsonFerrari | 🔴 Bug | Qualidade > POPs | ola |

---

## 🟢 5. Finalizados Recentes (resolved)

| Prio | ID Curto | Solicitante | Tipo | Página | Resolvido em |
| ---: | -------- | ----------- | ---- | ------ | ------------ |
| **100** | `qmw31vx3` | EdsonFerrari | 🔴 Bug | administrativo > Acompanhamento de produção | 2026-09-22 12:52:30 |
| **100** | `zsejjfts` | EdsonFerrari | 🔴 Bug | Produção > Gerenciamento > Gerenciamento de Produção | 2026-09-22 12:52:40 |
| **100** | `pcnu4r91` | EdsonFerrari | 🔴 Bug | Administrativo > Acompanhamento de produção | 2026-09-22 12:52:49 |
| **100** | `6heezu14` | EdsonFerrari | 🔴 Bug | acompanhamento de produção > solicitações e aguardando lote erp | 2026-09-18 13:15:04 |
| **100** | `k056d5a2` | Larissa | 🔵 Sugestão/Feedback | ADMINISTRATIVO > Acompanhamento de produção | 2026-09-16 19:07:40 |
| **100** | `wlg2oxeq` | EdsonFerrari | 🔵 Sugestão/Feedback | Acompanhamento de Producao  | 2026-09-16 19:07:47 |
| **100** | `nve8n7tq` | EdsonFerrari | 🔵 Sugestão/Feedback | Administrativo > Acompanhamento de produção | 2026-09-11 00:19:54 |
| **100** | `osbo0xmy` | EdsonFerrari | 🔵 Sugestão/Feedback | administrativo > acompanhamento de produção | 2026-09-11 00:19:36 |
| **100** | `zd6hgls9` | EdsonFerrari | 🔵 Sugestão/Feedback | Administrativo > Acompanhamento de producao | 2026-09-03 20:53:19 |
| **100** | `y9tylb93` | EdsonFerrari | 🔴 Bug | Produção > Kits > Vendas > Vendas Geral | 2026-09-04 13:26:01 |

