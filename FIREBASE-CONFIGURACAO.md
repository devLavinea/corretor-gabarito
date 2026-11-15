# Configuração Firebase — Corretor Gabarito

## 1. Authentication
No Firebase Console > Authentication > Método de login, mantenha ativado:
- E-mail/senha
- Google (se utilizado)

## 2. Professores autorizados
Na coleção `professores`, a administração deve manter um documento de autorização por professor, com:
- `Email`: e-mail exato da conta usada no Firebase Authentication
- `Nome`: nome completo do professor

O documento administrativo pode ter ID aleatório. O aplicativo consulta esse registro pelo campo `Email` e cria/atualiza, após validar o cadastro, o vínculo individual em `professores/{UID}`.

O vínculo individual contém `Email`, `Nome`, `uid` e `authorizedDocId`. Não apague manualmente os documentos de vínculo enquanto o professor estiver usando o sistema.

## 3. Publicar as regras
No Firebase Console > Firestore Database > Regras:
1. Substitua todo o conteúdo pelas regras do arquivo `firestore.rules`.
2. Clique em **Publicar**.
3. Aguarde a confirmação da publicação.

As regras permitem ler o cadastro administrativo correspondente ao e-mail autenticado, criar o vínculo UID somente quando ele aponta para um cadastro administrativo existente com o mesmo e-mail, e acessar as coleções de trabalho somente com esse vínculo.

## 4. Como o primeiro acesso funciona
1. A administração cadastra previamente o e-mail do professor em `professores`.
2. O professor cria a conta ou entra com a conta já existente.
3. O aplicativo verifica o e-mail na lista autorizada.
4. Se autorizado, cria/atualiza `professores/{UID}`.
5. Com o vínculo validado, o professor pode cadastrar, editar e excluir turmas, alunos, avaliações, resultados, notas e configurações.

## Importante
- Não publique regras que liberem `read, write` para qualquer pessoa autenticada.
- Não exclua os documentos existentes em `turmas`, `alunos`, `avaliacoes`, `resultados`, `notas` ou `configuracoes`.
- A lista de autorização em `professores` deve ser mantida pela administração.
- Os dados de trabalho continuam compartilhados entre os professores autorizados, conforme a estrutura atual do aplicativo; esta correção não faz separação de dados por professor.
