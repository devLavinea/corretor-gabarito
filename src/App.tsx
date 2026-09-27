import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";

import {
  AlertTriangle,
  BookOpen,
  Camera,
  Check,
  ChevronRight,
  FileSpreadsheet,
  FileText,
  GraduationCap,
  Home as HomeIcon,
  Plus,
  Search,
  Trash2,
  UserPlus,
  Users,
  X,
} from "lucide-react";

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  setDoc,
  getDocs,
  serverTimestamp,
} from "firebase/firestore";

import { signInAnonymously } from "firebase/auth";

import { db, auth } from "./firebase";
import { exportResults } from "./exportExcel";

import GabaritoGenerator from "./GabaritoGenerator";
import OMRScanner from "./OMRScanner";

// ======================================================
// TIPOS
// ======================================================

type Answer = "A" | "B" | "C" | "D";

export type Turma = {
  id: string;
  nome: string;
  ano: number;
};

export type Student = {
  id: string;
  nome: string;
  turmaId: string;
  turmaNome: string;
  turmaAno?: number;

  // Compatibilidade com dados antigos.
  turma?: string;
};

export type Avaliacao = {
  id: string;
  titulo: string;
  disciplina: string;
  turmaId: string;
  turmaNome: string;
  turmaAno: number;
  quantidadeQuestoes: number;
  gabarito: Answer[];
  nomeAtividade?: "Atividade 1" | "Atividade 2" | "Atividade 3";
  notaMaxima?: number;
  bimestre?: string;
  createdAt?: unknown;
};

export type Result = {
  id?: string;

  studentId: string;
  student: string;

  turma: string;
  turmaId?: string;
  turmaAno?: number;

  avaliacaoId?: string;
  avaliacaoNome?: string;
  disciplina?: string;
  nomeAtividade?: "Atividade 1" | "Atividade 2" | "Atividade 3";
  notaMaxima?: number;
  bimestre?: string;

  answers: string[];
  correctAnswers: string[];

  score: number;
  hits: number;
  total: number;

  createdAt?: unknown;
};

type Page =
  | "home"
  | "turmas"
  | "students"
  | "gabarito"
  | "avaliacoes"
  | "setup"
  | "scan"
  | "results"
  | "settings"
  | "review";

const alternatives: Answer[] = ["A", "B", "C", "D"];

// ======================================================
// APP
// ======================================================

