# Firebase — Corretor Marineide

## 1. Configurar o aplicativo Web

No Firebase Console, abra:

**Configurações do projeto → Seus aplicativos → Aplicativo da Web**

Copie o objeto `firebaseConfig` e coloque os valores reais em:

```text
src/firebase.ts
```

## 2. Ativar autenticação anônima

Abra:

**Authentication → Sign-in method → Anonymous → Ativar**

A professora não precisará fazer login. O próprio sistema cria uma sessão anônima para acessar o Firestore.

## 3. Criar o Firestore

Abra **Firestore Database → Criar banco de dados**.

Não é necessário criar manualmente a coleção `alunos`. Ela será criada quando Marineide cadastrar o primeiro aluno.

## 4. Campos de `alunos`

O sistema usa somente:

- `nome` — string
- `turma` — string
- `criadoEm` — timestamp automático

## 5. Regras do Firestore

O arquivo `firestore.rules` já está incluído. Publique essas regras no Firebase Console ou pelo Firebase CLI.

Elas permitem acesso somente a usuários autenticados:

```text
request.auth != null
```

**Não use `allow read, write: if true` em produção.**

## 6. Se aparecer `auth/operation-not-allowed`

Isso significa que o login anônimo ainda não foi ativado. Volte ao passo 2.

## 7. Se aparecer `permission-denied`

Verifique se as regras publicadas são as mesmas do arquivo `firestore.rules` e se a autenticação anônima está ativa.
