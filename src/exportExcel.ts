import * as XLSX from "xlsx";

export type ExportResult = {
  student: string;
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

function safeSheetName(value: string) {
  return value.replace(/[\\\/?*\[\]:]/g, " ").slice(0, 31).trim() || "Resultados";
}

export function exportResults(
  results: ExportResult[],
  avaliacoes: ExportAvaliacao[],
  students: ExportStudent[],
  filename = "resultados.xlsx",
) {
  const wb = XLSX.utils.book_new();
  const disciplines = [...new Set(avaliacoes.map((a) => a.disciplina).filter(Boolean))];

  for (const disciplina of disciplines) {
    const disciplineEvaluations = avaliacoes.filter((a) => a.disciplina === disciplina);
    const bimestres = [...new Set(disciplineEvaluations.map((a) => a.bimestre || "Bimestre não informado"))];

    for (const bimestre of bimestres) {
      const sheetRows = students
        .filter((student) => results.some((r) => r.student === student.nome && r.disciplina === disciplina && (r.bimestre || "Bimestre não informado") === bimestre))
        .map((student) => {
          const studentResults = results.filter((r) => r.student === student.nome && r.disciplina === disciplina && (r.bimestre || "Bimestre não informado") === bimestre);
          const getScore = (name: string) => studentResults.find((r) => (r.nomeAtividade || r.avaliacaoNome) === name)?.score ?? "";
          const scores = [getScore("Atividade 1"), getScore("Atividade 2"), getScore("Atividade 3")].filter((v) => v !== "") as number[];
          const media = scores.length ? Number((scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2)) : "";
          return { Aluno: student.nome, Atv1: getScore("Atividade 1"), Atv2: getScore("Atividade 2"), Atv3: getScore("Atividade 3"), Média: media };
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
