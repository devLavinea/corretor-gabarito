# Configuração Firebase — Corretor Gabarito

## Authentication
No Firebase Console > Authentication > Método de login, mantenha ativados:
- E-mail/senha
- Google

O login anônimo não é mais usado pelo aplicativo.

## Professores autorizados
Na coleção `professores`, cada professor deve ter um documento com os campos:
- `Email`: e-mail da conta Google ou e-mail que usará no login (mesmo e-mail; comparação sem distinção de maiúsculas/minúsculas no app)
- `Nome`: nome completo que aparecerá na saudação

Exemplo: `Email: lavinea2411@gmail.com`, `Nome: Lavinea Souza Santos`.

O documento pode ter ID aleatório. Após o primeiro login autorizado, o app cria também um documento de vínculo com ID igual ao UID do Firebase Authentication.

## Regras
Copie o conteúdo de `firestore.rules` para Firebase Console > Firestore Database > Regras e publique.
As regras bloqueiam usuários sem vínculo. Professores não podem alterar/excluir a lista de autorização; o vínculo de UID é criado pelo app no primeiro acesso validado.

## Observação sobre cadastro
A opção “Cadastre-se” cria a conta no Authentication, mas só libera o sistema se o e-mail já estiver na coleção `professores`. Se não estiver, o app encerra a sessão e informa que o e-mail não está autorizado.
