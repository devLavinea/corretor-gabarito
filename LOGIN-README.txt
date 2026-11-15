LOGIN E AUTORIZAÇÃO

- A página inicial agora é a tela de login.
- Login por e-mail/senha e Google.
- O app consulta a coleção professores pelo campo Email (capital E).
- Somente quando encontra o e-mail, mostra o sistema e a saudação usando Nome.
- E-mail não cadastrado é desconectado e recebe aviso.
- Para liberar um professor, cadastre na coleção professores um documento com campos:
  Email: e-mail exato da conta Google/Firebase
  Nome: nome completo para saudação
- O cadastro de conta Firebase não adiciona automaticamente o professor à lista autorizada.
- Confira firestore.rules antes de publicar. Para segurança completa, as regras de
  todas as coleções de dados devem validar vínculo/UID do professor; estas regras
  exigem autenticação por e-mail, mas não isolam os dados entre professores.
