import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";

import {
  ClipboardList,
  Settings2,
  ChartNoAxesCombined,
  LayoutDashboard,
  BookOpen,
  Camera,
  Check,
  ChevronRight,
  ChevronDown,
  FileSpreadsheet,
  LockKeyhole,
  Eye,
  EyeOff,
  FileText,
  GraduationCap,
  Plus,
  Search,
  Tag,
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
  query,
  where,
} from "firebase/firestore";

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  onAuthStateChanged,
  setPersistence,
  updateProfile,
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
  sendPasswordResetEmail,
  browserLocalPersistence,
  type User,
} from "firebase/auth";

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
  nomeAtividade?: string;
  referencia?: string;
  avaliacaoConfigId?: string;
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
  nomeAtividade?: string;
  referencia?: string;
  avaliacaoConfigId?: string;
  notaMaxima?: number;
  bimestre?: string;

  answers: string[];
  correctAnswers: string[];

  score: number;
  hits: number;
  total: number;

  createdAt?: unknown;
};

type AvaliacaoConfig = {
  id: string;
  referencia: string;
  nome: string;
  nota: number;
  questoes: number;
};

type GradeEntry = {
  studentId: string;
  student: string;
  disciplina: string;
  turmaId: string;
  turmaNome: string;
  turmaAno: number;
  bimestre: string;
  notas?: Record<string, number>;
  // Campos antigos mantidos para compatibilidade com registros já salvos.
  atv1?: number;
  atv2?: number;
  atv3?: number;
};

type Page =
  | "home"
  | "settings"
  | "students"
  | "gabarito"
  | "avaliacoes"
  | "setup"
  | "scan"
  | "grades"
  | "review";

const alternatives: Answer[] = ["A", "B", "C", "D"];

// ======================================================
// APP
// ======================================================

