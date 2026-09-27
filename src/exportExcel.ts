import * as XLSX from "xlsx";

export type ExportResult = {
  student: string;
  studentId?: string;
  disciplina?: string;
  turma?: string;
  turmaId?: string;
  avaliacaoId?: string;
  avaliacaoNome?: string;
  nomeAtividade?: string;
  bimestre?: string;
  score: number;
};

export type ExportAvaliacao = {
  id: string;
  disciplina: string;
  nomeAtividade?: string;
  bimestre?: string;
};

export type ExportStudent = { id: string; nome: string; turmaId: string };

export type ExportGrade = {
  studentId: string;
  student: string;
  disciplina: string;
  turmaId: string;
  turmaNome: string;
  turmaAno: number;
  bimestre: string;
  atv1?: number;
  atv2?: number;
  atv3?: number;
};

function safeSheetName(value: string) {
  return value.replace(/[\\\/?*\[\]:]/g, " ").slice(0, 31).trim() || "Resultados";
}

export function exportResults(
  results: ExportResult[],
  avaliacoes: ExportAvaliacao[],
  students: ExportStudent[],
  filename = "resultados.xlsx",
  grades: ExportGrade[] = [],
) {
  const wb = XLSX.utils.book_new();
  const disciplines = [...new Set([
    ...avaliacoes.map((a) => a.disciplina),
    ...grades.map((g) => g.disciplina),
    ...results.map((r) => r.disciplina || ""),
  ].filter(Boolean))];

  for (const disciplina of disciplines) {
    const disciplineEvaluations = avaliacoes.filter((a) => a.disciplina === disciplina);
    const bimestres = [...new Set([
      ...disciplineEvaluations.map((a) => a.bimestre || "Bimestre não informado"),
      ...grades.filter((g) => g.disciplina === disciplina).map((g) => g.bimestre || "Bimestre não informado"),
      ...results.filter((r) => r.disciplina === disciplina).map((r) => r.bimestre || "Bimestre não informado"),
    ])];

    for (const bimestre of bimestres) {
      const sheetRows = students
        .filter((student) => grades.some((g) => g.studentId === student.id && g.disciplina === disciplina && (g.bimestre || "Bimestre não informado") === bimestre) || results.some((r) => r.studentId === student.id && r.disciplina === disciplina && (r.bimestre || "Bimestre não informado") === bimestre))
        .map((student) => {
          const grade = grades.find((g) => g.studentId === student.id && g.disciplina === disciplina && (g.bimestre || "Bimestre não informado") === bimestre);
          const studentResults = results.filter((r) => r.studentId === student.id && r.disciplina === disciplina && (r.bimestre || "Bimestre não informado") === bimestre);
          const getScore = (name: string) => studentResults.find((r) => (r.nomeAtividade || r.avaliacaoNome) === name)?.score ?? "";
          const atv1 = grade?.atv1 ?? getScore("Atividade 1");
          const atv2 = grade?.atv2 ?? getScore("Atividade 2");
          const atv3 = grade?.atv3 ?? getScore("Atividade 3");
          const scores = [atv1, atv2, atv3].filter((v) => v !== "") as number[];
          const media = scores.length ? Number((scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2)) : "";
          return { Aluno: student.nome, Atv1: atv1, Atv2: atv2, Atv3: atv3, Média: media };
        });

      if (sheetRows.length) {
        const name = safeSheetName(`${bimestre} - ${disciplina}`);
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sheetRows), name);
      }
    }
  }

  if (!wb.SheetNames.length) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([{ Aluno: "", Atv1: "", Atv2: "", Atv3: "", Média: "" }]), "Resultados");
  }

  XLSX.writeFile(wb, filename);
}
