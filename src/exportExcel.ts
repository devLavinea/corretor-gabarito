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

export type ExportStudent = {
  id: string;
  nome: string;
  turmaId: string;
};

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
  notas?: Record<string, number>;
  [key: string]: unknown;
};

function safeSheetName(value: string) {
  return (
    value.replace(/[\\/?*\[\]:]/g, " ").slice(0, 31).trim() || "Resultados"
  );
}

export function exportResults(
  results: ExportResult[],
  avaliacoes: ExportAvaliacao[],
  students: ExportStudent[],
  filename = "resultados.xlsx",
  grades: ExportGrade[] = [],
) {
  const wb = XLSX.utils.book_new();

  const disciplines = [
    ...new Set(
      [
        ...avaliacoes.map((avaliacao) => avaliacao.disciplina),
        ...grades.map((grade) => grade.disciplina),
        ...results.map((result) => result.disciplina || ""),
      ].filter(Boolean),
    ),
  ];

  for (const disciplina of disciplines) {
    const disciplineEvaluations = avaliacoes.filter(
      (avaliacao) => avaliacao.disciplina === disciplina,
    );

    const bimestres = [
      ...new Set([
        ...disciplineEvaluations.map(
          (avaliacao) => avaliacao.bimestre || "Bimestre não informado",
        ),
        ...grades
          .filter((grade) => grade.disciplina === disciplina)
          .map((grade) => grade.bimestre || "Bimestre não informado"),
        ...results
          .filter((result) => result.disciplina === disciplina)
          .map((result) => result.bimestre || "Bimestre não informado"),
      ]),
    ];

    for (const bimestre of bimestres) {
      const sheetRows = students
        .filter(
          (student) =>
            grades.some(
              (grade) =>
                grade.studentId === student.id &&
                grade.disciplina === disciplina &&
                (grade.bimestre || "Bimestre não informado") === bimestre,
            ) ||
            results.some(
              (result) =>
                result.studentId === student.id &&
                result.disciplina === disciplina &&
                (result.bimestre || "Bimestre não informado") === bimestre,
            ),
        )
        .map((student) => {
          const grade = grades.find(
            (item) =>
              item.studentId === student.id &&
              item.disciplina === disciplina &&
              (item.bimestre || "Bimestre não informado") === bimestre,
          );

          const studentResults = results.filter(
            (result) =>
              result.studentId === student.id &&
              result.disciplina === disciplina &&
              (result.bimestre || "Bimestre não informado") === bimestre,
          );

          const getScore = (name: string) =>
            studentResults.find(
              (result) =>
                (result.nomeAtividade || result.avaliacaoNome) === name,
            )?.score ?? "";

          // As notas podem estar salvas tanto no objeto "notas" quanto
          // diretamente como campos do documento do Firestore.
          const savedNotas: Record<string, number> = {
            ...(grade?.notas ?? {}),
          };

          if (typeof grade?.atv1 === "number") savedNotas.Atv1 = grade.atv1;
          if (typeof grade?.atv2 === "number") savedNotas.Atv2 = grade.atv2;
          if (typeof grade?.atv3 === "number") savedNotas.Atv3 = grade.atv3;

          const dynamicNotaNames = Object.keys(savedNotas).filter(
            (name) => typeof savedNotas[name] === "number",
          );

          // Inclui também notas provenientes da coleção "resultados" quando
          // ainda não existem no documento de "notas".
          const fallbackScores: Record<string, number> = {};
          for (const result of studentResults) {
            const name = result.nomeAtividade || result.avaliacaoNome;
            if (name && typeof result.score === "number") {
              fallbackScores[name] = result.score;
            }
          }

          const notaNames = [
            ...new Set([
              ...dynamicNotaNames,
              ...Object.keys(fallbackScores),
            ]),
          ];

          const row: Record<string, string | number> = {
            Aluno: student.nome,
          };

          for (const name of notaNames) {
            const value = savedNotas[name] ?? fallbackScores[name] ?? "";
            row[name] = value;
          }

          // Mantém as colunas antigas da planilha, inclusive quando a nota
          // foi cadastrada sem usar exatamente esses nomes.
          if (!("Atv1" in row)) {
            row.Atv1 = savedNotas.Atv1 ?? getScore("Atividade 1");
          }
          if (!("Atv2" in row)) {
            row.Atv2 = savedNotas.Atv2 ?? getScore("Atividade 2");
          }
          if (!("Atv3" in row)) {
            row.Atv3 = savedNotas.Atv3 ?? getScore("Atividade 3");
          }

          const scores = Object.entries(row)
            .filter(([name, value]) =>
              name !== "Aluno" && typeof value === "number",
            )
            .map(([, value]) => value as number);

          row.Média = scores.length
            ? Number(
                (
                  scores.reduce((sum, value) => sum + value, 0) / scores.length
                ).toFixed(2),
              )
            : "";

          return row;
        });

      if (sheetRows.length) {
        const name = safeSheetName(`${bimestre} - ${disciplina}`);

        XLSX.utils.book_append_sheet(
          wb,
          XLSX.utils.json_to_sheet(sheetRows),
          name,
        );
      }
    }
  }

  if (!wb.SheetNames.length) {
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet([
        { Aluno: "", Atv1: "", Atv2: "", Atv3: "", Média: "" },
      ]),
      "Resultados",
    );
  }

  XLSX.writeFile(wb, filename);
}