function MainApp() {
  const [page, setPage] = useState<Page>("home");
  const [scanReturnPage, setScanReturnPage] = useState<Page>("setup");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [turmas, setTurmas] = useState<Turma[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [avaliacoes, setAvaliacoes] = useState<Avaliacao[]>([]);
  const [disciplinas, setDisciplinas] = useState<string[]>(["Matemática"]);
  const [referencias, setReferencias] = useState<string[]>([
    "Atv1",
    "Atv2",
    "Atv3",
  ]);
  const [avaliacoesConfig, setAvaliacoesConfig] = useState<AvaliacaoConfig[]>([
    {
      id: "atv1",
      referencia: "Atv1",
      nome: "Atividade 1",
      nota: 10,
      questoes: 10,
    },
    {
      id: "atv2",
      referencia: "Atv2",
      nome: "Atividade 2",
      nota: 10,
      questoes: 10,
    },
    {
      id: "atv3",
      referencia: "Atv3",
      nome: "Atividade 3",
      nota: 10,
      questoes: 10,
    },
  ]);
  const [results, setResults] = useState<Result[]>([]);

  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);

  const [currentAvaliacao, setCurrentAvaliacao] = useState<Avaliacao | null>(
    null,
  );

  // ====================================================
  // FORMULÁRIO DA AVALIAÇÃO
  // ====================================================

  const [disciplina, setDisciplina] = useState(
    () => localStorage.getItem("corretor-disciplina") || "Matemática",
  );
  const [turmaId, setTurmaId] = useState("");
  const [avaliacaoConfigId, setAvaliacaoConfigId] = useState(
    () => localStorage.getItem("corretor-avaliacao-config") || "atv3",
  );
  const [nomeAtividade, setNomeAtividade] = useState(
    () => localStorage.getItem("corretor-atividade") || "Atividade 3",
  );
  const [bimestre, setBimestre] = useState(
    () => localStorage.getItem("corretor-bimestre") || "4º Bimestre",
  );
  const [key, setKey] = useState<Answer[]>(Array(10).fill("A") as Answer[]);

  const [grades, setGrades] = useState<Record<string, GradeEntry>>({});

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

  const [error, setError] = useState("");

  // ====================================================
  // INICIALIZAÇÃO
  // ====================================================

  useEffect(() => {
    const start = async () => {
      try {
        await Promise.all([
          loadTurmas(),
          loadStudents(),
          loadAvaliacoes(),
          loadResults(),
          loadGrades(),
          loadSettings(),
        ]);
      } catch (err) {
        console.error("ERRO FIREBASE:", err);

        // Não exibe detalhes técnicos de conexão na abertura do sistema.
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

      // Mantém o painel utilizável mesmo quando a leitura inicial falhar.
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

      // Mantém o painel utilizável mesmo quando a leitura inicial falhar.
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
            referencia: raw.referencia as Avaliacao["referencia"],
            avaliacaoConfigId:
              raw.avaliacaoConfigId as Avaliacao["avaliacaoConfigId"],
            notaMaxima: Number(raw.notaMaxima ?? 10),
            bimestre: String(raw.bimestre ?? "1º Bimestre"),
            createdAt: raw.createdAt,
          };
        })
        .sort((a, b) => a.titulo.localeCompare(b.titulo, "pt-BR"));

      setAvaliacoes(data);
    } catch (err) {
      console.error("Erro ao carregar avaliações:", err);

      // Falhas pontuais de leitura não devem interromper a experiência
      // nem exibir alertas ao abrir o painel. A lista permanece vazia.

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

      // Mantém o painel utilizável mesmo quando a leitura inicial falhar.
    }
  }

  async function loadGrades() {
    try {
      const snapshot = await getDocs(collection(db, "notas"));
      const next: Record<string, GradeEntry> = {};
      snapshot.docs.forEach((item) => {
        next[item.id] = item.data() as GradeEntry;
      });
      setGrades(next);
    } catch (err) {
      console.error("Erro ao carregar notas:", err);
    }
  }

  async function loadSettings() {
    try {
      const snapshot = await getDocs(collection(db, "configuracoes"));
      const evaluationDoc = snapshot.docs.find(
        (item) => item.id === "avaliacoes",
      );
      const generalDoc = snapshot.docs.find((item) => item.id === "geral");

      if (evaluationDoc) {
        const raw = evaluationDoc.data();
        const migrated: AvaliacaoConfig[] = [
          {
            id: "atv1",
            referencia: String(raw.atividade1?.referencia ?? "Atv1"),
            nome: String(raw.atividade1?.nome ?? "Atividade 1"),
            nota: Number(raw.atividade1?.nota ?? 10),
            questoes: Number(raw.atividade1?.questoes ?? 10),
          },
          {
            id: "atv2",
            referencia: String(raw.atividade2?.referencia ?? "Atv2"),
            nome: String(raw.atividade2?.nome ?? "Atividade 2"),
            nota: Number(raw.atividade2?.nota ?? 10),
            questoes: Number(raw.atividade2?.questoes ?? 10),
          },
          {
            id: "atv3",
            referencia: String(raw.atividade3?.referencia ?? "Atv3"),
            nome: String(raw.atividade3?.nome ?? "Atividade 3"),
            nota: Number(raw.atividade3?.nota ?? 10),
            questoes: Number(raw.atividade3?.questoes ?? 10),
          },
        ];
        setAvaliacoesConfig(migrated);
      }

      if (generalDoc) {
        const raw = generalDoc.data();
        const loadedDisciplines = Array.isArray(raw.disciplinas)
          ? raw.disciplinas.map((item: unknown) => String(item)).filter(Boolean)
          : [];
        const loadedReferencias = Array.isArray(raw.referencias)
          ? raw.referencias
              .map((item: unknown) => String(item).trim())
              .filter(Boolean)
          : [];
        const loadedEvaluations = Array.isArray(raw.avaliacoes)
          ? raw.avaliacoes
              .map((item: any) => ({
                id: String(item.id ?? crypto.randomUUID()),
                referencia: String(item.referencia ?? item.id ?? "Atv1"),
                nome: String(item.nome ?? "Avaliação"),
                nota: Number(item.nota ?? 10),
                questoes: Number(item.questoes ?? 10),
              }))
              .filter((item: AvaliacaoConfig) => item.nome.trim())
          : [];
        if (loadedDisciplines.length) setDisciplinas(loadedDisciplines);

        const referenciasMigradas = loadedReferencias.length
          ? loadedReferencias
          : loadedEvaluations
              .map((item: AvaliacaoConfig) => item.referencia)
              .filter(Boolean);

        // A ordem das referências é a ordem de cadastro.
        // Não usamos sort(): addReferencia() sempre acrescenta a nova
        // referência ao final da lista e o Firestore preserva essa sequência.
        const referenciasSemDuplicatas = [...new Set(referenciasMigradas)];

        // Corrige apenas os dados antigos das três referências padrão caso
        // tenham sido gravados anteriormente como Atv3, Atv1, Atv2.
        // Referências personalizadas permanecem exatamente na ordem salva.
        const referenciasNormalizadas =
          referenciasSemDuplicatas.length === 3 &&
          ["atv1", "atv2", "atv3"].every((padrao) =>
            referenciasSemDuplicatas.some(
              (referencia) => referencia.toLowerCase() === padrao,
            ),
          )
            ? [
                referenciasSemDuplicatas.find(
                  (referencia) => referencia.toLowerCase() === "atv1",
                )!,
                referenciasSemDuplicatas.find(
                  (referencia) => referencia.toLowerCase() === "atv2",
                )!,
                referenciasSemDuplicatas.find(
                  (referencia) => referencia.toLowerCase() === "atv3",
                )!,
              ]
            : referenciasSemDuplicatas;

        if (referenciasNormalizadas.length) {
          setReferencias(referenciasNormalizadas);
        }

        if (loadedEvaluations.length) setAvaliacoesConfig(loadedEvaluations);
      }
    } catch (err) {
      console.error("Erro ao carregar configurações:", err);
    }
  }

  async function saveGeneralSettings(
    nextDisciplinas: string[],
    nextAvaliacoes: AvaliacaoConfig[],
    nextReferencias: string[] = referencias,
  ) {
    await setDoc(
      doc(db, "configuracoes", "geral"),
      {
        disciplinas: nextDisciplinas,
        avaliacoes: nextAvaliacoes,
        referencias: nextReferencias,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  }

  async function addDisciplina(nome: string) {
    const clean = nome.trim();
    if (!clean) {
      setError("Informe o nome da disciplina.");
      return;
    }
    if (
      disciplinas.some((item) => item.toLowerCase() === clean.toLowerCase())
    ) {
      setError("Essa disciplina já está cadastrada.");
      return;
    }
    const next = [...disciplinas, clean].sort((a, b) =>
      a.localeCompare(b, "pt-BR"),
    );
    try {
      setError("");
      await saveGeneralSettings(next, avaliacoesConfig, referencias);
      setDisciplinas(next);
    } catch (err) {
      console.error(err);
      setError("Não foi possível cadastrar a disciplina.");
    }
  }

  async function addReferencia(referencia: string) {
    const clean = referencia.trim();
    if (!clean) {
      setError("Informe a referência da coluna.");
      return;
    }
    if (
      referencias.some((item) => item.toLowerCase() === clean.toLowerCase())
    ) {
      setError("Essa referência já está cadastrada.");
      return;
    }
    const next = [...referencias, clean];
    try {
      setError("");
      await saveGeneralSettings(disciplinas, avaliacoesConfig, next);
      setReferencias(next);
    } catch (err) {
      console.error(err);
      setError("Não foi possível cadastrar a referência.");
    }
  }

  async function removeReferencia(referencia: string) {
    if (
      avaliacoesConfig.some(
        (item) => item.referencia.toLowerCase() === referencia.toLowerCase(),
      )
    ) {
      setError(
        "Não é possível excluir uma referência que já está vinculada a uma avaliação.",
      );
      return;
    }
    const next = referencias.filter((item) => item !== referencia);
    if (!next.length) {
      setError("Mantenha pelo menos uma referência cadastrada.");
      return;
    }
    try {
      await saveGeneralSettings(disciplinas, avaliacoesConfig, next);
      setReferencias(next);
    } catch (err) {
      console.error(err);
      setError("Não foi possível excluir a referência.");
    }
  }

  async function addAvaliacaoConfig(
    referencia: string,
    nome: string,
    nota: number,
    questoes: number,
  ) {
    const cleanReferencia = referencia.trim();
    const cleanNome = nome.trim();
    if (!cleanReferencia) {
      setError("Informe a referência da coluna.");
      return;
    }
    if (!cleanNome) {
      setError("Informe o nome da avaliação.");
      return;
    }
    if (!Number.isFinite(nota) || nota <= 0) {
      setError("Informe uma nota máxima válida.");
      return;
    }
    if (!Number.isInteger(questoes) || questoes < 1) {
      setError("Informe uma quantidade válida de questões.");
      return;
    }
    if (
      !referencias.some(
        (item) => item.toLowerCase() === cleanReferencia.toLowerCase(),
      )
    ) {
      setError(
        "Cadastre essa referência primeiro na seção Referências de colunas.",
      );
      return;
    }
    const next = [
      ...avaliacoesConfig,
      {
        id: crypto.randomUUID(),
        referencia: cleanReferencia,
        nome: cleanNome,
        nota,
        questoes,
      },
    ];
    try {
      setError("");
      await saveGeneralSettings(disciplinas, next, referencias);
      setAvaliacoesConfig(next);
      setAvaliacaoConfigId(next[next.length - 1].id);
      setNomeAtividade(cleanNome);
    } catch (err) {
      console.error(err);
      setError("Não foi possível cadastrar a avaliação.");
    }
  }

  async function removeDisciplina(nome: string) {
    const next = disciplinas.filter((item) => item !== nome);
    try {
      await saveGeneralSettings(next, avaliacoesConfig, referencias);
      setDisciplinas(next);
    } catch (err) {
      console.error(err);
      setError("Não foi possível excluir a disciplina.");
    }
  }

  async function removeAvaliacaoConfig(id: string) {
    const next = avaliacoesConfig.filter((item) => item.id !== id);
    if (!next.length) {
      setError("Mantenha pelo menos uma avaliação cadastrada.");
      return;
    }
    try {
      await saveGeneralSettings(disciplinas, next, referencias);
      setAvaliacoesConfig(next);
    } catch (err) {
      console.error(err);
      setError("Não foi possível excluir a avaliação.");
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
    const preset = avaliacoesConfig.find(
      (item) => item.id === avaliacaoConfigId,
    );
    const questionCount = preset?.questoes || key.length;
    const configuredScore = preset?.nota ?? 10;

    if (!preset) {
      setError(
        "Selecione uma referência de avaliação válida nas configurações.",
      );
      return;
    }
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

      const createdAt = new Date();

      const data = {
        titulo: preset.nome,
        nomeAtividade: preset.nome,
        referencia: preset.referencia,
        avaliacaoConfigId: preset.id,
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
      const avaliacao: Avaliacao = { id: ref.id, ...data, createdAt };
      setAvaliacoes((current) => [avaliacao, ...current]);
      setCurrentAvaliacao(avaliacao);
      setSelectedStudent(null);
      setScanReturnPage("setup");
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

    const score = Number(
      (
        (hits / Math.max(total, 1)) *
        (currentAvaliacao.notaMaxima ?? 10)
      ).toFixed(2),
    );

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
      referencia: currentAvaliacao.referencia,
      avaliacaoConfigId: currentAvaliacao.avaliacaoConfigId,
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

      const existingResult = results.find(
        (item) =>
          item.avaliacaoId === currentAvaliacao.id &&
          item.studentId === selectedStudent.id,
      );

      let resultId = existingResult?.id;
      const resultData = {
        ...result,
        criadoEm: serverTimestamp(),
      };

      if (resultId) {
        await setDoc(doc(db, "resultados", resultId), resultData, {
          merge: true,
        });
      } else {
        const ref = await addDoc(collection(db, "resultados"), resultData);
        resultId = ref.id;
      }

      setResults((current) => {
        const updated = { ...result, id: resultId };
        const withoutPrevious = current.filter(
          (item) =>
            !(
              item.avaliacaoId === currentAvaliacao.id &&
              item.studentId === selectedStudent.id
            ),
        );
        return [updated, ...withoutPrevious];
      });

      setPage("avaliacoes");
    } catch (err) {
      console.error(err);
      setError("Não foi possível salvar a correção.");
    } finally {
      setSavingResult(false);
    }
  }

  async function removeAvaliacao(avaliacao: Avaliacao) {
    if (
      !window.confirm(
        `Deseja excluir a avaliação "${avaliacao.nomeAtividade || avaliacao.titulo}"? Os resultados dessa avaliação também serão excluídos.`,
      )
    ) {
      return;
    }

    try {
      setError("");
      await deleteDoc(doc(db, "avaliacoes", avaliacao.id));

      const relatedResults = results.filter(
        (result) => result.avaliacaoId === avaliacao.id,
      );
      await Promise.all(
        relatedResults
          .filter((result) => result.id)
          .map((result) => deleteDoc(doc(db, "resultados", result.id!))),
      );

      setAvaliacoes((current) =>
        current.filter((item) => item.id !== avaliacao.id),
      );
      setResults((current) =>
        current.filter((result) => result.avaliacaoId !== avaliacao.id),
      );
    } catch (err) {
      console.error(err);
      setError("Não foi possível excluir a avaliação.");
    }
  }

  useEffect(() => {
    localStorage.setItem("corretor-atividade", nomeAtividade);
  }, [nomeAtividade]);

  useEffect(() => {
    localStorage.setItem("corretor-avaliacao-config", avaliacaoConfigId);
  }, [avaliacaoConfigId]);

  useEffect(() => {
    localStorage.setItem("corretor-bimestre", bimestre);
  }, [bimestre]);

  useEffect(() => {
    localStorage.setItem("corretor-disciplina", disciplina);
  }, [disciplina]);

  async function saveGrade(
    student: Student,
    values: Record<string, number | undefined>,
    disciplinaValue: string,
    bimestreValue: string,
  ) {
    const keyId =
      `${student.id}_${disciplinaValue.trim().toLowerCase()}_${bimestreValue}`.replace(
        /\s+/g,
        "_",
      );

    const timeOf = (value: any) =>
      value?.toMillis?.() ??
      (value?.seconds
        ? Number(value.seconds) * 1000
        : Date.parse(String(value ?? "")) || 0);

    const referenceOf = (avaliacao: Avaliacao) => {
      const direct = (avaliacao.referencia ?? "").trim();
      if (direct) return direct.toLowerCase();
      const config = avaliacao.avaliacaoConfigId
        ? avaliacoesConfig.find(
            (item) => item.id === avaliacao.avaliacaoConfigId,
          )
        : undefined;
      return config?.referencia?.trim().toLowerCase() ?? "";
    };

    // Uma nota proveniente de avaliação nunca é gravada como nota manual.
    // Assim, ao excluir a avaliação, o professor recupera a possibilidade
    // de lançar/editar manualmente a nota.
    const latestEvaluationByReference = new Map<string, Avaliacao>();
    avaliacoes
      .filter(
        (avaliacao) =>
          avaliacao.disciplina === disciplinaValue &&
          avaliacao.bimestre === bimestreValue &&
          avaliacao.turmaId === student.turmaId,
      )
      .forEach((avaliacao) => {
        const reference = referenceOf(avaliacao);
        if (!reference) return;
        const previous = latestEvaluationByReference.get(reference);
        if (
          !previous ||
          timeOf(avaliacao.createdAt) >= timeOf(previous.createdAt)
        ) {
          latestEvaluationByReference.set(reference, avaliacao);
        }
      });

    const notasManuais = Object.fromEntries(
      Object.entries(values).filter(([reference, value]) => {
        if (typeof value !== "number") return false;

        const latest = latestEvaluationByReference.get(reference.toLowerCase());
        if (!latest) return true;

        const hasEvaluationResult = results.some(
          (result) =>
            result.studentId === student.id &&
            result.avaliacaoId === latest.id &&
            result.disciplina === disciplinaValue &&
            result.bimestre === bimestreValue,
        );

        return !hasEvaluationResult;
      }),
    ) as Record<string, number>;

    const entry: GradeEntry = {
      studentId: student.id,
      student: student.nome,
      disciplina: disciplinaValue.trim() || "Não informada",
      turmaId: student.turmaId,
      turmaNome: student.turmaNome,
      turmaAno: student.turmaAno || new Date().getFullYear(),
      bimestre: bimestreValue,
      notas: notasManuais,
    };

    try {
      await setDoc(doc(db, "notas", keyId), entry, { merge: true });
      setGrades((current) => ({
        ...current,
        [keyId]: { ...current[keyId], ...entry },
      }));
    } catch (err) {
      console.error(err);
      setError("Não foi possível salvar a nota.");
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
      exportResults(
        results,
        avaliacoes,
        students,
        `Resultados - ${bimestre}.xlsx`,
        Object.values(grades),
      );
    } catch (err) {
      console.error(err);

      setError("Não foi possível exportar os resultados.");
    }
  }

  // ====================================================
  // INTERFACE
  // ====================================================

  return (
    <div className="app-shell min-h-screen text-slate-800">
      <header className="app-header sticky top-0 z-30">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-4 px-4 py-3.5 lg:px-7">
          <button
            onClick={() => setPage("home")}
            className="flex items-center gap-3 text-left"
          >
            <img src="/logo-corretor.png" alt="Logo Corretor Gabarito" className="h-12 w-12 rounded-2xl object-cover shadow-md ring-1 ring-slate-200" />

            <span>
              <b className="brand-title block text-[17px]">Corretor Gabarito</b>

              <small className="brand-subtitle">GESTÃO DE AVALIAÇÕES</small>
            </span>
          </button>

          <nav className="desktop-nav hidden items-center gap-1.5 md:flex">
            <NavButton
              active={page === "home"}
              icon={<LayoutDashboard size={18} strokeWidth={1.9} />}
              label="Início"
              onClick={() => setPage("home")}
            />

            <NavButton
              active={page === "settings"}
              icon={<Settings2 size={18} strokeWidth={1.9} />}
              label="Configurações"
              onClick={() => setPage("settings")}
            />

            <NavButton
              active={page === "students"}
              icon={<Users size={18} strokeWidth={1.9} />}
              label="Alunos"
              onClick={() => setPage("students")}
            />

            <NavButton
              active={page === "gabarito"}
              icon={<ClipboardList size={18} strokeWidth={1.9} />}
              label="Gabarito"
              onClick={() => setPage("gabarito")}
            />
            <NavButton
              active={page === "avaliacoes"}
              icon={<BookOpen size={18} strokeWidth={1.9} />}
              label="Avaliações"
              onClick={() => setPage("avaliacoes")}
            />

            <NavButton
              active={page === "setup" || page === "scan"}
              icon={<BookOpen size={18} strokeWidth={1.9} />}
              label="Nova avaliação"
              onClick={() => setPage("setup")}
            />

            <NavButton
              active={page === "grades"}
              icon={<ChartNoAxesCombined size={18} strokeWidth={1.9} />}
              label="Cadastrar notas"
              onClick={() => setPage("grades")}
            />
          </nav>


        </div>

        <div className="mobile-menu-bar md:hidden">
          <button
            type="button"
            onClick={() => setMobileMenuOpen((value) => !value)}
            className="mobile-menu-trigger flex w-full items-center justify-between rounded-xl px-4 py-3 text-sm font-bold"
          >
            <span>Menu</span>
            <ChevronDown
              className={`transition-transform ${mobileMenuOpen ? "rotate-180" : ""}`}
              size={20}
            />
          </button>
          {mobileMenuOpen && (
            <div className="mt-2 grid grid-cols-2 gap-2 pb-1">
              {[
                ["Início", () => setPage("home"), <LayoutDashboard size={18} />],
                [
                  "Configurações",
                  () => setPage("settings"),
                  <Settings2 size={18} />,
                ],
                ["Alunos", () => setPage("students"), <Users size={18} />],
                ["Gabarito", () => setPage("gabarito"), <ClipboardList size={18} />],
                [
                  "Avaliações",
                  () => setPage("avaliacoes"),
                  <BookOpen size={18} />,
                ],
                ["Nova avaliação", () => setPage("setup"), <BookOpen size={18} />],
                [
                  "Cadastrar notas",
                  () => setPage("grades"),
                  <ChartNoAxesCombined size={18} />,
                ],
              ].map(([label, action, icon]) => (
                <button
                  key={String(label)}
                  onClick={() => {
                    (action as () => void)();
                    setMobileMenuOpen(false);
                  }}
                  className="mobile-nav-item flex items-center gap-3 rounded-xl p-3 text-left text-sm font-semibold"
                >
                  {icon as ReactNode}
                  <span>{String(label)}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </header>

      <main className="app-main mx-auto max-w-[1440px] px-4 py-7 lg:px-7 lg:py-9">
        {error && (
          <div className="mb-5 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
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
            onTurmas={() => setPage("settings")}
            onStudents={() => setPage("students")}
            onGabarito={() => setPage("gabarito")}
            onNew={() => setPage("setup")}
            onResults={() => setPage("grades")}
          />
        )}

        {page === "settings" && (
          <ConfiguracoesPage
            turmas={turmas}
            students={students}
            savingTurma={savingTurma}
            deletingTurmaId={deletingTurmaId}
            onAddTurma={addTurma}
            onDeleteTurma={removeTurma}
            disciplinas={disciplinas}
            onAddDisciplina={addDisciplina}
            onDeleteDisciplina={removeDisciplina}
            referencias={referencias}
            onAddReferencia={addReferencia}
            onDeleteReferencia={removeReferencia}
            avaliacoesConfig={avaliacoesConfig}
            onAddAvaliacao={addAvaliacaoConfig}
            onDeleteAvaliacao={removeAvaliacaoConfig}
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
            onGoTurmas={() => setPage("settings")}
          />
        )}

        {page === "gabarito" && (
          <section className="mx-auto max-w-6xl">
            <div className="mb-6">
              <p className="text-sm font-bold text-blue-600">GABARITO</p>

              <h2 className="mt-1 text-3xl font-black">Folha de respostas</h2>

              <p className="mt-2 max-w-3xl text-blue-500">
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
            students={students}
            results={results}
            onExport={handleExport}
            onCorrect={(avaliacao) => {
              setCurrentAvaliacao(avaliacao);
              setSelectedStudent(null);
              setScanReturnPage("avaliacoes");
              setError("");
              setPage("scan");
            }}
            onUpdate={(updated) => {
              setAvaliacoes((current) =>
                current.map((item) =>
                  item.id === updated.id ? updated : item,
                ),
              );
            }}
            onDelete={(avaliacao) => void removeAvaliacao(avaliacao)}
          />
        )}

        {page === "setup" && (
          <Setup
            avaliacaoConfigId={avaliacaoConfigId}
            setAvaliacaoConfigId={(id) => {
              setAvaliacaoConfigId(id);
              const config = avaliacoesConfig.find((item) => item.id === id);
              if (config) setNomeAtividade(config.nome);
            }}
            avaliacaoOptions={avaliacoesConfig}
            bimestre={bimestre}
            setBimestre={setBimestre}
            disciplina={disciplina}
            setDisciplina={setDisciplina}
            disciplinas={disciplinas}
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
            onChange={(index, value) =>
              setReviewAnswers((current) =>
                current.map((item, i) => (i === index ? value : item)),
              )
            }
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
            onBack={() => setPage(scanReturnPage)}
            saving={savingResult}
          />
        )}

        {page === "grades" && (
          <GradesPage
            students={students}
            turmas={turmas}
            grades={grades}
            results={results}
            avaliacoes={avaliacoes}
            avaliacoesConfig={avaliacoesConfig}
            referencias={referencias}
            disciplinas={disciplinas}
            onSave={saveGrade}
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
      aria-current={active ? "page" : undefined}
      title={label}
      className={`nav-button inline-flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-[13px] font-semibold transition-all ${
        active
          ? "nav-button-active"
          : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
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
          Plataforma para professores
        </p>

        <h1 className="hero-title mt-2 text-3xl font-black md:text-5xl">
          Corretor Gabarito
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
      className="rounded-3xl border bg-white p-5 text-left shadow-sm transition hover:-tranblue-y-0.5 hover:shadow-md"
    >
      <span className="grid h-11 w-11 place-items-center rounded-2xl bg-blue-50 text-blue-600">
        {icon}
      </span>

      <p className="mt-5 text-sm font-bold text-blue-500">{title}</p>

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
      <span className="grid h-12 w-12 place-items-center rounded-2xl bg-blue-100 text-blue-600">
        {icon}
      </span>

      <h2 className="mt-5 text-xl font-black">{title}</h2>

      <p className="mt-2 min-h-12 text-sm leading-6 text-blue-500">{text}</p>

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
// CONFIGURAÇÕES
// ======================================================

function ConfiguracoesPage({
  turmas,
  students,
  savingTurma,
  deletingTurmaId,
  onAddTurma,
  onDeleteTurma,
  disciplinas,
  onAddDisciplina,
  onDeleteDisciplina,
  referencias,
  onAddReferencia,
  onDeleteReferencia,
  avaliacoesConfig,
  onAddAvaliacao,
  onDeleteAvaliacao,
}: {
  turmas: Turma[];
  students: Student[];
  savingTurma: boolean;
  deletingTurmaId: string | null;
  onAddTurma: (nome: string, ano: string) => Promise<void>;
  onDeleteTurma: (turma: Turma) => Promise<void>;
  disciplinas: string[];
  onAddDisciplina: (nome: string) => Promise<void>;
  onDeleteDisciplina: (nome: string) => Promise<void>;
  referencias: string[];
  onAddReferencia: (referencia: string) => Promise<void>;
  onDeleteReferencia: (referencia: string) => Promise<void>;
  avaliacoesConfig: AvaliacaoConfig[];
  onAddAvaliacao: (
    referencia: string,
    nome: string,
    nota: number,
    questoes: number,
  ) => Promise<void>;
  onDeleteAvaliacao: (id: string) => Promise<void>;
}) {
  const [turmaNome, setTurmaNome] = useState("");
  const [turmaAno, setTurmaAno] = useState(String(new Date().getFullYear()));
  const [disciplinaNome, setDisciplinaNome] = useState("");
  const [referenciaNome, setReferenciaNome] = useState("");
  const [avaliacaoReferencia, setAvaliacaoReferencia] = useState("");
  const [avaliacaoNome, setAvaliacaoNome] = useState("");
  const [avaliacaoNota, setAvaliacaoNota] = useState("10");
  const [avaliacaoQuestoes, setAvaliacaoQuestoes] = useState("10");

  return (
    <section className="space-y-6">
      <div>
        <p className="text-sm font-bold text-blue-600">CONFIGURAÇÕES</p>
        <h2 className="mt-1 text-3xl font-black">Configurações do sistema</h2>
        <p className="mt-2 text-blue-500">
          Cadastre aqui as turmas, disciplinas e modelos de avaliação que serão
          usados nas correções.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="rounded-3xl border bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-blue-50 text-blue-600">
              <GraduationCap />
            </span>
            <div>
              <h3 className="font-black">Turmas</h3>
              <p className="text-xs text-blue-500">
                Adicione e organize suas turmas.
              </p>
            </div>
          </div>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              await onAddTurma(turmaNome, turmaAno);
              setTurmaNome("");
            }}
            className="mt-5 grid gap-3 sm:grid-cols-[1fr_130px]"
          >
            <input
              value={turmaNome}
              onChange={(e) => setTurmaNome(e.target.value)}
              className="rounded-2xl border px-4 py-3"
              placeholder="Ex.: 3º ano B"
            />
            <input
              type="number"
              value={turmaAno}
              onChange={(e) => setTurmaAno(e.target.value)}
              className="rounded-2xl border px-4 py-3"
            />
            <button
              disabled={savingTurma}
              className="sm:col-span-2 rounded-2xl bg-blue-600 py-3 font-black text-white disabled:opacity-50"
            >
              {savingTurma ? "Salvando..." : "Adicionar turma"}
            </button>
          </form>
          <div className="mt-5 space-y-2">
            {turmas.map((turma) => {
              const count = students.filter(
                (student) => student.turmaId === turma.id,
              ).length;
              return (
                <div
                  key={turma.id}
                  className="flex items-center justify-between rounded-2xl border p-3"
                >
                  <div>
                    <p className="font-black">{turma.nome}</p>
                    <p className="text-xs text-blue-500">
                      {turma.ano} • {count} aluno(s)
                    </p>
                  </div>
                  <button
                    onClick={() => void onDeleteTurma(turma)}
                    disabled={deletingTurmaId === turma.id || count > 0}
                    className="grid h-9 w-9 place-items-center rounded-xl text-red-500 disabled:opacity-30"
                  >
                    <Trash2 size={17} />
                  </button>
                </div>
              );
            })}
            {!turmas.length && (
              <p className="rounded-2xl bg-blue-50 p-4 text-center text-sm text-blue-500">
                Nenhuma turma cadastrada.
              </p>
            )}
          </div>
        </div>

        <div className="rounded-3xl border bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-blue-50 text-blue-600">
              <BookOpen />
            </span>
            <div>
              <h3 className="font-black">Disciplinas</h3>
              <p className="text-xs text-blue-500">
                Essas opções aparecerão ao criar uma avaliação.
              </p>
            </div>
          </div>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              await onAddDisciplina(disciplinaNome);
              setDisciplinaNome("");
            }}
            className="mt-5 flex gap-2"
          >
            <input
              value={disciplinaNome}
              onChange={(e) => setDisciplinaNome(e.target.value)}
              className="min-w-0 flex-1 rounded-2xl border px-4 py-3"
              placeholder="Ex.: Matemática"
            />
            <button className="rounded-2xl bg-blue-600 px-5 font-black text-white">
              Adicionar
            </button>
          </form>
          <div className="mt-5 flex flex-wrap gap-2">
            {disciplinas.map((item) => (
              <div
                key={item}
                className="flex items-center gap-2 rounded-xl bg-blue-100 px-3 py-2 text-sm font-bold"
              >
                <span>{item}</span>
                <button
                  onClick={() => void onDeleteDisciplina(item)}
                  className="text-red-500"
                >
                  <X size={15} />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-3xl border bg-white p-6 shadow-sm lg:col-span-2">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-blue-50 text-blue-600">
              <Tag />
            </span>
            <div>
              <h3 className="font-black">Referências de colunas</h3>
              <p className="text-xs text-blue-500">
                Cadastre aqui as referências fixas que poderão ser usadas nas
                avaliações.
              </p>
            </div>
          </div>
          <div className="mt-3 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-900">
            <b>Referência:</b> será o nome fixo da coluna na planilha de
            resultados. Recomenda-se usar exatamente a nomenclatura adotada pela
            Secretaria de Educação, por exemplo <b>Atv1</b>, <b>Atv2</b> e{" "}
            <b>Atv3</b>. Depois de cadastrada aqui, a referência será apenas
            selecionada ao criar uma avaliação.
          </div>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              await onAddReferencia(referenciaNome);
              setReferenciaNome("");
            }}
            className="mt-5 flex gap-2"
          >
            <input
              value={referenciaNome}
              onChange={(e) => setReferenciaNome(e.target.value)}
              className="min-w-0 flex-1 rounded-2xl border px-4 py-3"
              placeholder="Ex.: Atv4"
            />
            <button className="rounded-2xl bg-blue-600 px-5 py-3 font-black text-white">
              Adicionar
            </button>
          </form>
          <div className="mt-5 flex flex-wrap gap-2">
            {referencias.map((item) => (
              <div
                key={item}
                className="flex items-center gap-2 rounded-xl bg-blue-100 px-3 py-2 text-sm font-bold"
              >
                <span>{item}</span>
                <button
                  onClick={() => void onDeleteReferencia(item)}
                  className="text-red-500"
                  title="Excluir referência"
                >
                  <X size={15} />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-3xl border bg-white p-6 shadow-sm lg:col-span-2">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-blue-50 text-blue-600">
              <FileText />
            </span>
            <div>
              <h3 className="font-black">Avaliações e referências</h3>
              <p className="text-xs text-blue-500">
                Cadastre o nome da avaliação, a nota máxima e a quantidade de
                questões vinculados a uma referência.
              </p>
            </div>
          </div>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              await onAddAvaliacao(
                avaliacaoReferencia,
                avaliacaoNome,
                Number(avaliacaoNota),
                Number(avaliacaoQuestoes),
              );
              setAvaliacaoNome("");
            }}
            className="mt-5 grid gap-4 rounded-2xl bg-blue-50 p-4 md:grid-cols-[180px_1fr_150px_210px_auto]"
          >
            <label className="block">
              <span className="mb-2 block text-sm font-bold">Referência</span>
              <select
                value={avaliacaoReferencia}
                onChange={(e) => {
                  const value = e.target.value;
                  setAvaliacaoReferencia(value);
                }}
                className="w-full rounded-2xl border bg-white px-4 py-3"
              >
                <option value="">Selecione</option>
                {referencias.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-bold">
                Nome da avaliação
              </span>
              <input
                value={avaliacaoNome}
                onChange={(e) => setAvaliacaoNome(e.target.value)}
                className="w-full rounded-2xl border bg-white px-4 py-3"
                placeholder="Ex.: Prova"
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-bold">Nota máxima</span>
              <input
                type="number"
                min="0.1"
                step="0.1"
                value={avaliacaoNota}
                onChange={(e) => setAvaliacaoNota(e.target.value)}
                className="w-full rounded-2xl border bg-white px-4 py-3"
                placeholder="10"
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-bold">
                Quantidade de questões
              </span>
              <input
                type="number"
                min="1"
                step="1"
                value={avaliacaoQuestoes}
                onChange={(e) => setAvaliacaoQuestoes(e.target.value)}
                className="w-full rounded-2xl border bg-white px-4 py-3"
                placeholder="10"
              />
            </label>
            <button className="self-end rounded-2xl bg-blue-600 px-5 py-3 font-black text-white">
              Adicionar
            </button>
          </form>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {avaliacoesConfig.map((item) => (
              <div key={item.id} className="rounded-2xl border p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-black uppercase text-blue-600">
                      {item.referencia}
                    </p>
                    <p className="font-black">{item.nome}</p>
                    <p className="mt-1 text-sm text-blue-500">
                      Nota máxima: {item.nota} • {item.questoes} questões
                    </p>
                  </div>
                  <button
                    onClick={() => void onDeleteAvaliacao(item.id)}
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-red-500 hover:bg-red-50"
                    title="Excluir avaliação"
                  >
                    <Trash2 size={17} />
                  </button>
                </div>
              </div>
            ))}
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
          Meus alunos
        </h2>

        <p className="mt-2 text-blue-500">
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

              <p className="text-xs text-blue-500">
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

              <p className="text-sm text-blue-500">
                {students.length}
                {" aluno(s) encontrado(s)"}
              </p>
            </div>

            <div className="flex gap-2 sm:w-105">
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
                  className="absolute left-3 top-1/2 -tranblue-y-1/2 text-blue-400"
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
              <p className="rounded-2xl bg-blue-50 p-5 text-center text-sm text-blue-500">
                Carregando alunos...
              </p>
            ) : students.length === 0 ? (
              <div className="rounded-2xl border border-dashed p-8 text-center">
                <Users className="mx-auto text-blue-300" size={34} />

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

                    <p className="mt-1 text-sm text-blue-500">
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
function AvaliacoesPage({
  avaliacoes,
  students,
  results,
  onExport,
  onCorrect,
  onUpdate,
  onDelete,
}: {
  avaliacoes: Avaliacao[];
  students: Student[];
  results: Result[];
  onExport: () => void;
  onCorrect: (avaliacao: Avaliacao) => void;
  onUpdate: (avaliacao: Avaliacao) => void;
  onDelete: (avaliacao: Avaliacao) => void;
}) {
  const [editing, setEditing] = useState<Avaliacao | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  async function save() {
    if (!editing) return;
    try {
      setSaving(true);
      setMessage("");
      await setDoc(
        doc(db, "avaliacoes", editing.id),
        {
          gabarito: editing.gabarito,
          quantidadeQuestoes: editing.quantidadeQuestoes,
        },
        { merge: true },
      );
      onUpdate(editing);
      setMessage("Gabarito atualizado com sucesso.");
    } catch (err) {
      console.error(err);
      setMessage("Não foi possível salvar o gabarito.");
    } finally {
      setSaving(false);
    }
  }
  return (
    <section className="mx-auto max-w-6xl">
      <div className="mb-6">
        <p className="text-sm font-bold text-blue-600">AVALIAÇÕES</p>
        <h2 className="mt-1 text-3xl font-black">Avaliações cadastradas</h2>
        <p className="mt-2 text-blue-500">
          Clique em uma avaliação para visualizar as respostas de cada aluno.
        </p>
      </div>
      <button
        onClick={onExport}
        className="mb-5 inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-5 py-3 font-black text-white"
      >
        <FileSpreadsheet size={18} /> Exportar planilha
      </button>
      {message && (
        <div className="mb-4 rounded-2xl bg-blue-50 p-4 text-sm text-blue-900">
          {message}
        </div>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        {avaliacoes.length === 0 ? (
          <div className="rounded-3xl border bg-white p-8 text-center text-blue-500 md:col-span-2">
            Nenhuma avaliação cadastrada.
          </div>
        ) : (
          avaliacoes.map((item) => (
            <div
              key={item.id}
              className="rounded-3xl border bg-white p-5 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-black">
                    {item.nomeAtividade || item.titulo} - {item.disciplina}
                  </p>
                  <p className="mt-1 text-sm text-blue-500">
                    {item.bimestre || "Bimestre não informado"} •{" "}
                    {item.turmaNome}
                  </p>
                </div>
                <div className="flex flex-wrap justify-end gap-2">
                  <button
                    onClick={() => onCorrect(item)}
                    className="rounded-xl bg-emerald-600 px-3 py-2 text-sm font-bold text-white"
                  >
                    Corrigir
                  </button>
                  <button
                    onClick={() =>
                      setExpandedId((current) =>
                        current === item.id ? null : item.id,
                      )
                    }
                    className="rounded-xl bg-blue-600 px-3 py-2 text-sm font-bold text-white"
                  >
                    {expandedId === item.id
                      ? "Ocultar resultados"
                      : "Ver resultados"}
                  </button>
                  <button
                    onClick={() =>
                      setEditing({ ...item, gabarito: [...item.gabarito] })
                    }
                    className="rounded-xl bg-blue-50 px-3 py-2 text-sm font-bold text-blue-700"
                  >
                    Editar gabarito
                  </button>
                  <button
                    onClick={() => onDelete(item)}
                    className="rounded-xl bg-red-50 px-3 py-2 text-sm font-bold text-red-700"
                  >
                    Excluir avaliação
                  </button>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {item.gabarito.map((answer, index) => (
                  <span
                    key={index}
                    className="rounded-lg bg-blue-100 px-2 py-1 text-xs font-bold"
                  >
                    {index + 1}:{answer}
                  </span>
                ))}
              </div>
              {expandedId === item.id && (
                <div className="mt-5 overflow-hidden rounded-2xl border">
                  <div className="bg-blue-100 px-4 py-3 text-sm font-black">
                    Respostas dos alunos
                  </div>
                  {students
                    .filter((student) => student.turmaId === item.turmaId)
                    .map((student) => {
                      const result = results.find(
                        (r) =>
                          r.avaliacaoId === item.id &&
                          r.studentId === student.id,
                      );
                      return (
                        <div key={student.id} className="border-t px-4 py-4">
                          <div className="flex flex-col justify-between gap-2 md:flex-row md:items-center">
                            <div>
                              <b>{student.nome}</b>

                              <div className="text-xs text-blue-500">
                                {result
                                  ? `${result.hits}/${result.total} acertos • Nota ${Number(result.score).toFixed(1)}`
                                  : "Ainda não corrigida"}
                              </div>
                            </div>

                            <div className="flex flex-wrap gap-1">
                              {(result?.answers || []).map((answer, index) => (
                                <span
                                  key={index}
                                  className={`rounded-md px-2 py-1 text-xs font-black ${
                                    answer === item.gabarito[index]
                                      ? "bg-emerald-100 text-emerald-700"
                                      : "bg-red-100 text-red-700"
                                  }`}
                                >
                                  {index + 1}:{answer}
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          ))
        )}
      </div>
      {editing && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-3xl bg-white p-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-bold text-blue-600">
                  EDITAR GABARITO
                </p>
                <h3 className="text-xl font-black">
                  {editing.nomeAtividade || editing.titulo} -{" "}
                  {editing.disciplina}
                </h3>
              </div>
              <button
                onClick={() => setEditing(null)}
                className="rounded-xl p-2 hover:bg-blue-100"
              >
                <X size={20} />
              </button>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-5">
              {editing.gabarito.map((answer, index) => (
                <label
                  key={index}
                  className="rounded-2xl border bg-blue-50 p-3"
                >
                  <span className="text-sm font-black">
                    Questão {index + 1}
                  </span>
                  <select
                    value={answer}
                    onChange={(e) =>
                      setEditing((current) =>
                        current
                          ? {
                              ...current,
                              gabarito: current.gabarito.map((a, i) =>
                                i === index ? (e.target.value as Answer) : a,
                              ),
                            }
                          : current,
                      )
                    }
                    className="mt-2 w-full rounded-xl border bg-white px-2 py-2 font-bold"
                  >
                    {alternatives.map((a) => (
                      <option key={a}>{a}</option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
            <button
              onClick={() => void save()}
              disabled={saving}
              className="mt-5 w-full rounded-2xl bg-emerald-600 py-4 font-black text-white disabled:opacity-50"
            >
              {saving ? "Salvando..." : "Salvar gabarito"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

// ======================================================
// REVISÃO APÓS ESCANEAMENTO
// ======================================================
function ReviewPage({
  avaliacao,
  student,
  answers,
  confidence,
  onChange,
  onBack,
  onConfirm,
  saving,
}: {
  avaliacao: Avaliacao;
  student: Student;
  answers: Answer[];
  confidence: number;
  onChange: (index: number, value: Answer) => void;
  onBack: () => void;
  onConfirm: () => void;
  saving: boolean;
}) {
  const total = avaliacao.quantidadeQuestoes || avaliacao.gabarito.length;
  const hits = answers.reduce(
    (sum, answer, i) => sum + (answer === avaliacao.gabarito[i] ? 1 : 0),
    0,
  );
  const score = Number(
    ((hits / Math.max(total, 1)) * (avaliacao.notaMaxima ?? 10)).toFixed(2),
  );
  const perfect = confidence >= 0.999 && answers.length >= total;
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  return (
    <section className="mx-auto max-w-5xl">
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <p className="text-sm font-bold text-blue-600">
            RESULTADO DA LEITURA
          </p>
          <h2 className="mt-1 text-3xl font-black">Confira antes de salvar</h2>
          <p className="mt-2 text-blue-500">
            {student.nome} • {avaliacao.nomeAtividade || avaliacao.titulo} -{" "}
            {avaliacao.disciplina}
          </p>
        </div>
        <button
          onClick={onBack}
          className="rounded-xl border bg-white px-4 py-2 text-sm font-bold"
        >
          Voltar
        </button>
      </div>
      <div className="grid gap-5 md:grid-cols-[220px_1fr]">
        <div className="rounded-3xl border bg-white p-5 shadow-sm">
          <p className="text-sm text-blue-500">Nota</p>
          <div className="mt-2 text-5xl font-black text-blue-600">
            {score.toFixed(2)}
          </div>
          <p className="mt-2 font-bold">
            {hits}/{total} acertos
          </p>
          <p className="mt-4 text-sm text-blue-500">
            Leitura: {Math.round(confidence * 100)}%
          </p>
        </div>
        <div className="rounded-3xl border bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-black">Respostas identificadas</h3>
              <p className="text-sm text-blue-500">
                A professor(a) pode editar qualquer resposta.
              </p>
            </div>
          </div>
          {!perfect && (
            <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              <b>Dica:</b> a leitura não ficou em 100%. Procure um lugar melhor
              iluminado e, se possível, use o flash da câmera para escanear
              novamente.
            </div>
          )}
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
            {Array.from({ length: total }, (_, index) => answers[index] ?? "—").map((answer, index) => (
              <button
                type="button"
                key={index}
                onClick={() => setEditingIndex(index)}
                aria-label={`Editar questão ${index + 1}, resposta ${answer}`}
                className="rounded-2xl border border-blue-200 bg-blue-50 p-3 text-left transition hover:border-blue-400 hover:bg-blue-50"
              >
                <span className="block text-sm font-black">Questão {index + 1}</span>
                <span className="mt-2 flex h-12 items-center justify-center rounded-xl border-2 border-blue-200 bg-white text-2xl font-black text-blue-700">
                  {answer}
                </span>
                <span className="mt-1 block text-center text-xs text-blue-500">Toque para editar</span>
              </button>
            ))}
          </div>
          <button
            onClick={onConfirm}
            disabled={saving}
            className="mt-5 w-full rounded-2xl bg-emerald-600 py-4 font-black text-white disabled:opacity-50"
          >
            {saving ? "Salvando..." : "Confirmar e salvar resultado"}
          </button>
        </div>
      </div>

      {editingIndex !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-blue-950/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={`Editar resposta da questão ${editingIndex + 1}`}
          onClick={() => setEditingIndex(null)}
        >
          <div
            className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-5 text-center">
              <p className="text-sm font-bold text-blue-600">EDITAR RESPOSTA</p>
              <h3 className="mt-1 text-2xl font-black">Questão {editingIndex + 1}</h3>
              <p className="mt-1 text-sm text-blue-500">Resposta marcada pelo aluno e gabarito oficial</p>
              <div className="mt-3 rounded-2xl bg-blue-50 p-3 text-left text-sm">
                <p><b>Resposta do aluno:</b> {answers[editingIndex] ?? "Não identificada"}</p>
                <p><b>Gabarito:</b> {avaliacao.gabarito[editingIndex] ?? "Não cadastrado"}</p>
                {answers[editingIndex] && avaliacao.gabarito[editingIndex] && (
                  <p className={`mt-2 font-black ${answers[editingIndex] === avaliacao.gabarito[editingIndex] ? "text-emerald-700" : "text-red-700"}`}>
                    {answers[editingIndex] === avaliacao.gabarito[editingIndex] ? "Resposta correta" : "Resposta incorreta"}
                  </p>
                )}
              </div>
              <p className="mt-3 text-sm text-blue-500">Para corrigir manualmente, escolha a alternativa abaixo.</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {alternatives.map((alternative) => (
                <button
                  type="button"
                  key={alternative}
                  onClick={() => {
                    onChange(editingIndex, alternative);
                    setEditingIndex(null);
                  }}
                  className={`flex h-20 items-center justify-center rounded-2xl border-2 text-3xl font-black transition ${
                    answers[editingIndex] === alternative
                      ? "border-blue-600 bg-blue-600 text-white shadow-lg"
                      : "border-blue-200 bg-blue-50 text-blue-800 hover:border-blue-400 hover:bg-blue-50"
                  }`}
                >
                  {alternative}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setEditingIndex(null)}
              className="mt-4 w-full rounded-xl border py-3 font-bold text-blue-600"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

// ======================================================
// NOVA AVALIAÇÃO
// ======================================================

function Setup({
  avaliacaoConfigId,
  setAvaliacaoConfigId,
  avaliacaoOptions,
  bimestre,
  setBimestre,
  disciplina,
  setDisciplina,
  disciplinas,
  turmaId,
  setTurmaId,
  turmas,
  keyAnswers,
  updateKey,
  onNext,
  saving,
}: {
  avaliacaoConfigId: string;
  setAvaliacaoConfigId: (value: string) => void;
  avaliacaoOptions: AvaliacaoConfig[];
  bimestre: string;
  setBimestre: (value: string) => void;
  disciplina: string;
  setDisciplina: (value: string) => void;
  disciplinas: string[];
  turmaId: string;
  setTurmaId: (value: string) => void;
  turmas: Turma[];
  keyAnswers: Answer[];
  updateKey: (index: number, value: Answer) => void;
  onNext: () => void;
  saving: boolean;
}) {
  const selected =
    avaliacaoOptions.find((item) => item.id === avaliacaoConfigId) ??
    avaliacaoOptions[0];
  return (
    <section className="mx-auto max-w-4xl">
      <div className="mb-6">
        <p className="text-sm font-bold text-blue-600">NOVA AVALIAÇÃO</p>
        <h2 className="mt-1 text-3xl font-black">Preparar avaliação</h2>
        <p className="mt-2 text-blue-500">
          Selecione o nome da avaliação cadastrado nas configurações e informe o
          gabarito oficial.
        </p>
      </div>
      <div className="space-y-5 rounded-3xl border bg-white p-5 shadow-sm md:p-7">
        <div className="grid gap-4 md:grid-cols-3">
          <label>
            <span className="mb-2 block text-sm font-bold">
              Nome da avaliação
            </span>
            <select
              value={selected?.id ?? ""}
              onChange={(e) => setAvaliacaoConfigId(e.target.value)}
              className="w-full rounded-2xl border bg-white px-4 py-3 font-bold"
            >
              {avaliacaoOptions.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.nome}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-xs text-blue-500">
              Selecione o nome da avaliação cadastrado nas configurações.
            </span>
          </label>
          <label>
            <span className="mb-2 block text-sm font-bold">Referência</span>
            <input
              readOnly
              value={selected?.referencia ?? "—"}
              className="w-full cursor-not-allowed rounded-2xl border bg-blue-100 px-4 py-3 font-bold"
            />
            <span className="mt-1 block text-xs text-blue-500">
              Referência fixa da coluna na planilha. Ela não pode ser alterada
              nesta tela.
            </span>
          </label>
          <label>
            <span className="mb-2 block text-sm font-bold">Nota máxima</span>
            <input
              readOnly
              value={selected?.nota ?? "—"}
              className="w-full cursor-not-allowed rounded-2xl border bg-blue-100 px-4 py-3 font-bold"
            />
          </label>
          <label>
            <span className="mb-2 block text-sm font-bold">Disciplina</span>
            <select
              value={disciplina}
              onChange={(e) => setDisciplina(e.target.value)}
              className="w-full rounded-2xl border bg-white px-4 py-3"
            >
              {disciplinas.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="mb-2 block text-sm font-bold">Bimestre</span>
            <select
              value={bimestre}
              onChange={(e) => setBimestre(e.target.value)}
              className="w-full rounded-2xl border bg-white px-4 py-3"
            >
              <option>1º Bimestre</option>
              <option>2º Bimestre</option>
              <option>3º Bimestre</option>
              <option>4º Bimestre</option>
            </select>
          </label>
          <label>
            <span className="mb-2 block text-sm font-bold">Turma</span>
            <select
              value={turmaId}
              onChange={(e) => setTurmaId(e.target.value)}
              className="w-full rounded-2xl border bg-white px-4 py-3"
            >
              <option value="">Selecione uma turma</option>
              {turmas.map((turma) => (
                <option key={turma.id} value={turma.id}>
                  {turma.nome} — {turma.ano}
                </option>
              ))}
            </select>
          </label>
        </div>
        {turmas.length === 0 && (
          <div className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-800">
            Cadastre uma turma antes de criar uma avaliação.
          </div>
        )}
        <div>
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm font-bold">Gabarito oficial</span>
            <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-bold">
              {selected?.questoes ?? keyAnswers.length} questões
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {keyAnswers
              .slice(0, selected?.questoes ?? keyAnswers.length)
              .map((answer, index) => (
                <div key={index} className="rounded-2xl border bg-blue-50 p-3">
                  <span className="text-sm font-black">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <select
                    value={answer}
                    onChange={(e) => updateKey(index, e.target.value as Answer)}
                    className="mt-2 w-full rounded-xl border bg-white px-2 py-2 font-bold"
                  >
                    {alternatives.map((a) => (
                      <option key={a} value={a}>
                        {a}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
          </div>
        </div>
        <button
          disabled={saving || !turmas.length || !selected}
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

          <p className="mt-2 text-blue-500">
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

              <p className="text-xs text-blue-500">
                Alunos da turma {avaliacao.turmaNome}
              </p>
            </div>

            <Users className="text-blue-600" size={20} />
          </div>

          <div className="mt-4 max-h-105 space-y-2 overflow-y-auto">
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
                      : "hover:bg-blue-50"
                  }`}
                >
                  <p className="font-bold">{student.nome}</p>

                  <p className="text-xs text-blue-500">{student.turmaNome}</p>
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

            <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-blue-500">
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

                {saving ? "Salvando..." : "Corrigir manualmente"}
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
// CADASTRAR NOTAS
// ======================================================

function GradesPage({
  students,
  turmas,
  grades,
  results,
  avaliacoes,
  avaliacoesConfig,
  referencias,
  disciplinas,
  onSave,
  onExport,
}: {
  students: Student[];
  turmas: Turma[];
  grades: Record<string, GradeEntry>;
  results: Result[];
  avaliacoes: Avaliacao[];
  avaliacoesConfig: AvaliacaoConfig[];
  referencias: string[];
  disciplinas: string[];
  onSave: (
    student: Student,
    values: Record<string, number | undefined>,
    disciplina: string,
    bimestre: string,
  ) => Promise<void>;
  onExport: () => void;
}) {
  const [turmaId, setTurmaId] = useState("");
  const [disciplina, setDisciplina] = useState(disciplinas[0] ?? "");
  const [bimestre, setBimestre] = useState("4º Bimestre");
  const [drafts, setDrafts] = useState<
    Record<string, Record<string, number | undefined>>
  >({});
  const [savingAll, setSavingAll] = useState(false);

  useEffect(() => {
    if (!disciplinas.includes(disciplina)) {
      setDisciplina(disciplinas[0] ?? "");
    }
  }, [disciplinas, disciplina]);

  // Mantém a mesma referência do array enquanto alunos/turma não mudarem.
  // Isso evita que o useEffect que carrega os valores salvos seja executado
  // novamente a cada tecla digitada e apague o valor que está sendo editado.
  const turmaStudents = useMemo(
    () => students.filter((student) => !turmaId || student.turmaId === turmaId),
    [students, turmaId],
  );

  // A lista de colunas vem EXCLUSIVAMENTE das Referências de colunas
  // cadastradas em Configurações. Nunca vem das avaliações.
  const referenciasUnicas = useMemo(() => {
    const seen = new Set<string>();
    const unique: string[] = [];

    referencias.forEach((item) => {
      const referencia = item.trim();
      if (!referencia) return;

      const key = referencia.toLowerCase();
      if (seen.has(key)) return;

      seen.add(key);
      unique.push(referencia);
    });

    return unique;
  }, [referencias]);

  const timeOf = (value: any) =>
    value?.toMillis?.() ??
    (value?.seconds
      ? Number(value.seconds) * 1000
      : Date.parse(String(value ?? "")) || 0);

  // Resolve a referência de avaliações antigas que eventualmente não
  // tenham o campo `referencia`, mas tenham `avaliacaoConfigId`.
  const configById = useMemo(() => {
    const map = new Map<string, AvaliacaoConfig>();
    avaliacoesConfig.forEach((config) => map.set(config.id, config));
    return map;
  }, [avaliacoesConfig]);

  const referenceOfEvaluation = (avaliacao: Avaliacao) => {
    const direct = (avaliacao.referencia ?? "").trim();
    if (direct) return direct;

    const config = avaliacao.avaliacaoConfigId
      ? configById.get(avaliacao.avaliacaoConfigId)
      : undefined;

    return config?.referencia?.trim() ?? "";
  };

  // Para cada referência existe SOMENTE uma avaliação ativa: a última
  // avaliação cadastrada daquela referência dentro dos filtros atuais.
  const latestEvaluationByReference = useMemo(() => {
    const map = new Map<string, Avaliacao>();

    avaliacoes
      .filter(
        (avaliacao) =>
          avaliacao.disciplina === disciplina &&
          avaliacao.bimestre === bimestre &&
          (!turmaId || avaliacao.turmaId === turmaId),
      )
      .forEach((avaliacao) => {
        const referencia = referenceOfEvaluation(avaliacao);
        if (!referencia) return;

        const key = referencia.toLowerCase();
        if (!referenciasUnicas.some((item) => item.toLowerCase() === key)) {
          return;
        }

        const previous = map.get(key);
        if (
          !previous ||
          timeOf(avaliacao.createdAt) >= timeOf(previous.createdAt)
        ) {
          map.set(key, avaliacao);
        }
      });

    return map;
  }, [
    avaliacoes,
    disciplina,
    bimestre,
    turmaId,
    referenciasUnicas,
    configById,
  ]);

  // Se ainda não houver avaliação cadastrada para uma referência, usamos
  // o último modelo/configuração dessa referência apenas para mostrar o
  // limite da nota no campo de notas.
  const latestResultByStudentReference = useMemo(() => {
    const map = new Map<string, Result>();

    latestEvaluationByReference.forEach((avaliacao, referenceKey) => {
      results
        .filter(
          (result) =>
            result.studentId &&
            result.disciplina === disciplina &&
            result.bimestre === bimestre &&
            result.avaliacaoId === avaliacao.id,
        )
        .forEach((result) => {
          const key = `${result.studentId}__${referenceKey}`;
          const previous = map.get(key);
          if (
            !previous ||
            timeOf(result.createdAt) >= timeOf(previous.createdAt)
          ) {
            map.set(key, result);
          }
        });
    });

    return map;
  }, [results, disciplina, bimestre, latestEvaluationByReference]);

  const latestConfigByReference = useMemo(() => {
    const map = new Map<string, AvaliacaoConfig>();

    avaliacoesConfig.forEach((config) => {
      const referencia = config.referencia.trim();
      if (!referencia) return;
      map.set(referencia.toLowerCase(), config);
    });

    return map;
  }, [avaliacoesConfig]);

  useEffect(() => {
    const next: Record<string, Record<string, number | undefined>> = {};

    turmaStudents.forEach((student) => {
      const grade = Object.values(grades).find(
        (item) =>
          item.studentId === student.id &&
          item.disciplina === disciplina &&
          item.bimestre === bimestre,
      );

      const row: Record<string, number | undefined> = {};

      referenciasUnicas.forEach((referencia) => {
        const key = referencia.toLowerCase();
        const latest = latestEvaluationByReference.get(key);
        const config = latestConfigByReference.get(key);

        const legacySaved =
          config?.id === "atv1"
            ? grade?.atv1
            : config?.id === "atv2"
              ? grade?.atv2
              : config?.id === "atv3"
                ? grade?.atv3
                : undefined;

        // Nova estrutura: a nota é armazenada pela referência.
        const savedByReference = grade?.notas?.[referencia];

        // Compatibilidade com a estrutura anterior, caso a nota antiga
        // tenha sido salva usando o ID da configuração.
        const savedByConfig = config ? grade?.notas?.[config.id] : undefined;

        const latestResult = latest
          ? latestResultByStudentReference.get(`${student.id}__${key}`)
          : undefined;

        // O resultado da última avaliação tem prioridade. Nunca usamos o
        // resultado de uma avaliação anterior da mesma referência.
        row[referencia] =
          latestResult?.score ??
          savedByReference ??
          savedByConfig ??
          legacySaved;
      });

      next[student.id] = row;
    });

    setDrafts(next);
  }, [
    turmaStudents,
    grades,
    results,
    disciplina,
    bimestre,
    referenciasUnicas,
    latestEvaluationByReference,
    latestResultByStudentReference,
    latestConfigByReference,
  ]);

  const setValue = (studentId: string, referencia: string, value: string) => {
    setDrafts((current) => ({
      ...current,
      [studentId]: {
        ...current[studentId],
        [referencia]: value === "" ? undefined : Number(value),
      },
    }));
  };

  return (
    <section className="mx-auto max-w-7xl">
      <div className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <p className="text-sm font-bold text-blue-600">NOTAS</p>
          <h2 className="mt-1 text-3xl font-black">Cadastrar notas</h2>
          <p className="mt-2 text-blue-500">
            Cada referência cadastrada aparece uma única vez. Quando houver
            várias avaliações com a mesma referência, somente a mais
            recentemente cadastrada é considerada.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            onClick={async () => {
              if (savingAll) return;
              setSavingAll(true);
              try {
                for (const student of turmaStudents) {
                  await onSave(
                    student,
                    drafts[student.id] || {},
                    disciplina,
                    bimestre,
                  );
                }
              } finally {
                setSavingAll(false);
              }
            }}
            disabled={savingAll || !turmaStudents.length}
            className="inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-5 py-3 font-black text-white disabled:opacity-50"
          >
            {savingAll ? "Salvando notas..." : "Salvar notas"}
          </button>

          <button
            onClick={onExport}
            className="inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-5 py-3 font-black text-white"
          >
            <FileSpreadsheet size={18} />
            Exportar planilha
          </button>
        </div>
      </div>

      <div className="mb-5 grid gap-3 rounded-3xl border bg-white p-4 md:grid-cols-3">
        <select
          value={turmaId}
          onChange={(event) => setTurmaId(event.target.value)}
          className="rounded-2xl border px-4 py-3"
        >
          <option value="">Todas as turmas</option>
          {turmas.map((turma) => (
            <option key={turma.id} value={turma.id}>
              {turma.nome} — {turma.ano}
            </option>
          ))}
        </select>

        <select
          value={disciplina}
          onChange={(event) => setDisciplina(event.target.value)}
          className="rounded-2xl border px-4 py-3"
        >
          {disciplinas.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>

        <select
          value={bimestre}
          onChange={(event) => setBimestre(event.target.value)}
          className="rounded-2xl border px-4 py-3"
        >
          <option>1º Bimestre</option>
          <option>2º Bimestre</option>
          <option>3º Bimestre</option>
          <option>4º Bimestre</option>
        </select>
      </div>

      <div className="overflow-x-auto rounded-3xl border bg-white shadow-sm">
        <table className="w-full min-w-225 text-sm">
          <thead className="bg-blue-100">
            <tr>
              <th className="px-4 py-3 text-left">Aluno</th>

              {referenciasUnicas.map((referencia) => {
                const key = referencia.toLowerCase();
                const latest = latestEvaluationByReference.get(key);
                const fallbackConfig = latestConfigByReference.get(key);
                const headerName =
                  latest?.nomeAtividade ?? fallbackConfig?.nome;
                const maxNote = latest?.notaMaxima ?? fallbackConfig?.nota;

                return (
                  <th key={key} className="px-4 py-3">
                    <div>{referencia}</div>
                    {headerName && maxNote !== undefined && (
                      <div className="text-xs font-normal text-blue-500">
                        {headerName}
                      </div>
                    )}
                  </th>
                );
              })}

              <th className="px-4 py-3">Média</th>
            </tr>
          </thead>

          <tbody>
            {turmaStudents.map((student) => {
              const draft = drafts[student.id] || {};
              const values = referenciasUnicas
                .map((referencia) => draft[referencia])
                .filter((value): value is number => typeof value === "number");
              const media = values.length
                ? (
                    values.reduce((total, value) => total + value, 0) /
                    values.length
                  ).toFixed(2)
                : "—";

              return (
                <tr key={student.id} className="border-t">
                  <td className="px-4 py-4 font-bold">{student.nome}</td>

                  {referenciasUnicas.map((referencia) => {
                    const key = referencia.toLowerCase();
                    const latest = latestEvaluationByReference.get(key);
                    const fallbackConfig = latestConfigByReference.get(key);
                    const maxNote = latest?.notaMaxima ?? fallbackConfig?.nota;

                    const evaluationResult = latestResultByStudentReference.get(
                      `${student.id}__${key}`,
                    );
                    const lockedByEvaluation = evaluationResult !== undefined;

                    return (
                      <td key={key} className="px-4 py-3">
                        {lockedByEvaluation ? (
                          <div className="flex flex-col items-center gap-1">
                            <div className="flex w-24 items-center justify-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-center font-black text-amber-800">
                              <LockKeyhole size={14} />
                              {Number(evaluationResult.score).toFixed(1)}
                            </div>
                            <span className="text-[10px] font-bold text-amber-700">
                              Avaliação
                            </span>
                          </div>
                        ) : (
                          <input
                            type="number"
                            min="0"
                            max={maxNote}
                            step="0.1"
                            value={draft[referencia] ?? ""}
                            onChange={(event) =>
                              setValue(
                                student.id,
                                referencia,
                                event.target.value,
                              )
                            }
                            className="w-24 rounded-xl border px-3 py-2 text-center"
                          />
                        )}
                      </td>
                    );
                  })}

                  <td className="px-4 py-4 text-center font-black text-blue-600">
                    {media}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {!turmaStudents.length && (
          <div className="p-10 text-center text-blue-500">
            Nenhum aluno encontrado.
          </div>
        )}
      </div>
    </section>
  );
}


// ======================================================
// AUTENTICAÇÃO E AUTORIZAÇÃO DE PROFESSORES
// ======================================================
type AuthorizedTeacher = { Nome?: string; Email?: string };

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [teacher, setTeacher] = useState<AuthorizedTeacher | null>(null);
  const [checking, setChecking] = useState(true);
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [authError, setAuthError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPasswordPanel, setShowPasswordPanel] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [passwordMessage, setPasswordMessage] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [resetMessage, setResetMessage] = useState("");
  const [resetError, setResetError] = useState("");

  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | undefined;

    // Mantém a sessão no próprio navegador mesmo após fechar a página.
    setPersistence(auth, browserLocalPersistence).then(() => {
      if (!active) return;
      unsubscribe = onAuthStateChanged(auth, async (current) => {
        setUser(current);
        if (!current || !current.email) {
          setTeacher(null);
          setChecking(false);
          return;
        }
        try {
          const normalizedEmail = current.email.trim().toLowerCase();
          const authorized = await getDocs(
            query(collection(db, "professores"), where("Email", "==", normalizedEmail)),
          );
          if (authorized.empty) {
            setTeacher(null);
            localStorage.removeItem(`corretor-professor-${current.uid}`);
            await signOut(auth);
            setAuthError("Este e-mail não está autorizado. Solicite seu cadastro à administração.");
          } else {
            // Cria/atualiza o vínculo seguro pelo UID. As regras validam
            // authorizedDocId contra o cadastro previamente liberado pela administração.
            const authorizedDoc = authorized.docs[0];
            const authorizedData = authorizedDoc.data() as AuthorizedTeacher;
            const teacherData = {
              ...authorizedData,
              Email: normalizedEmail,
              Nome: String(authorizedData.Nome ?? current.displayName ?? ""),
              uid: current.uid,
              authorizedDocId: authorizedDoc.id,
              atualizadoEm: serverTimestamp(),
            };
            await setDoc(doc(db, "professores", current.uid), teacherData, { merge: true });
            setTeacher(teacherData);
            localStorage.setItem(`corretor-professor-${current.uid}`, JSON.stringify(teacherData));
            setAuthError("");
          }
        } catch (e) {
          console.error(e);
          const cached = localStorage.getItem(`corretor-professor-${current.uid}`);
          const code = (e as { code?: string })?.code ?? "";
          if (cached && ["unavailable", "deadline-exceeded", "network-request-failed"].some((part) => code.includes(part))) {
            // Usa apenas o vínculo previamente validado neste navegador; as regras do Firestore continuam protegendo os dados.
            setTeacher(JSON.parse(cached) as AuthorizedTeacher);
            setAuthError("");
          } else {
            setTeacher(null);
            setAuthError("Não foi possível validar seu acesso. Confira sua conexão e tente novamente.");
          }
        } finally {
          setChecking(false);
        }
      });
    }).catch((e) => {
      console.error("Não foi possível ativar a sessão persistente:", e);
      setAuthError("Não foi possível manter sua sessão neste navegador.");
      setChecking(false);
    });

    return () => {
      active = false;
      unsubscribe?.();
    };
  }, []);

  const handleSignOut = async () => {
    if (user) localStorage.removeItem(`corretor-professor-${user.uid}`);
    await signOut(auth);
    setTeacher(null);
    setUser(null);
  };

  const handleChangePassword = async (event: FormEvent) => {
    event.preventDefault();
    setPasswordError("");
    setPasswordMessage("");
    if (!user || !user.email) return;
    if (newPassword.length < 6) {
      setPasswordError("A nova senha deve ter pelo menos 6 caracteres.");
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setPasswordError("A confirmação não corresponde à nova senha.");
      return;
    }
    setBusy(true);
    try {
      const credential = EmailAuthProvider.credential(user.email, currentPassword);
      await reauthenticateWithCredential(user, credential);
      await updatePassword(user, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmNewPassword("");
      setPasswordMessage("Senha alterada com sucesso!");
    } catch (error) {
      const code = (error as { code?: string }).code ?? "";
      const messages: Record<string, string> = {
        "auth/invalid-credential": "A senha atual está incorreta.",
        "auth/wrong-password": "A senha atual está incorreta.",
        "auth/weak-password": "A nova senha deve ter pelo menos 6 caracteres.",
        "auth/requires-recent-login": "Sua sessão expirou para esta operação. Saia e entre novamente antes de alterar a senha.",
        "auth/too-many-requests": "Muitas tentativas. Aguarde alguns minutos e tente novamente.",
      };
      setPasswordError(messages[code] ?? "Não foi possível alterar a senha. Confira a senha atual e tente novamente.");
    } finally {
      setBusy(false);
    }
  };

  const handleAuth = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setAuthError("");
    try {
      if (mode === "signup") {
        const normalizedEmail = email.trim().toLowerCase();
        if (!fullName.trim()) { setAuthError("Informe seu nome completo."); return; }
        if (password !== confirmPassword) { setAuthError("As senhas não coincidem."); return; }
        // Cria a conta e, já autenticado, consulta a lista de professores autorizados.
        const credential = await createUserWithEmailAndPassword(auth, normalizedEmail, password);
        const allowed = await getDocs(query(collection(db, "professores"), where("Email", "==", normalizedEmail)));
        if (allowed.empty) {
          await signOut(auth);
          setAuthError("Este e-mail não está autorizado. Solicite sua inclusão à administração.");
          return;
        }
        // Cria o vínculo no documento cujo ID é o UID autenticado.
        // As regras só permitem isso quando authorizedDocId aponta para um
        // cadastro administrativo cujo campo Email corresponde ao usuário.
        const teacherName = fullName.trim();
        const teacherData = {
          Nome: teacherName,
          Email: normalizedEmail,
          uid: credential.user.uid,
          authorizedDocId: allowed.docs[0].id,
          atualizadoEm: serverTimestamp(),
        };
        await setDoc(
          doc(db, "professores", credential.user.uid),
          teacherData,
          { merge: true },
        );
        await updateProfile(credential.user, { displayName: teacherName });
        const updatedTeacher = {
          ...allowed.docs[0].data(),
          ...teacherData,
        } as AuthorizedTeacher;
        setTeacher(updatedTeacher);
        localStorage.setItem(
          `corretor-professor-${credential.user.uid}`,
          JSON.stringify(updatedTeacher),
        );
      } else await signInWithEmailAndPassword(auth, email.trim().toLowerCase(), password);
    } catch (e) {
      const err = e as { code?: string };
      const messages: Record<string, string> = {
        "auth/invalid-credential": "E-mail ou senha incorretos.",
        "auth/email-already-in-use": "Este e-mail já possui conta. Faça login.",
        "auth/weak-password": "A senha deve ter pelo menos 6 caracteres.",
        "auth/invalid-email": "Informe um e-mail válido.",
      };
      setAuthError(messages[err.code ?? ""] ?? "Não foi possível autenticar. Tente novamente.");
    } finally { setBusy(false); }
  };

  const handleForgotPassword = async () => {
    setResetError("");
    setResetMessage("");
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      setResetError("Digite seu e-mail no campo acima para receber o link de recuperação.");
      return;
    }
    setBusy(true);
    try {
      await sendPasswordResetEmail(auth, normalizedEmail);
      setResetMessage("Se esse e-mail estiver cadastrado, você receberá um link para redefinir sua senha. Verifique também a caixa de spam.");
    } catch (error) {
      const code = (error as { code?: string }).code ?? "";
      const messages: Record<string, string> = {
        "auth/invalid-email": "Digite um endereço de e-mail válido.",
        "auth/too-many-requests": "Muitas tentativas. Aguarde alguns minutos e tente novamente.",
        "auth/user-not-found": "Se esse e-mail estiver cadastrado, você receberá um link para redefinir sua senha. Confira também a caixa de spam.",
      };
      setResetError(messages[code] ?? "Não foi possível enviar o e-mail de recuperação. Confira o endereço e tente novamente.");
    } finally {
      setBusy(false);
    }
  };

  const handleGoogle = async () => {
    setBusy(true); setAuthError("");
    try { await signInWithPopup(auth, new GoogleAuthProvider()); }
    catch (e) { console.error(e); setAuthError("Não foi possível entrar com Google."); }
    finally { setBusy(false); }
  };

  if (checking) return <div className="min-h-screen grid place-items-center bg-blue-50 text-blue-600 font-semibold">Verificando acesso…</div>;
  if (user && teacher) return <>
    <div className="flex items-center justify-between gap-3 bg-blue-900 px-5 py-3 text-white text-sm">
      <strong className="truncate">Olá, {teacher.Nome || user.displayName || user.email}!</strong>
      <div className="flex shrink-0 items-center gap-2">
        <button onClick={() => { setShowPasswordPanel(true); setPasswordError(""); setPasswordMessage(""); }} className="inline-flex items-center gap-2 rounded-lg bg-white/10 px-3 py-2 hover:bg-white/20">
          <LockKeyhole size={16} /> Alterar senha
        </button>
        <button onClick={handleSignOut} className="rounded-lg bg-white/10 px-3 py-2 hover:bg-white/20">Sair</button>
      </div>
    </div>
    {showPasswordPanel && (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/50 p-4" role="dialog" aria-modal="true" aria-labelledby="change-password-title">
        <section className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
          <div className="mb-5 flex items-start justify-between gap-3">
            <div>
              <h2 id="change-password-title" className="text-xl font-bold text-slate-900">Alterar senha</h2>
              <p className="mt-1 text-sm text-slate-500">Digite sua senha atual e escolha uma nova senha.</p>
            </div>
            <button type="button" onClick={() => setShowPasswordPanel(false)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Fechar"><X size={20} /></button>
          </div>
          <form onSubmit={handleChangePassword} className="space-y-4">
            <label className="block text-sm font-semibold text-slate-700">Senha atual
              <input type="password" required autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" placeholder="Digite sua senha atual" />
            </label>
            <label className="block text-sm font-semibold text-slate-700">Nova senha
              <input type="password" required minLength={6} autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" placeholder="Mínimo de 6 caracteres" />
            </label>
            <label className="block text-sm font-semibold text-slate-700">Confirmar nova senha
              <input type="password" required minLength={6} autoComplete="new-password" value={confirmNewPassword} onChange={(e) => setConfirmNewPassword(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" placeholder="Digite novamente a nova senha" />
            </label>
            {passwordError && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{passwordError}</p>}
            {passwordMessage && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{passwordMessage}</p>}
            <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => setShowPasswordPanel(false)} className="rounded-xl border border-slate-300 px-4 py-3 font-semibold text-slate-700 hover:bg-slate-50">Fechar</button>
              <button type="submit" disabled={busy} className="rounded-xl bg-blue-700 px-5 py-3 font-semibold text-white hover:bg-blue-800 disabled:opacity-60">{busy ? "Salvando…" : "Salvar nova senha"}</button>
            </div>
          </form>
        </section>
      </div>
    )}
    <MainApp />
  </>;

  return <main className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-blue-100 flex items-center justify-center p-4"><section className="w-full max-w-md rounded-3xl bg-white p-8 shadow-xl border border-blue-100"><img src="/logo-corretor.png" alt="Logo Corretor Gabarito" className="mx-auto mb-5 h-28 w-28 rounded-full object-cover shadow-md"/><h1 className="text-center text-2xl font-black text-blue-800">Corretor Gabarito</h1><p className="mt-2 text-center text-blue-500">Acesso exclusivo para professores</p><form onSubmit={handleAuth} className="mt-7 space-y-4">{mode==="signup" && <label className="block text-sm font-semibold text-blue-700">Nome completo<input type="text" required value={fullName} onChange={e=>setFullName(e.target.value)} className="mt-1 w-full rounded-xl border border-blue-200 px-4 py-3 outline-none focus:border-blue-500" placeholder="Seu nome completo"/></label>}<label className="block text-sm font-semibold text-blue-700">E-mail<input type="email" required value={email} onChange={e=>setEmail(e.target.value)} className="mt-1 w-full rounded-xl border border-blue-200 px-4 py-3 outline-none focus:border-blue-500" placeholder="professor@email.com"/></label><label className="block text-sm font-semibold text-blue-700">Senha
<div className="relative mt-1">
<input type={showLoginPassword ? "text" : "password"} required minLength={6} value={password} onChange={e=>{setPassword(e.target.value);setResetError("");setResetMessage("");}} className="w-full rounded-xl border border-blue-200 px-4 py-3 pr-12 outline-none focus:border-blue-500" placeholder="Sua senha" autoComplete={mode === "login" ? "current-password" : "new-password"}/>
<button type="button" onClick={()=>setShowLoginPassword(v=>!v)} className="absolute inset-y-0 right-0 flex items-center px-4 text-blue-500 hover:text-blue-800" aria-label={showLoginPassword ? "Ocultar senha" : "Mostrar senha"} title={showLoginPassword ? "Ocultar senha" : "Mostrar senha"}>{showLoginPassword ? <EyeOff size={19}/> : <Eye size={19}/>}</button>
</div></label>
{mode==="signup" && <label className="block text-sm font-semibold text-blue-700">Confirmar senha
<div className="relative mt-1"><input type={showConfirmPassword ? "text" : "password"} required minLength={6} value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)} className="w-full rounded-xl border border-blue-200 px-4 py-3 pr-12 outline-none focus:border-blue-500" placeholder="Digite a senha novamente" autoComplete="new-password"/><button type="button" onClick={()=>setShowConfirmPassword(v=>!v)} className="absolute inset-y-0 right-0 flex items-center px-4 text-blue-500 hover:text-blue-800" aria-label={showConfirmPassword ? "Ocultar confirmação de senha" : "Mostrar confirmação de senha"} title={showConfirmPassword ? "Ocultar senha" : "Mostrar senha"}>{showConfirmPassword ? <EyeOff size={19}/> : <Eye size={19}/>}</button></div></label>}
{mode==="login" && <div className="-mt-1 text-right"><button type="button" onClick={handleForgotPassword} disabled={busy} className="text-sm font-semibold text-blue-600 underline-offset-4 hover:text-blue-800 hover:underline disabled:opacity-60">Esqueci minha senha</button></div>}
{resetError && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{resetError}</p>}
{resetMessage && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{resetMessage}</p>}{authError && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{authError}</p>}<button disabled={busy} className="w-full rounded-xl bg-blue-600 py-3 font-bold text-white hover:bg-blue-700 disabled:opacity-60">{busy?"Aguarde…":mode==="login"?"Entrar":"Cadastrar"}</button></form><div className="my-4 flex items-center gap-3 text-xs text-blue-400"><span className="h-px flex-1 bg-blue-200"/>ou<span className="h-px flex-1 bg-blue-200"/></div><button onClick={handleGoogle} disabled={busy} className="flex w-full items-center justify-center gap-3 rounded-lg border border-[#dadce0] bg-white py-3 text-[15px] font-medium text-[#3c4043] shadow-sm hover:bg-[#f8faff] hover:border-[#d2e3fc] disabled:opacity-60"><svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.65 13.45 24 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.92c-.58 2.96-2.26 5.47-4.78 7.16l7.73 6C44.37 37.95 46.98 31.7 46.98 24.55z"/><path fill="#FBBC05" d="M10.53 28.59A14.4 14.4 0 0 1 9.75 24c0-1.59.28-3.12.78-4.59l-7.98-6.19A23.93 23.93 0 0 0 0 24c0 3.87.93 7.52 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.9-5.82l-7.73-6c-2.14 1.44-4.88 2.3-8.17 2.3-6.28 0-11.6-4.24-13.47-9.9l-7.97 6.2C6.51 42.62 14.62 48 24 48z"/></svg>Continuar com Google</button><p className="mt-6 text-center text-sm text-blue-500">{mode==="login"?"Ainda não tem conta?":"Já possui conta?"} <button onClick={()=>{setMode(mode==="login"?"signup":"login");setAuthError("");}} className="font-bold text-blue-600">{mode==="login"?"Cadastrar":"Fazer login"}</button></p><p className="mt-4 text-center text-xs text-blue-400">Cadastro e acesso somente para e-mails autorizados.</p></section></main>;
}