export default function App() {
  const [page, setPage] = useState<Page>("home");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [turmas, setTurmas] = useState<Turma[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [avaliacoes, setAvaliacoes] = useState<Avaliacao[]>([]);
  const [results, setResults] = useState<Result[]>([]);

  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);

  const [currentAvaliacao, setCurrentAvaliacao] = useState<Avaliacao | null>(
    null,
  );

  // ====================================================
  // FORMULÁRIO DA AVALIAÇÃO
  // ====================================================

  const [disciplina, setDisciplina] = useState("Matemática");
  const [turmaId, setTurmaId] = useState("");
  const [nomeAtividade, setNomeAtividade] = useState<"Atividade 1" | "Atividade 2" | "Atividade 3">("Atividade 1");
  const [notaMaxima, setNotaMaxima] = useState(10);
  const [bimestre, setBimestre] = useState("1º Bimestre");
  const [key, setKey] = useState<Answer[]>(Array(10).fill("A") as Answer[]);

  const [settings, setSettings] = useState({
    atividade1: { nota: 10, questoes: 10 },
    atividade2: { nota: 10, questoes: 10 },
    atividade3: { nota: 10, questoes: 10 },
  });

  // ====================================================
  // ALUNOS
  // ====================================================

  const [search, setSearch] = useState("");
  const [studentTurmaId, setStudentTurmaId] = useState("");
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [savingStudent, setSavingStudent] = useState(false);

  const [deletingStudentId, setDeletingStudentId] = useState<string | null>(
    null,
  );

  // ====================================================
  // TURMAS
  // ====================================================

  const [savingTurma, setSavingTurma] = useState(false);
  const [deletingTurmaId, setDeletingTurmaId] = useState<string | null>(null);

  // ====================================================
  // AVALIAÇÃO
  // ====================================================

  const [savingAvaliacao, setSavingAvaliacao] = useState(false);

  // ====================================================
  // RESULTADO
  // ====================================================

  const [savingResult, setSavingResult] = useState(false);

  // ====================================================
  // CÂMERA
  // ====================================================

  const [cameraOpen, setCameraOpen] = useState(false);
  const [reviewAnswers, setReviewAnswers] = useState<Answer[]>([]);
  const [reviewConfidence, setReviewConfidence] = useState(0);

  // ====================================================
  // FIREBASE
  // ====================================================

  const [firebaseReady, setFirebaseReady] = useState(false);
  const [error, setError] = useState("");

  // ====================================================
  // INICIALIZAÇÃO
  // ====================================================

  useEffect(() => {
    const start = async () => {
      try {
        await signInAnonymously(auth);

        setFirebaseReady(true);

        await Promise.all([
          loadTurmas(),
          loadStudents(),
          loadAvaliacoes(),
          loadResults(),
          loadSettings(),
        ]);
      } catch (err) {
        console.error("ERRO FIREBASE:", err);

        const firebaseError = err as {
          code?: string;
          message?: string;
        };

        setError(
          `Erro Firebase: ${firebaseError.code ?? "desconhecido"} — ${
            firebaseError.message ?? "Não foi possível conectar ao Firebase."
          }`,
        );
      }
    };

    void start();
  }, []);

  // ====================================================
  // CARREGAR TURMAS
  // ====================================================

  async function loadTurmas() {
    try {
      const snapshot = await getDocs(collection(db, "turmas"));

      const data: Turma[] = snapshot.docs
        .map((item) => {
          const raw = item.data();

          return {
            id: item.id,
            nome: String(raw.nome ?? ""),
            ano: Number(raw.ano ?? new Date().getFullYear()),
          };
        })
        .filter((item) => item.nome)
        .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

      setTurmas(data);
    } catch (err) {
      console.error("Erro ao carregar turmas:", err);

      setError("Não foi possível carregar as turmas.");
    }
  }

  // ====================================================
  // CARREGAR ALUNOS
  // ====================================================

  async function loadStudents() {
    try {
      setLoadingStudents(true);

      const snapshot = await getDocs(collection(db, "alunos"));

      const data: Student[] = snapshot.docs
        .map((item) => {
          const raw = item.data();

          const oldTurma = String(raw.turma ?? "");

          return {
            id: item.id,
            nome: String(raw.nome ?? ""),
            turmaId: String(raw.turmaId ?? ""),
            turmaNome: String(raw.turmaNome ?? oldTurma),
            turmaAno:
              raw.turmaAno !== undefined ? Number(raw.turmaAno) : undefined,
            turma: oldTurma || undefined,
          };
        })
        .filter((item) => item.nome)
        .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

      setStudents(data);
    } catch (err) {
      console.error("Erro ao carregar alunos:", err);

      setError("Não foi possível carregar os alunos.");
    } finally {
      setLoadingStudents(false);
    }
  }

  // ====================================================
  // CARREGAR AVALIAÇÕES
  // ====================================================

  async function loadAvaliacoes() {
    try {
      const snapshot = await getDocs(collection(db, "avaliacoes"));

      const data: Avaliacao[] = snapshot.docs
        .map((item) => {
          const raw = item.data();

          const rawKey = Array.isArray(raw.gabarito) ? raw.gabarito : [];

          const gabarito = rawKey.filter((value): value is Answer =>
            alternatives.includes(value),
          );

          return {
            id: item.id,
            titulo: String(raw.titulo ?? "Avaliação"),
            disciplina: String(raw.disciplina ?? ""),
            turmaId: String(raw.turmaId ?? ""),
            turmaNome: String(raw.turmaNome ?? ""),
            turmaAno: Number(raw.turmaAno ?? new Date().getFullYear()),
            quantidadeQuestoes: Number(
              raw.quantidadeQuestoes ?? gabarito.length,
            ),
            gabarito,
            nomeAtividade: raw.nomeAtividade as Avaliacao["nomeAtividade"],
            notaMaxima: Number(raw.notaMaxima ?? 10),
            bimestre: String(raw.bimestre ?? "1º Bimestre"),
            createdAt: raw.createdAt,
          };
        })
        .sort((a, b) => a.titulo.localeCompare(b.titulo, "pt-BR"));

      setAvaliacoes(data);
    } catch (err) {
      console.error("Erro ao carregar avaliações:", err);

      setError("Não foi possível carregar as avaliações.");
    }
  }

  // ====================================================
  // CARREGAR RESULTADOS
  // ====================================================

  async function loadResults() {
    try {
      const snapshot = await getDocs(collection(db, "resultados"));

      const data: Result[] = snapshot.docs.map((item) => ({
        id: item.id,
        ...(item.data() as Omit<Result, "id">),
      }));

      setResults(data);
    } catch (err) {
      console.error("Erro ao carregar resultados:", err);

      setError("Não foi possível carregar os resultados.");
    }
  }

  async function loadSettings() {
    try {
      const snapshot = await getDocs(collection(db, "configuracoes"));
      const found = snapshot.docs.find((item) => item.id === "avaliacoes");
      if (found) {
        const raw = found.data();
        setSettings((current) => ({
          atividade1: { nota: Number(raw.atividade1?.nota ?? current.atividade1.nota), questoes: Number(raw.atividade1?.questoes ?? current.atividade1.questoes) },
          atividade2: { nota: Number(raw.atividade2?.nota ?? current.atividade2.nota), questoes: Number(raw.atividade2?.questoes ?? current.atividade2.questoes) },
          atividade3: { nota: Number(raw.atividade3?.nota ?? current.atividade3.nota), questoes: Number(raw.atividade3?.questoes ?? current.atividade3.questoes) },
        }));
      }
    } catch (err) {
      console.error("Erro ao carregar configurações:", err);
    }
  }

  async function saveSettings(next: typeof settings) {
    try {
      await setDoc(doc(db, "configuracoes", "avaliacoes"), next, { merge: true });
      setSettings(next);
      setError("");
    } catch (err) {
      console.error(err);
      setError("Não foi possível salvar as configurações.");
    }
  }

  // ====================================================
  // CADASTRAR TURMA
  // ====================================================

  async function addTurma(nome: string, ano: string) {
    const cleanName = nome.trim();
    const numericYear = Number(ano);

    if (!cleanName) {
      setError("Informe o nome da turma.");
      return;
    }

    if (
      !Number.isInteger(numericYear) ||
      numericYear < 2000 ||
      numericYear > 2100
    ) {
      setError("Informe um ano válido para a turma.");
      return;
    }

    const exists = turmas.some(
      (item) =>
        item.nome.toLowerCase() === cleanName.toLowerCase() &&
        item.ano === numericYear,
    );

    if (exists) {
      setError("Essa turma já está cadastrada nesse ano.");
      return;
    }

    try {
      setSavingTurma(true);
      setError("");

      const ref = await addDoc(collection(db, "turmas"), {
        nome: cleanName,
        ano: numericYear,
        createdAt: serverTimestamp(),
      });

      setTurmas((current) =>
        [
          ...current,
          {
            id: ref.id,
            nome: cleanName,
            ano: numericYear,
          },
        ].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
      );
    } catch (err) {
      console.error(err);
      setError("Não foi possível cadastrar a turma.");
    } finally {
      setSavingTurma(false);
    }
  }

  // ====================================================
  // EXCLUIR TURMA
  // ====================================================

  async function removeTurma(turma: Turma) {
    const hasStudents = students.some(
      (student) => student.turmaId === turma.id,
    );

    if (hasStudents) {
      setError(
        "Não é possível excluir uma turma que ainda possui alunos cadastrados.",
      );
      return;
    }

    if (!window.confirm(`Deseja excluir a turma "${turma.nome}"?`)) {
      return;
    }

    try {
      setDeletingTurmaId(turma.id);
      setError("");

      await deleteDoc(doc(db, "turmas", turma.id));

      setTurmas((current) => current.filter((item) => item.id !== turma.id));

      if (turmaId === turma.id) {
        setTurmaId("");
      }
    } catch (err) {
      console.error(err);
      setError("Não foi possível excluir a turma.");
    } finally {
      setDeletingTurmaId(null);
    }
  }

  // ====================================================
  // CADASTRAR ALUNO
  // ====================================================

  async function addStudent(nome: string, selectedTurmaId: string) {
    const cleanName = nome.trim();

    const turma = turmas.find((item) => item.id === selectedTurmaId);

    if (!cleanName || !turma) {
      setError("Informe o nome do aluno e selecione uma turma.");
      return;
    }

    try {
      setSavingStudent(true);
      setError("");

      const ref = await addDoc(collection(db, "alunos"), {
        nome: cleanName,
        turmaId: turma.id,
        turmaNome: turma.nome,
        turmaAno: turma.ano,
        criadoEm: serverTimestamp(),
      });

      const newStudent: Student = {
        id: ref.id,
        nome: cleanName,
        turmaId: turma.id,
        turmaNome: turma.nome,
        turmaAno: turma.ano,
      };

      setStudents((current) =>
        [...current, newStudent].sort((a, b) =>
          a.nome.localeCompare(b.nome, "pt-BR"),
        ),
      );
    } catch (err) {
      console.error(err);
      setError("Não foi possível cadastrar o aluno.");
    } finally {
      setSavingStudent(false);
    }
  }

  // ====================================================
  // EXCLUIR ALUNO
  // ====================================================

  async function removeStudent(student: Student) {
    if (
      !window.confirm(`Deseja realmente retirar "${student.nome}" da lista?`)
    ) {
      return;
    }

    try {
      setDeletingStudentId(student.id);
      setError("");

      await deleteDoc(doc(db, "alunos", student.id));

      setStudents((current) =>
        current.filter((item) => item.id !== student.id),
      );

      if (selectedStudent?.id === student.id) {
        setSelectedStudent(null);
      }
    } catch (err) {
      console.error(err);
      setError("Não foi possível retirar o aluno.");
    } finally {
      setDeletingStudentId(null);
    }
  }

  // ====================================================
  // ALTERAR GABARITO
  // ====================================================

  function updateKey(index: number, value: Answer) {
    setKey((current) =>
      current.map((answer, position) => (position === index ? value : answer)),
    );
  }

  // ====================================================
  // CRIAR AVALIAÇÃO
  // ====================================================

  async function startEvaluation() {
    const turma = turmas.find((item) => item.id === turmaId);
    const preset = settings[nomeAtividade === "Atividade 1" ? "atividade1" : nomeAtividade === "Atividade 2" ? "atividade2" : "atividade3"];
    const questionCount = preset?.questoes || key.length;
    const configuredScore = preset?.nota || notaMaxima || 10;

    if (!turma) {
      setError("Selecione uma turma.");
      return;
    }

    if (questionCount < 1) {
      setError("Informe uma quantidade válida de questões nas configurações.");
      return;
    }

    const finalKey = key.slice(0, questionCount);
    while (finalKey.length < questionCount) finalKey.push("A");

    try {
      setSavingAvaliacao(true);
      setError("");

      const data = {
        titulo: nomeAtividade,
        nomeAtividade,
        disciplina: disciplina.trim() || "Não informada",
        turmaId: turma.id,
        turmaNome: turma.nome,
        turmaAno: turma.ano,
        quantidadeQuestoes: questionCount,
        gabarito: finalKey,
        notaMaxima: configuredScore,
        bimestre,
        createdAt: serverTimestamp(),
      };

      const ref = await addDoc(collection(db, "avaliacoes"), data);

      const avaliacao: Avaliacao = {
        id: ref.id,
        titulo: data.titulo,
        disciplina: data.disciplina,
        turmaId: data.turmaId,
        turmaNome: data.turmaNome,
        turmaAno: data.turmaAno,
        quantidadeQuestoes: data.quantidadeQuestoes,
        gabarito: [...data.gabarito],
        nomeAtividade: data.nomeAtividade,
        notaMaxima: data.notaMaxima,
        bimestre: data.bimestre,
      };

      setAvaliacoes((current) => [avaliacao, ...current]);

      setCurrentAvaliacao(avaliacao);
      setSelectedStudent(null);
      setPage("scan");
    } catch (err) {
      console.error(err);
      setError("Não foi possível salvar a avaliação.");
    } finally {
      setSavingAvaliacao(false);
    }
  }

  function openReview(answers: Answer[], confidence = 0) {
    setReviewAnswers(answers);
    setReviewConfidence(confidence);
    setPage("review");
  }

  // ====================================================
  // SALVAR CORREÇÃO
  // ====================================================

  async function saveResult(answers: Answer[]) {
    if (!selectedStudent || !currentAvaliacao) {
      setError("Selecione um aluno antes de corrigir a prova.");
      return;
    }

    const normalizedAnswers = currentAvaliacao.gabarito.map(
      (_, index) => answers[index] ?? "A",
    );

    const total =
      currentAvaliacao.quantidadeQuestoes || currentAvaliacao.gabarito.length;

    const hits = normalizedAnswers.reduce(
      (count, answer, index) =>
        count + (answer === currentAvaliacao.gabarito[index] ? 1 : 0),
      0,
    );

    const score = Number(((hits / Math.max(total, 1)) * (currentAvaliacao.notaMaxima ?? 10)).toFixed(2));

    const result: Result = {
      studentId: selectedStudent.id,
      student: selectedStudent.nome,
      turma: currentAvaliacao.turmaNome,
      turmaId: currentAvaliacao.turmaId,
      turmaAno: currentAvaliacao.turmaAno,
      avaliacaoId: currentAvaliacao.id,
      avaliacaoNome: currentAvaliacao.titulo,
      disciplina: currentAvaliacao.disciplina,
      nomeAtividade: currentAvaliacao.nomeAtividade,
      notaMaxima: currentAvaliacao.notaMaxima,
      bimestre: currentAvaliacao.bimestre,
      answers: normalizedAnswers,
      correctAnswers: currentAvaliacao.gabarito,
      score,
      hits,
      total,
    };

    try {
      setSavingResult(true);
      setError("");

      const ref = await addDoc(collection(db, "resultados"), {
        ...result,
        criadoEm: serverTimestamp(),
      });

      setResults((current) => [
        {
          ...result,
          id: ref.id,
        },
        ...current,
      ]);

      setPage("results");
    } catch (err) {
      console.error(err);
      setError("Não foi possível salvar a correção.");
    } finally {
      setSavingResult(false);
    }
  }

  // ====================================================
  // FILTRO DOS ALUNOS
  // ====================================================

  const filteredStudents = useMemo(() => {
    const term = search.trim().toLowerCase();

    return students.filter((student) => {
      const matchesSearch =
        !term ||
        student.nome.toLowerCase().includes(term) ||
        student.turmaNome.toLowerCase().includes(term);

      const matchesTurma =
        !studentTurmaId || student.turmaId === studentTurmaId;

      return matchesSearch && matchesTurma;
    });
  }, [students, search, studentTurmaId]);

  // ====================================================
  // ALUNOS DA AVALIAÇÃO
  // ====================================================

  const filteredForEvaluation = useMemo(
    () =>
      students.filter(
        (student) => student.turmaId === currentAvaliacao?.turmaId,
      ),
    [students, currentAvaliacao],
  );

  // ====================================================
  // EXPORTAR
  // ====================================================

  function handleExport() {
    try {
      exportResults(results, avaliacoes, students, "resultados.xlsx");
    } catch (err) {
      console.error(err);

      setError("Não foi possível exportar os resultados.");
    }
  }

  // ====================================================
  // INTERFACE
  // ====================================================

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-30 border-b bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3">
          <button
            onClick={() => setPage("home")}
            className="flex items-center gap-3 text-left"
          >
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-blue-600 text-white shadow-sm">
              <GraduationCap size={23} />
            </span>

            <span>
              <b className="block text-lg">Corretor Marineide</b>

              <small className="text-slate-500">
                Sistema exclusivo da professora
              </small>
            </span>
          </button>

          <nav className="hidden items-center gap-1 md:flex">
            <NavButton
              active={page === "home"}
              icon={<HomeIcon size={17} />}
              label="Início"
              onClick={() => setPage("home")}
            />

            <NavButton
              active={page === "turmas"}
              icon={<GraduationCap size={17} />}
              label="Turmas"
              onClick={() => setPage("turmas")}
            />

            <NavButton
              active={page === "students"}
              icon={<Users size={17} />}
              label="Alunos"
              onClick={() => setPage("students")}
            />

            <NavButton
              active={page === "gabarito"}
              icon={<FileText size={17} />}
              label="Gabarito"
              onClick={() => setPage("gabarito")}
            />
            <NavButton active={page === "avaliacoes"} icon={<BookOpen size={17} />} label="Avaliações" onClick={() => setPage("avaliacoes")} />

            <NavButton
              active={page === "setup" || page === "scan"}
              icon={<BookOpen size={17} />}
              label="Nova avaliação"
              onClick={() => setPage("setup")}
            />

            <NavButton
              active={page === "results"}
              icon={<FileSpreadsheet size={17} />}
              label="Resultados"
              onClick={() => setPage("results")}
            />

            <NavButton
              active={page === "settings"}
              icon={<BookOpen size={17} />}
              label="Configurações"
              onClick={() => setPage("settings")}
            />
          </nav>

          <span
            className={`hidden rounded-full px-3 py-1 text-xs font-bold sm:inline-flex ${
              firebaseReady
                ? "bg-emerald-50 text-emerald-700"
                : "bg-amber-50 text-amber-700"
            }`}
          >
            {firebaseReady ? "Firebase conectado" : "Conectando..."}
          </span>
        </div>

        <div className="border-t bg-white px-3 py-2 md:hidden">
          <button
            type="button"
            onClick={() => setMobileMenuOpen((value) => !value)}
            className="flex w-full items-center justify-between rounded-2xl bg-slate-50 px-4 py-3 text-sm font-black"
          >
            <span>Menu</span>
            <span>{mobileMenuOpen ? "Fechar" : "Abrir"}</span>
          </button>
          {mobileMenuOpen && (
            <div className="mt-2 grid grid-cols-2 gap-2 pb-1">
              {[["Início", () => setPage("home"), <HomeIcon size={18}/>], ["Turmas", () => setPage("turmas"), <GraduationCap size={18}/>], ["Alunos", () => setPage("students"), <Users size={18}/>], ["Gabarito", () => setPage("gabarito"), <FileText size={18}/>], ["Avaliações", () => setPage("avaliacoes"), <BookOpen size={18}/>], ["Avaliação", () => setPage("setup"), <BookOpen size={18}/>], ["Resultados", () => setPage("results"), <FileSpreadsheet size={18}/>], ["Configurações", () => setPage("settings"), <BookOpen size={18}/>]].map(([label, action, icon]) => (
                <button key={String(label)} onClick={() => { (action as () => void)(); setMobileMenuOpen(false); }} className="flex items-center gap-3 rounded-2xl border bg-white p-3 text-left text-sm font-bold">{icon as ReactNode}<span>{String(label)}</span></button>
              ))}
            </div>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6">
        {error && (
          <div className="mb-5 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            <AlertTriangle className="mt-0.5 shrink-0" size={18} />

            <div className="flex-1">{error}</div>

            <button onClick={() => setError("")}>
              <X size={17} />
            </button>
          </div>
        )}

        {page === "home" && (
          <Home
            studentsCount={students.length}
            turmasCount={turmas.length}
            resultsCount={results.length}
            avaliacoesCount={avaliacoes.length}
            onTurmas={() => setPage("turmas")}
            onStudents={() => setPage("students")}
            onGabarito={() => setPage("gabarito")}
            onNew={() => setPage("setup")}
            onResults={() => setPage("results")}
          />
        )}

        {page === "turmas" && (
          <TurmasPage
            turmas={turmas}
            students={students}
            saving={savingTurma}
            deletingId={deletingTurmaId}
            onAdd={addTurma}
            onDelete={removeTurma}
          />
        )}

        {page === "students" && (
          <Students
            students={filteredStudents}
            turmas={turmas}
            selectedTurmaId={studentTurmaId}
            setSelectedTurmaId={setStudentTurmaId}
            search={search}
            setSearch={setSearch}
            loading={loadingStudents}
            saving={savingStudent}
            deletingId={deletingStudentId}
            onAdd={addStudent}
            onDelete={removeStudent}
            onGoTurmas={() => setPage("turmas")}
          />
        )}

        {page === "gabarito" && (
          <section className="mx-auto max-w-6xl">
            <div className="mb-6">
              <p className="text-sm font-bold text-blue-600">GABARITO</p>

              <h2 className="mt-1 text-3xl font-black">Folha de respostas</h2>

              <p className="mt-2 max-w-3xl text-slate-500">
                Este é o modelo de folha de respostas utilizado pelo leitor OMR.
                Imprima e entregue aos alunos.
              </p>
            </div>

            <GabaritoGenerator />
          </section>
        )}

        {page === "avaliacoes" && (
          <AvaliacoesPage
            avaliacoes={avaliacoes}
            onUpdate={(updated) => {
              setAvaliacoes((current) => current.map((item) => item.id === updated.id ? updated : item));
            }}
          />
        )}

        {page === "setup" && (
          <Setup
            nomeAtividade={nomeAtividade}
            setNomeAtividade={setNomeAtividade}
            notaMaxima={notaMaxima}
            setNotaMaxima={setNotaMaxima}
            bimestre={bimestre}
            setBimestre={setBimestre}
            disciplina={disciplina}
            setDisciplina={setDisciplina}
            turmaId={turmaId}
            setTurmaId={setTurmaId}
            turmas={turmas}
            keyAnswers={key}
            updateKey={updateKey}
            onNext={() => void startEvaluation()}
            saving={savingAvaliacao}
          />
        )}

        {page === "review" && currentAvaliacao && selectedStudent && (
          <ReviewPage
            avaliacao={currentAvaliacao}
            student={selectedStudent}
            answers={reviewAnswers}
            confidence={reviewConfidence}
            onChange={(index, value) => setReviewAnswers((current) => current.map((item, i) => i === index ? value : item))}
            onBack={() => setPage("scan")}
            onConfirm={() => void saveResult(reviewAnswers)}
            saving={savingResult}
          />
        )}

        {page === "scan" && currentAvaliacao && (
          <ScanPage
            avaliacao={currentAvaliacao}
            selectedStudent={selectedStudent}
            students={filteredForEvaluation}
            onSelectStudent={(student) => setSelectedStudent(student)}
            onOpenCamera={() => setCameraOpen(true)}
            onSimulate={() => void saveResult(currentAvaliacao.gabarito)}
            onBack={() => setPage("setup")}
            saving={savingResult}
          />
        )}

        {page === "settings" && (
          <SettingsPage settings={settings} onSave={saveSettings} />
        )}

        {page === "results" && (
          <Results
            results={results}
            avaliacoes={avaliacoes}
            turmas={turmas}
            onExport={handleExport}
          />
        )}
      </main>

      {cameraOpen && (
        <OMRScanner
          onClose={() => setCameraOpen(false)}
          onDetected={(answers) => {
            setCameraOpen(false);
            openReview(answers);
          }}
        />
      )}
    </div>
  );
}

// ======================================================
// BOTÃO DO MENU
// ======================================================

function NavButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold transition ${
        active
          ? "bg-blue-50 text-blue-700"
          : "text-slate-600 hover:bg-slate-100"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

// ======================================================
// HOME
// ======================================================

function Home({
  studentsCount,
  turmasCount,
  resultsCount,
  avaliacoesCount,
  onTurmas,
  onStudents,
  onGabarito,
  onNew,
  onResults,
}: {
  studentsCount: number;
  turmasCount: number;
  resultsCount: number;
  avaliacoesCount: number;
  onTurmas: () => void;
  onStudents: () => void;
  onGabarito: () => void;
  onNew: () => void;
  onResults: () => void;
}) {
  return (
    <section className="space-y-6">
      <div className="rounded-3xl bg-blue-600 p-7 text-white shadow-lg md:p-10">
        <p className="text-sm font-bold uppercase tracking-wider text-blue-100">
          Sistema exclusivo
        </p>

        <h1 className="mt-2 text-3xl font-black md:text-5xl">
          Corretor da professora Marineide
        </h1>

        <p className="mt-4 max-w-2xl leading-7 text-blue-100">
          Cadastre suas turmas e alunos, crie avaliações, leia os gabaritos
          automaticamente e acompanhe os resultados.
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            onClick={onNew}
            className="inline-flex items-center gap-2 rounded-2xl bg-white px-5 py-3 font-black text-blue-700"
          >
            <Plus size={18} />
            Nova avaliação
          </button>

          <button
            onClick={onGabarito}
            className="inline-flex items-center gap-2 rounded-2xl bg-blue-500 px-5 py-3 font-black text-white"
          >
            <FileText size={18} />
            Gabarito
          </button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Turmas"
          value={turmasCount}
          icon={<GraduationCap />}
          onClick={onTurmas}
        />

        <StatCard
          title="Alunos"
          value={studentsCount}
          icon={<Users />}
          onClick={onStudents}
        />

        <StatCard
          title="Avaliações"
          value={avaliacoesCount}
          icon={<BookOpen />}
          onClick={onNew}
        />

        <StatCard
          title="Correções"
          value={resultsCount}
          icon={<Check />}
          onClick={onResults}
        />
      </div>

      <div className="grid gap-5 md:grid-cols-3">
        <QuickCard
          icon={<GraduationCap />}
          title="Turmas"
          text="Cadastre suas turmas informando somente o nome e o ano."
          button="Gerenciar turmas"
          onClick={onTurmas}
        />

        <QuickCard
          icon={<UserPlus />}
          title="Alunos"
          text="Cadastre os alunos e vincule cada um à sua turma."
          button="Gerenciar alunos"
          onClick={onStudents}
        />

        <QuickCard
          icon={<Camera />}
          title="Correção"
          text="Crie uma avaliação, selecione o aluno e leia a folha pelo OMR."
          button="Nova avaliação"
          onClick={onNew}
        />
      </div>
    </section>
  );
}

// ======================================================
// CARD DE ESTATÍSTICA
// ======================================================

function StatCard({
  title,
  value,
  icon,
  onClick,
}: {
  title: string;
  value: number;
  icon: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="rounded-3xl border bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
    >
      <span className="grid h-11 w-11 place-items-center rounded-2xl bg-blue-50 text-blue-600">
        {icon}
      </span>

      <p className="mt-5 text-sm font-bold text-slate-500">{title}</p>

      <p className="mt-1 text-3xl font-black">{value}</p>
    </button>
  );
}

// ======================================================
// QUICK CARD
// ======================================================

function QuickCard({
  icon,
  title,
  text,
  button,
  onClick,
}: {
  icon: ReactNode;
  title: string;
  text: string;
  button: string;
  onClick: () => void;
}) {
  return (
    <div className="rounded-3xl border bg-white p-6 shadow-sm">
      <span className="grid h-12 w-12 place-items-center rounded-2xl bg-slate-100 text-blue-600">
        {icon}
      </span>

      <h2 className="mt-5 text-xl font-black">{title}</h2>

      <p className="mt-2 min-h-12 text-sm leading-6 text-slate-500">{text}</p>

      <button
        onClick={onClick}
        className="mt-5 inline-flex items-center gap-2 font-bold text-blue-600"
      >
        {button}
        <ChevronRight size={17} />
      </button>
    </div>
  );
}

// ======================================================
// TURMAS
// ======================================================

function TurmasPage({
  turmas,
  students,
  saving,
  deletingId,
  onAdd,
  onDelete,
}: {
  turmas: Turma[];
  students: Student[];
  saving: boolean;
  deletingId: string | null;
  onAdd: (nome: string, ano: string) => Promise<void>;
  onDelete: (turma: Turma) => Promise<void>;
}) {
  const [nome, setNome] = useState("");
  const [ano, setAno] = useState(String(new Date().getFullYear()));

  async function submit(event: FormEvent) {
    event.preventDefault();

    await onAdd(nome, ano);

    setNome("");
  }

  return (
    <section className="space-y-6">
      <div>
        <p className="text-sm font-bold text-blue-600">MINHAS TURMAS</p>

        <h2 className="mt-1 text-3xl font-black">Turmas</h2>

        <p className="mt-2 text-slate-500">
          Cadastre somente o nome da turma e o ano.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[360px_1fr]">
        <form
          onSubmit={submit}
          className="h-fit rounded-3xl border bg-white p-6 shadow-sm"
        >
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-blue-50 text-blue-600">
              <Plus />
            </span>

            <div>
              <h3 className="font-black">Cadastrar turma</h3>

              <p className="text-xs text-slate-500">
                Salva automaticamente no Firebase
              </p>
            </div>
          </div>

          <label className="mt-6 block">
            <span className="mb-2 block text-sm font-bold">Nome da turma</span>

            <input
              value={nome}
              onChange={(event) => setNome(event.target.value)}
              className="w-full rounded-2xl border px-4 py-3 outline-none focus:border-blue-500"
              placeholder="Ex.: 3° ano B"
            />
          </label>

          <label className="mt-4 block">
            <span className="mb-2 block text-sm font-bold">Ano</span>

            <input
              type="number"
              value={ano}
              onChange={(event) => setAno(event.target.value)}
              className="w-full rounded-2xl border px-4 py-3 outline-none focus:border-blue-500"
            />
          </label>

          <button
            disabled={saving}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 py-3 font-black text-white disabled:opacity-50"
          >
            <Plus size={18} />

            {saving ? "Cadastrando..." : "Cadastrar turma"}
          </button>
        </form>

        <div className="rounded-3xl border bg-white p-5 shadow-sm md:p-6">
          <h3 className="text-xl font-black">Turmas cadastradas</h3>

          <p className="text-sm text-slate-500">{turmas.length} turma(s)</p>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {turmas.length === 0 ? (
              <div className="col-span-full rounded-2xl border border-dashed p-8 text-center text-slate-500">
                Nenhuma turma cadastrada ainda.
              </div>
            ) : (
              turmas.map((turma) => {
                const count = students.filter(
                  (student) => student.turmaId === turma.id,
                ).length;

                return (
                  <div key={turma.id} className="rounded-2xl border p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-black">{turma.nome}</p>

                        <p className="mt-1 text-sm text-slate-500">
                          Ano: {turma.ano}
                          {" • "}
                          {count}
                          {" aluno(s)"}
                        </p>
                      </div>

                      <button
                        onClick={() => void onDelete(turma)}
                        disabled={deletingId === turma.id || count > 0}
                        title={
                          count > 0
                            ? "Retire os alunos antes de excluir a turma"
                            : "Excluir turma"
                        }
                        className="grid h-9 w-9 place-items-center rounded-xl text-red-500 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-30"
                      >
                        <Trash2 size={17} />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

// ======================================================
// ALUNOS
// ======================================================

function Students({
  students,
  turmas,
  selectedTurmaId,
  setSelectedTurmaId,
  search,
  setSearch,
  loading,
  saving,
  deletingId,
  onAdd,
  onDelete,
  onGoTurmas,
}: {
  students: Student[];
  turmas: Turma[];
  selectedTurmaId: string;
  setSelectedTurmaId: (value: string) => void;
  search: string;
  setSearch: (value: string) => void;
  loading: boolean;
  saving: boolean;
  deletingId: string | null;
  onAdd: (nome: string, turmaId: string) => Promise<void>;
  onDelete: (student: Student) => Promise<void>;
  onGoTurmas: () => void;
}) {
  const [nome, setNome] = useState("");
  const [turmaId, setTurmaId] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();

    await onAdd(nome, turmaId);

    setNome("");
    setTurmaId("");
  }

  return (
    <section className="space-y-6">
      <div>
        <p className="text-sm font-bold text-blue-600">MEUS ALUNOS</p>

        <h2 className="mt-1 text-3xl font-black">
          Alunos da professora Marineide
        </h2>

        <p className="mt-2 text-slate-500">
          Cadastre cada aluno já vinculado à sua turma.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[360px_1fr]">
        <form
          onSubmit={submit}
          className="h-fit rounded-3xl border bg-white p-6 shadow-sm"
        >
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-blue-50 text-blue-600">
              <UserPlus />
            </span>

            <div>
              <h3 className="font-black">Cadastrar aluno</h3>

              <p className="text-xs text-slate-500">
                Escolha uma turma já cadastrada
              </p>
            </div>
          </div>

          <label className="mt-6 block">
            <span className="mb-2 block text-sm font-bold">Nome completo</span>

            <input
              value={nome}
              onChange={(event) => setNome(event.target.value)}
              className="w-full rounded-2xl border px-4 py-3 outline-none focus:border-blue-500"
              placeholder="Ex.: Maria Silva"
            />
          </label>

          <label className="mt-4 block">
            <span className="mb-2 block text-sm font-bold">Turma</span>

            <select
              value={turmaId}
              onChange={(event) => setTurmaId(event.target.value)}
              className="w-full rounded-2xl border bg-white px-4 py-3 outline-none focus:border-blue-500"
            >
              <option value="">Selecione a turma</option>

              {turmas.map((turma) => (
                <option key={turma.id} value={turma.id}>
                  {turma.nome}
                  {" — "}
                  {turma.ano}
                </option>
              ))}
            </select>
          </label>

          {turmas.length === 0 && (
            <button
              type="button"
              onClick={onGoTurmas}
              className="mt-3 text-sm font-bold text-blue-600"
            >
              Cadastrar uma turma primeiro →
            </button>
          )}

          <button
            disabled={saving || turmas.length === 0}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 py-3 font-black text-white disabled:opacity-50"
          >
            <Plus size={18} />

            {saving ? "Cadastrando..." : "Cadastrar aluno"}
          </button>
        </form>

        <div className="rounded-3xl border bg-white p-5 shadow-sm md:p-6">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <h3 className="text-xl font-black">Lista de alunos</h3>

              <p className="text-sm text-slate-500">
                {students.length}
                {" aluno(s) encontrado(s)"}
              </p>
            </div>

            <div className="flex gap-2 sm:w-[420px]">
              <select
                value={selectedTurmaId}
                onChange={(event) => setSelectedTurmaId(event.target.value)}
                className="rounded-2xl border bg-white px-3 py-3 text-sm outline-none"
              >
                <option value="">Todas as turmas</option>

                {turmas.map((turma) => (
                  <option key={turma.id} value={turma.id}>
                    {turma.nome}
                  </option>
                ))}
              </select>

              <div className="relative flex-1">
                <Search
                  size={18}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                />

                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  className="w-full rounded-2xl border py-3 pl-10 pr-4 outline-none focus:border-blue-500"
                  placeholder="Buscar aluno..."
                />
              </div>
            </div>
          </div>

          <div className="mt-5 space-y-2">
            {loading ? (
              <p className="rounded-2xl bg-slate-50 p-5 text-center text-sm text-slate-500">
                Carregando alunos...
              </p>
            ) : students.length === 0 ? (
              <div className="rounded-2xl border border-dashed p-8 text-center">
                <Users className="mx-auto text-slate-300" size={34} />

                <p className="mt-3 font-bold">Nenhum aluno encontrado</p>
              </div>
            ) : (
              students.map((student) => (
                <div
                  key={student.id}
                  className="flex items-center justify-between gap-3 rounded-2xl border p-4"
                >
                  <div className="min-w-0">
                    <p className="truncate font-black">{student.nome}</p>

                    <p className="mt-1 text-sm text-slate-500">
                      {student.turmaNome || student.turma || "Sem turma"}
                    </p>
                  </div>

                  <button
                    onClick={() => void onDelete(student)}
                    disabled={deletingId === student.id}
                    className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-red-500 hover:bg-red-50 disabled:opacity-40"
                    title="Retirar aluno"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

// ======================================================
// AVALIAÇÕES CADASTRADAS
// ======================================================
function AvaliacoesPage({ avaliacoes, onUpdate }: { avaliacoes: Avaliacao[]; onUpdate: (avaliacao: Avaliacao) => void }) {
  const [editing, setEditing] = useState<Avaliacao | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  async function save() {
    if (!editing) return;
    try {
      setSaving(true); setMessage("");
      await setDoc(doc(db, "avaliacoes", editing.id), { gabarito: editing.gabarito, quantidadeQuestoes: editing.quantidadeQuestoes }, { merge: true });
      onUpdate(editing); setMessage("Gabarito atualizado com sucesso.");
    } catch (err) { console.error(err); setMessage("Não foi possível salvar o gabarito."); }
    finally { setSaving(false); }
  }
  return <section className="mx-auto max-w-6xl"><div className="mb-6"><p className="text-sm font-bold text-blue-600">AVALIAÇÕES</p><h2 className="mt-1 text-3xl font-black">Avaliações cadastradas</h2><p className="mt-2 text-slate-500">Acesse qualquer avaliação e cadastre ou altere o gabarito quando precisar.</p></div>
    {message && <div className="mb-4 rounded-2xl bg-blue-50 p-4 text-sm text-blue-900">{message}</div>}
    <div className="grid gap-4 md:grid-cols-2">{avaliacoes.length === 0 ? <div className="rounded-3xl border bg-white p-8 text-center text-slate-500 md:col-span-2">Nenhuma avaliação cadastrada.</div> : avaliacoes.map(item => <div key={item.id} className="rounded-3xl border bg-white p-5 shadow-sm"><div className="flex items-start justify-between gap-3"><div><p className="font-black">{item.nomeAtividade || item.titulo} - {item.disciplina}</p><p className="mt-1 text-sm text-slate-500">{item.bimestre || "Bimestre não informado"} • {item.turmaNome}</p></div><button onClick={() => setEditing({...item, gabarito: [...item.gabarito]})} className="rounded-xl bg-blue-50 px-3 py-2 text-sm font-bold text-blue-700">Editar gabarito</button></div><div className="mt-4 flex flex-wrap gap-2">{item.gabarito.map((answer,index)=><span key={index} className="rounded-lg bg-slate-100 px-2 py-1 text-xs font-bold">{index+1}:{answer}</span>)}</div></div>)}</div>
    {editing && <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center"><div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-3xl bg-white p-5 shadow-2xl"><div className="flex items-center justify-between"><div><p className="text-sm font-bold text-blue-600">EDITAR GABARITO</p><h3 className="text-xl font-black">{editing.nomeAtividade || editing.titulo} - {editing.disciplina}</h3></div><button onClick={() => setEditing(null)} className="rounded-xl p-2 hover:bg-slate-100"><X size={20}/></button></div><div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-5">{editing.gabarito.map((answer,index)=><label key={index} className="rounded-2xl border bg-slate-50 p-3"><span className="text-sm font-black">Questão {index+1}</span><select value={answer} onChange={e=>setEditing(current=>current ? {...current,gabarito:current.gabarito.map((a,i)=>i===index?e.target.value as Answer:a)} : current)} className="mt-2 w-full rounded-xl border bg-white px-2 py-2 font-bold">{alternatives.map(a=><option key={a}>{a}</option>)}</select></label>)}</div><button onClick={()=>void save()} disabled={saving} className="mt-5 w-full rounded-2xl bg-emerald-600 py-4 font-black text-white disabled:opacity-50">{saving ? "Salvando..." : "Salvar gabarito"}</button></div></div>}
  </section>;
}

// ======================================================
// REVISÃO APÓS ESCANEAMENTO
// ======================================================
function ReviewPage({ avaliacao, student, answers, confidence, onChange, onBack, onConfirm, saving }: {
  avaliacao: Avaliacao; student: Student; answers: Answer[]; confidence: number;
  onChange: (index: number, value: Answer) => void; onBack: () => void; onConfirm: () => void; saving: boolean;
}) {
  const total = avaliacao.quantidadeQuestoes || avaliacao.gabarito.length;
  const hits = answers.reduce((sum, answer, i) => sum + (answer === avaliacao.gabarito[i] ? 1 : 0), 0);
  const score = Number(((hits / Math.max(total, 1)) * (avaliacao.notaMaxima ?? 10)).toFixed(2));
  const perfect = confidence >= 0.999 && answers.length >= total;
  return <section className="mx-auto max-w-5xl">
    <div className="mb-6 flex items-end justify-between gap-4"><div><p className="text-sm font-bold text-blue-600">RESULTADO DA LEITURA</p><h2 className="mt-1 text-3xl font-black">Confira antes de salvar</h2><p className="mt-2 text-slate-500">{student.nome} • {avaliacao.nomeAtividade || avaliacao.titulo} - {avaliacao.disciplina}</p></div><button onClick={onBack} className="rounded-xl border bg-white px-4 py-2 text-sm font-bold">Voltar</button></div>
    <div className="grid gap-5 md:grid-cols-[220px_1fr]"><div className="rounded-3xl border bg-white p-5 shadow-sm"><p className="text-sm text-slate-500">Nota</p><div className="mt-2 text-5xl font-black text-blue-600">{score.toFixed(2)}</div><p className="mt-2 font-bold">{hits}/{total} acertos</p><p className="mt-4 text-sm text-slate-500">Leitura: {Math.round(confidence*100)}%</p></div>
      <div className="rounded-3xl border bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><div><h3 className="font-black">Respostas identificadas</h3><p className="text-sm text-slate-500">A professora pode editar qualquer resposta.</p></div></div>
        {!perfect && <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><b>Dica:</b> a leitura não ficou em 100%. Procure um lugar melhor iluminado e, se possível, use o flash da câmera para escanear novamente.</div>}
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">{answers.slice(0,total).map((answer,index)=><label key={index} className="rounded-2xl border bg-slate-50 p-3"><span className="text-sm font-black">Questão {index+1}</span><select value={answer} onChange={e=>onChange(index,e.target.value as Answer)} className="mt-2 w-full rounded-xl border bg-white px-2 py-2 font-bold">{alternatives.map(a=><option key={a}>{a}</option>)}</select></label>)}</div>
        <button onClick={onConfirm} disabled={saving} className="mt-5 w-full rounded-2xl bg-emerald-600 py-4 font-black text-white disabled:opacity-50">{saving ? "Salvando..." : "Confirmar e salvar resultado"}</button>
      </div></div>
  </section>;
}

// ======================================================
// CONFIGURAÇÕES
// ======================================================
function SettingsPage({ settings, onSave }: { settings: { atividade1:{nota:number;questoes:number}; atividade2:{nota:number;questoes:number}; atividade3:{nota:number;questoes:number} }; onSave: (next: typeof settings) => Promise<void> }) {
  const [local, setLocal] = useState(settings);
  useEffect(() => setLocal(settings), [settings]);
  const update = (key: keyof typeof local, field: "nota" | "questoes", value: number) => setLocal(current => ({...current, [key]: {...current[key], [field]: value}}));
  return <section className="mx-auto max-w-4xl"><div className="mb-6"><p className="text-sm font-bold text-blue-600">CONFIGURAÇÕES</p><h2 className="mt-1 text-3xl font-black">Padrão das avaliações</h2><p className="mt-2 text-slate-500">Defina uma vez o nome, nota e quantidade de questões de cada atividade.</p></div><div className="space-y-4 rounded-3xl border bg-white p-5 shadow-sm">{(["atividade1","atividade2","atividade3"] as const).map((key,index)=><div key={key} className="grid gap-3 rounded-2xl border p-4 sm:grid-cols-3"><div className="flex items-center font-black">Atividade {index+1}</div><label><span className="mb-1 block text-xs font-bold text-slate-500">Nota</span><input type="number" min="0" step="0.1" value={local[key].nota} onChange={e=>update(key,"nota",Number(e.target.value))} className="w-full rounded-xl border px-3 py-2" /></label><label><span className="mb-1 block text-xs font-bold text-slate-500">Questões</span><input type="number" min="1" value={local[key].questoes} onChange={e=>update(key,"questoes",Number(e.target.value))} className="w-full rounded-xl border px-3 py-2" /></label></div>)}<p className="rounded-2xl bg-blue-50 p-4 text-sm text-blue-900">Na correção, cada questão vale automaticamente <b>nota ÷ número de questões</b>.</p><button onClick={()=>void onSave(local)} className="w-full rounded-2xl bg-blue-600 py-4 font-black text-white">Salvar configurações</button></div></section>;
}

// ======================================================
// NOVA AVALIAÇÃO
// ======================================================

function Setup({
  nomeAtividade,
  setNomeAtividade,
  notaMaxima,
  setNotaMaxima,
  bimestre,
  setBimestre,
  disciplina,
  setDisciplina,
  turmaId,
  setTurmaId,
  turmas,
  keyAnswers,
  updateKey,
  onNext,
  saving,
}: {
  nomeAtividade: "Atividade 1" | "Atividade 2" | "Atividade 3";
  setNomeAtividade: (value: "Atividade 1" | "Atividade 2" | "Atividade 3") => void;
  notaMaxima: number;
  setNotaMaxima: (value: number) => void;
  bimestre: string;
  setBimestre: (value: string) => void;
  disciplina: string;
  setDisciplina: (value: string) => void;
  turmaId: string;
  setTurmaId: (value: string) => void;
  turmas: Turma[];
  keyAnswers: Answer[];
  updateKey: (index: number, value: Answer) => void;
  onNext: () => void;
  saving: boolean;
}) {
  return (
    <section className="mx-auto max-w-4xl">
      <div className="mb-6">
        <p className="text-sm font-bold text-blue-600">NOVA AVALIAÇÃO</p>

        <h2 className="mt-1 text-3xl font-black">Preparar avaliação</h2>

        <p className="mt-2 text-slate-500">
          Escolha a turma e informe o gabarito oficial.
        </p>
      </div>

      <div className="space-y-5 rounded-3xl border bg-white p-5 shadow-sm md:p-7">
        <div className="grid gap-4 md:grid-cols-3">
          <label>
            <span className="mb-2 block text-sm font-bold">Nome da avaliação</span>
            <select value={nomeAtividade} onChange={(event) => { const value = event.target.value as typeof nomeAtividade; setNomeAtividade(value); }} className="w-full rounded-2xl border bg-white px-4 py-3">
              <option>Atividade 1</option><option>Atividade 2</option><option>Atividade 3</option>
            </select>
          </label>
          <label>
            <span className="mb-2 block text-sm font-bold">Nota da avaliação</span>
            <input type="number" min="0" step="0.1" value={notaMaxima} onChange={(event) => setNotaMaxima(Number(event.target.value))} className="w-full rounded-2xl border px-4 py-3" />
          </label>
          <label>
            <span className="mb-2 block text-sm font-bold">Bimestre</span>
            <select value={bimestre} onChange={(event) => setBimestre(event.target.value)} className="w-full rounded-2xl border bg-white px-4 py-3">
              <option>1º Bimestre</option><option>2º Bimestre</option><option>3º Bimestre</option><option>4º Bimestre</option>
            </select>
          </label>

          <label>
            <span className="mb-2 block text-sm font-bold">Disciplina</span>

            <input
              value={disciplina}
              onChange={(event) => setDisciplina(event.target.value)}
              className="w-full rounded-2xl border px-4 py-3 outline-none focus:border-blue-500"
              placeholder="Ex.: Matemática"
            />
          </label>
        </div>

        <label className="block">
          <span className="mb-2 block text-sm font-bold">Turma</span>

          <select
            value={turmaId}
            onChange={(event) => setTurmaId(event.target.value)}
            className="w-full rounded-2xl border bg-white px-4 py-3 outline-none focus:border-blue-500"
          >
            <option value="">Selecione uma turma</option>

            {turmas.map((turma) => (
              <option key={turma.id} value={turma.id}>
                {turma.nome}
                {" — "}
                {turma.ano}
              </option>
            ))}
          </select>
        </label>

        {turmas.length === 0 && (
          <div className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-800">
            Cadastre uma turma antes de criar uma avaliação.
          </div>
        )}

        <div>
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm font-bold">Gabarito oficial</span>

            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold">
              {keyAnswers.length}
              {" questões"}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {keyAnswers.map((answer, index) => (
              <div key={index} className="rounded-2xl border bg-slate-50 p-3">
                <span className="text-sm font-black">
                  {String(index + 1).padStart(2, "0")}
                </span>

                <select
                  value={answer}
                  onChange={(event) =>
                    updateKey(index, event.target.value as Answer)
                  }
                  className="mt-2 w-full rounded-xl border bg-white px-2 py-2 font-bold"
                >
                  {alternatives.map((alternative) => (
                    <option key={alternative} value={alternative}>
                      {alternative}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>

        <button
          disabled={saving || !turmas.length}
          onClick={onNext}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 py-4 font-black text-white disabled:opacity-50"
        >
          {saving
            ? "Salvando avaliação..."
            : "Salvar avaliação e selecionar aluno"}

          <ChevronRight size={18} />
        </button>
      </div>
    </section>
  );
}

// ======================================================
// SELEÇÃO DO ALUNO / SCANNER
// ======================================================

function ScanPage({
  avaliacao,
  selectedStudent,
  students,
  onSelectStudent,
  onOpenCamera,
  onSimulate,
  onBack,
  saving,
}: {
  avaliacao: Avaliacao;
  selectedStudent: Student | null;
  students: Student[];
  onSelectStudent: (student: Student) => void;
  onOpenCamera: () => void;
  onSimulate: () => void;
  onBack: () => void;
  saving: boolean;
}) {
  return (
    <section className="mx-auto max-w-5xl">
      <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-bold text-blue-600">CORREÇÃO</p>

          <h2 className="mt-1 text-3xl font-black">{avaliacao.titulo}</h2>

          <p className="mt-2 text-slate-500">
            {avaliacao.disciplina}
            {" • "}
            {avaliacao.turmaNome}
            {" • "}
            {avaliacao.turmaAno}
          </p>
        </div>

        <button
          onClick={onBack}
          className="rounded-xl border bg-white px-4 py-2 text-sm font-bold"
        >
          Voltar
        </button>
      </div>

      <div className="grid gap-5 lg:grid-cols-[340px_1fr]">
        <div className="rounded-3xl border bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-black">1. Selecione o aluno</h3>

              <p className="text-xs text-slate-500">
                Alunos da turma {avaliacao.turmaNome}
              </p>
            </div>

            <Users className="text-blue-600" size={20} />
          </div>

          <div className="mt-4 max-h-[420px] space-y-2 overflow-y-auto">
            {students.length === 0 ? (
              <div className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-800">
                Não há alunos cadastrados nessa turma.
              </div>
            ) : (
              students.map((student) => (
                <button
                  key={student.id}
                  onClick={() => onSelectStudent(student)}
                  className={`w-full rounded-2xl border p-3 text-left transition ${
                    selectedStudent?.id === student.id
                      ? "border-blue-500 bg-blue-50"
                      : "hover:bg-slate-50"
                  }`}
                >
                  <p className="font-bold">{student.nome}</p>

                  <p className="text-xs text-slate-500">{student.turmaNome}</p>
                </button>
              ))
            )}
          </div>
        </div>

        <div className="rounded-3xl border bg-white p-6 shadow-sm">
          <p className="text-sm font-bold text-blue-600">
            2. ESCANEAR GABARITO
          </p>

          <div className="mt-4 rounded-3xl border-2 border-dashed border-blue-200 bg-blue-50/50 p-8 text-center">
            <div className="mx-auto grid h-20 w-20 place-items-center rounded-3xl bg-white text-blue-600 shadow-sm">
              <Camera size={38} />
            </div>

            <h3 className="mt-5 text-xl font-black">
              {selectedStudent
                ? `Aluno: ${selectedStudent.nome}`
                : "Selecione um aluno primeiro"}
            </h3>

            <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-500">
              Depois de selecionar o aluno, abra a câmera para fazer a leitura
              automática das marcações da folha.
            </p>

            <div className="flex flex-wrap justify-center gap-2">
              <button
                disabled={!selectedStudent}
                onClick={onOpenCamera}
                className="mt-5 inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-5 py-3 font-black text-white disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Camera size={18} />
                Abrir câmera
              </button>

              <button
                disabled={!selectedStudent || saving}
                onClick={onSimulate}
                className="mt-5 inline-flex items-center gap-2 rounded-2xl border bg-white px-5 py-3 font-bold disabled:opacity-40"
              >
                <Check size={18} />

                {saving ? "Salvando..." : "Simular correção"}
              </button>
            </div>
          </div>

          <div className="mt-5 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
            <b>Leitura OMR:</b> o sistema utiliza o modelo padronizado de 10
            questões, com alternativas A, B, C e D.
          </div>
        </div>
      </div>
    </section>
  );
}

// ======================================================
// RESULTADOS
// ======================================================

function Results({
  results,
  avaliacoes,
  turmas,
  onExport,
}: {
  results: Result[];
  avaliacoes: Avaliacao[];
  turmas: Turma[];
  onExport: () => void;
}) {
  const [avaliacaoId, setAvaliacaoId] = useState("");

  const [turmaId, setTurmaId] = useState("");

  const [aluno, setAluno] = useState("");

  const filtered = useMemo(
    () =>
      results.filter((result) => {
        const matchAvaliacao =
          !avaliacaoId || result.avaliacaoId === avaliacaoId;

        const matchTurma = !turmaId || result.turmaId === turmaId;

        const matchAluno =
          !aluno.trim() ||
          result.student.toLowerCase().includes(aluno.trim().toLowerCase());

        return matchAvaliacao && matchTurma && matchAluno;
      }),
    [results, avaliacaoId, turmaId, aluno],
  );

  return (
    <section>
      <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-bold text-blue-600">RESULTADOS</p>

          <h2 className="mt-1 text-3xl font-black">Correções registradas</h2>

          <p className="mt-2 text-slate-500">
            {filtered.length}
            {" resultado(s) encontrado(s)."}
          </p>
        </div>

        <button
          onClick={onExport}
          disabled={!filtered.length}
          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-5 py-3 font-black text-white disabled:opacity-40"
        >
          <FileSpreadsheet size={18} />
          Exportar Excel
        </button>
      </div>

      <div className="mb-5 grid gap-3 rounded-3xl border bg-white p-4 shadow-sm md:grid-cols-3">
        <select
          value={avaliacaoId}
          onChange={(event) => setAvaliacaoId(event.target.value)}
          className="rounded-2xl border bg-white px-4 py-3"
        >
          <option value="">Todas as avaliações</option>

          {avaliacoes.map((item) => (
            <option key={item.id} value={item.id}>
              {item.titulo}
            </option>
          ))}
        </select>

        <select
          value={turmaId}
          onChange={(event) => setTurmaId(event.target.value)}
          className="rounded-2xl border bg-white px-4 py-3"
        >
          <option value="">Todas as turmas</option>

          {turmas.map((item) => (
            <option key={item.id} value={item.id}>
              {item.nome}
              {" — "}
              {item.ano}
            </option>
          ))}
        </select>

        <input
          value={aluno}
          onChange={(event) => setAluno(event.target.value)}
          className="rounded-2xl border px-4 py-3 outline-none focus:border-blue-500"
          placeholder="Buscar aluno..."
        />
      </div>

      <div className="overflow-hidden rounded-3xl border bg-white shadow-sm">
        {!filtered.length ? (
          <div className="p-10 text-center text-slate-500">
            Nenhuma correção encontrada.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[950px] text-sm">
              <thead className="bg-slate-100">
                <tr>
                  <th className="px-4 py-3 text-left">Aluno</th>

                  <th className="px-4 py-3 text-left">Avaliação</th>

                  <th className="px-4 py-3 text-left">Turma</th>

                  <th className="px-4 py-3">Acertos</th>

                  <th className="px-4 py-3">Nota</th>
                </tr>
              </thead>

              <tbody>
                {filtered.map((result) => (
                  <tr key={result.id} className="border-t">
                    <td className="px-4 py-4 font-bold">{result.student}</td>

                    <td className="px-4 py-4">{result.nomeAtividade || result.avaliacaoNome || "—"} - {result.disciplina || "—"}</td>

                    <td className="px-4 py-4">{result.turma}</td>

                    <td className="px-4 py-4 text-center font-bold">
                      {result.hits}/{result.total}
                    </td>

                    <td className="px-4 py-4 text-center font-black text-blue-600">
                      {Number(result.score).toFixed(1)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
