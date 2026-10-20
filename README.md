# Atual Sucatas

Site e painel da **Atual Comércio de Sucatas**, desmanche credenciado pelo DETRAN-SC em Chapecó - SC.
Peças automotivas originais usadas, com garantia e nota fiscal, e envio para todo o Brasil.

## Links para ver o projeto

| O quê | Link |
| --- | --- |
| **Site da loja** | https://cauamigueldev.github.io/Atual-Sucatas/site/ |
| **Painel da loja** | https://cauamigueldev.github.io/Atual-Sucatas/painel/ |
| **Nota fiscal de exemplo (PDF)** | https://cauamigueldev.github.io/Atual-Sucatas/exemplos/nota-fiscal-exemplo-Pablo.pdf |

O endereço principal, https://cauamigueldev.github.io/Atual-Sucatas/, abre o site direto.

## Como testar

**Site**
- Navegue pelas seções: procedência, peças, pátio, como comprar, dúvidas e contato.
- Os botões de orçamento abrem o WhatsApp da loja com a mensagem pronta.
- Clique em **Rastrear pedido** (no menu) e digite `AS-1024` ou `QB123456789BR` para ver o acompanhamento de um pedido de exemplo.

**Painel**
- No primeiro acesso, o painel pede para **criar um usuário e uma senha**. Depois disso, é só entrar com eles.
- Já vêm 4 pedidos de exemplo (AS-1021 a AS-1024) para testar.
- Em cada pedido dá para editar cliente, peças, entrega e rastreio, gerar a nota fiscal em PDF e enviar mensagens prontas no WhatsApp do cliente.
- A tela **Notas fiscais** mostra quantas notas foram emitidas no mês, o valor total e quais já foram enviadas.

> Os pedidos de exemplo usam o WhatsApp da própria loja como número do cliente. Assim, nos testes, as mensagens chegam para a loja e não para outra pessoa.

## Estrutura

```
site/            site da loja (página pública)
painel/          painel da loja (pedidos, notas fiscais, mensagens)
compartilhado/   dados dos pedidos, usados pelo site (rastreio) e pelo painel
assets/          logo e fotos do pátio
exemplos/        nota fiscal de exemplo em PDF
index.html       abre o site
```

O painel usa o mesmo estilo visual do site (`site/style.css`) e tem os próprios arquivos em `painel/`.

## Situação atual (protótipo para aprovação)

Já funciona:
- Site completo, adaptado para computador e celular.
- Painel com login, pedidos, entregas, notas fiscais e mensagens de WhatsApp.
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
