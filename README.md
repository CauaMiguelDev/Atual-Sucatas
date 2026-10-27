# Atual Sucatas

Site e painel da **Atual Comércio de Sucatas**, desmanche credenciado pelo DETRAN-SC em Chapecó - SC.
Peças automotivas originais usadas, com garantia e nota fiscal, e envio para todo o Brasil.

## Links para ver o projeto

| O quê | Link |
| --- | --- |
| **Site da loja** | https://cauamigueldev.github.io/Atual-Sucatas/site/ |
| **Painel da loja** | https://cauamigueldev.github.io/Atual-Sucatas/painel/ |
| **Nota fiscal de exemplo (PDF)** | https://cauamigueldev.github.io/Atual-Sucatas/exemplos/nota-fiscal-exemplo-Pablo.pdf |
| **Nota do pedido de exemplo (PDF)** | https://cauamigueldev.github.io/Atual-Sucatas/exemplos/nota-do-pedido-exemplo-Pablo.pdf |

O endereço principal, https://cauamigueldev.github.io/Atual-Sucatas/, abre o site direto.

## Como testar

**Site**
- Navegue pelas seções: procedência, peças, pátio, envio para todo o Brasil, como comprar, dúvidas e contato.
- Os botões de orçamento abrem o WhatsApp da loja com a mensagem pronta.
- Clique em **Rastrear pedido** (no menu) e digite o código de um pedido ou o código de rastreio para ver o acompanhamento.

**Painel**
- No primeiro acesso, o painel pede para **criar um usuário e uma senha**. Depois disso, é só entrar com eles.
- O painel começa **vazio**. Use **Novo pedido** para cadastrar. Em Configurações dá para **apagar todos os pedidos**, e cada pedido tem **Apagar pedido**.
- No topo da tela de pedidos, o guia **Como atender um pedido pelo painel** resume o processo em 4 passos.
- Cada pedido mostra o **próximo passo** (enviar confirmação, emitir nota, enviar nota, avisar entrega) com um botão que leva direto para ele.
- Na aba **Notas**, a nota fiscal é feita **passo a passo**: conferir o cliente, conferir peças e pagamento, gerar e conferir o PDF, enviar ao cliente.
- A **nota do pedido** é um resumo em PDF (não fiscal) com peças, valores, pagamento, entrega e andamento, que pode ir junto com a confirmação.
- No computador, o botão do WhatsApp só abre a conversa com a mensagem pronta: baixar o PDF é opcional. No celular, o PDF vai junto pelo compartilhamento, sem baixar nada.
- Se o painel estiver aberto em mais de uma aba, todas mostram as mudanças na hora, sem recarregar.
- As mensagens de WhatsApp levam o pedido completo: peças com valores, frete, total, pagamento, entrega, andamento e link de rastreio.
- A tela **Notas fiscais** mostra quantas notas foram emitidas no mês, o valor total e quais já foram enviadas.


## Estrutura

```
site/            site da loja (página pública)
painel/          painel da loja (pedidos, notas fiscais, mensagens)
compartilhado/   dados dos pedidos, usados pelo site (rastreio) e pelo painel
assets/          logo e fotos do pátio
exemplos/        nota fiscal e nota do pedido de exemplo em PDF
index.html       abre o site
```

O painel usa o mesmo estilo visual do site (`site/style.css`) e tem os próprios arquivos em `painel/`.

## Situação atual (protótipo para aprovação)

Já funciona:
- Site completo, adaptado para computador e celular.
- Painel com login, pedidos, entregas, nota do pedido, nota fiscal passo a passo e mensagens de WhatsApp.
- Rastreio do pedido no site, por código do pedido ou código de rastreio.
- Nota fiscal em PDF no layout DANFE, com os dados e o CNPJ da loja.

Depende da aprovação do dono para a próxima etapa:
- **Servidor e banco de dados:** hoje os pedidos e o login ficam salvos só no navegador de quem usa o painel. Com servidor, funcionam em qualquer aparelho e o cliente consegue rastrear o pedido do próprio celular.
- **Emissão oficial da NF-e:** o PDF é uma pré-visualização marcada como "sem valor fiscal". A nota oficial, com chave de acesso e protocolo, sai pela integração com o emissor fiscal da loja.
- **WhatsApp Business API:** para enviar a mensagem e o PDF direto para o número do cliente, sem passos manuais.
- **Domínio próprio:** por exemplo, atualsucatas.com.br.

## Rodar no computador

Na pasta do projeto:

```bash
python -m http.server 5173
```

Depois abra http://localhost:5173 no navegador.
