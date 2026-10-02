# Firebase — Corretor Marineide

## 1. Configurar o aplicativo Web

No Firebase Console, abra:

**Configurações do projeto → Seus aplicativos → Aplicativo da Web**

Os dados usados pelo aplicativo ficam em:

```text
src/firebase.ts
```

## 2. Ativar autenticação anônima

Abra:

**Authentication → Sign-in method → Anonymous → Ativar**

A professora não precisa criar uma conta. O sistema inicia uma sessão anônima para acessar o Firestore.

## 3. Criar o Firestore

Abra **Firestore Database → Criar banco de dados**.

As coleções são criadas conforme os dados são cadastrados. O aplicativo utiliza:

- `turmas`
- `alunos`
- `avaliacoes`
- `resultados`
- `notas`
- `configuracoes`

## 4. Regras do Firestore

O arquivo `firestore.rules` está incluído no projeto. A versão atual contempla `alunos`, `resultados` e `avaliacoes`.

Como o aplicativo também utiliza `turmas`, `notas` e `configuracoes`, confirme que essas coleções também estão contempladas nas regras publicadas antes de usar o sistema em produção.

**Não use `allow read, write: if true` em produção.**

## 5. Se aparecer `auth/operation-not-allowed`

Isso significa que o login anônimo ainda não foi ativado. Volte ao passo 2.

## 6. Se aparecer `permission-denied`

Verifique se:

1. a autenticação anônima está ativa;
2. as regras publicadas estão atualizadas;
3. as coleções utilizadas pelo aplicativo estão contempladas nas regras.
