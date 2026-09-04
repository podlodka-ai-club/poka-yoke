import type {
  V2FailureFamily,
  V2Prediction,
  V2PublicTask,
  V2TaskOracle,
  V2Verdict,
} from "./v2-schema.ts";

const VERDICTS: readonly V2Verdict[] = ["SUPPORT", "REFUTE", "UNKNOWN"];

function divide(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}

function evidenceKeys(
  evidence: readonly { paper_id: string; sentence_ids: readonly number[] }[],
): Set<string> {
  return new Set(
    evidence.flatMap(({ paper_id, sentence_ids }) =>
      sentence_ids.map((sentenceId) => `${paper_id}:${sentenceId}`),
    ),
  );
}

function hasRussianText(text: string): boolean {
  return /[А-Яа-яЁё]/.test(text.trim());
}

function indexByTask<T extends { task_id: string }>(
  values: readonly T[],
  expectedIds: ReadonlySet<string>,
  name: string,
): Map<string, T> {
  const result = new Map<string, T>();
  for (const value of values) {
    if (result.has(value.task_id)) throw new Error(`Duplicate ${name} for ${value.task_id}`);
    if (!expectedIds.has(value.task_id)) throw new Error(`Unexpected ${name} for ${value.task_id}`);
    result.set(value.task_id, value);
  }
  if (result.size !== expectedIds.size) {
    throw new Error(`Expected ${expectedIds.size} ${name}, received ${result.size}`);
  }
  return result;
}

function validatePrediction(prediction: V2Prediction, name: string): void {
  if (!VERDICTS.includes(prediction.predicted_verdict)) {
    throw new Error(`Invalid ${name} verdict for ${prediction.task_id}`);
  }
  if (
    prediction.answer?.language !== "ru" ||
    typeof prediction.answer.explanation !== "string" ||
    !Array.isArray(prediction.predicted_evidence) ||
    !Array.isArray(prediction.consulted_document_ids) ||
    !Array.isArray(prediction.used_evidence_memory_ids) ||
    !Array.isArray(prediction.used_lesson_families)
  ) {
    throw new Error(`Invalid ${name} answer language for ${prediction.task_id}`);
  }
  for (const evidence of prediction.predicted_evidence) {
    if (
      evidence.paper_id.length === 0 ||
      !["SUPPORTS", "REFUTES"].includes(evidence.stance) ||
      evidence.sentence_ids.some((id) => !Number.isInteger(id) || id < 0)
    ) {
      throw new Error(`Invalid ${name} evidence for ${prediction.task_id}`);
    }
  }
}

export interface V2SliceScore {
  tasks: number;
  verdict_accuracy: number;
  grounded_task_accuracy: number;
  baseline_verdict_accuracy?: number;
  baseline_grounded_task_accuracy?: number;
  verdict_delta_vs_baseline?: number;
  grounded_delta_vs_baseline?: number;
}

export interface V2ScoreReport {
  dataset_id: "scifact-memory-v2";
  tasks: number;
  primary_metric: "grounded_task_accuracy";
  grounded_task_accuracy: number;
  verdict_with_any_gold_evidence_accuracy: number;
  verdict_accuracy: number;
  verdict_macro_f1: number;
  evidence_precision: number;
  evidence_recall: number;
  evidence_f1: number;
  unknown_accuracy: number;
  unknown_calibration_rate: number;
  false_certainty_rate: number;
  unsupported_verdict_rate: number;
  citation_contamination_rate: number;
  russian_response_rate: number;
  explanation_completion_rate: number;
  reported_lesson_retrieval_rate: number;
  expected_evidence_retrieval_rate: number;
  forbidden_evidence_use_rate: number;
  memory_control_compliance_rate: number;
  grounded_delta_vs_baseline?: number;
  verdict_delta_vs_baseline?: number;
  memory_induced_regression_rate?: number;
  experience_transfer_success_rate?: number;
  evidence_reuse_success_rate?: number;
  by_case: Record<string, V2SliceScore>;
  by_failure_family: Record<string, V2SliceScore>;
  by_claim_language: Record<string, V2SliceScore>;
  by_user_role: Record<string, V2SliceScore>;
  by_channel: Record<string, V2SliceScore>;
  by_memory_operation: Record<string, V2SliceScore>;
}

interface TaskOutcome {
  verdictCorrect: boolean;
  groundedCorrect: boolean;
}

export function scoreV2Predictions(
  oracles: readonly V2TaskOracle[],
  tasks: readonly V2PublicTask[],
  predictions: readonly V2Prediction[],
  baseline: readonly V2Prediction[] = [],
): V2ScoreReport {
  const oracleIds = new Set(oracles.map(({ task_id }) => task_id));
  if (oracleIds.size !== oracles.length) throw new Error("Duplicate oracle task id");
  const taskById = indexByTask(tasks, oracleIds, "public tasks");
  const predictionById = indexByTask(predictions, oracleIds, "trained predictions");
  const baselineById =
    baseline.length > 0
      ? indexByTask(baseline, oracleIds, "baseline predictions")
      : new Map<string, V2Prediction>();
  for (const prediction of predictions) validatePrediction(prediction, "trained prediction");
  for (const prediction of baseline) validatePrediction(prediction, "baseline prediction");

  let verdictCorrect = 0;
  let groundedCorrect = 0;
  let anyGoldGroundedCorrect = 0;
  let evidenceTruePositive = 0;
  let predictedEvidenceCount = 0;
  let goldEvidenceCount = 0;
  let unknownCorrect = 0;
  let unknownCalibrated = 0;
  let unknownTotal = 0;
  let falseCertainty = 0;
  let unsupportedVerdicts = 0;
  let contaminatedCitations = 0;
  let nonUnknownPredictions = 0;
  let russianResponses = 0;
  let explanations = 0;
  let lessonsExpected = 0;
  let lessonsReported = 0;
  let evidenceRetrievalExpected = 0;
  let evidenceRetrieved = 0;
  let forbiddenChecks = 0;
  let forbiddenUses = 0;
  let controlChecks = 0;
  let controlCompliant = 0;
  const confusion = new Map<string, number>();
  const outcomes = new Map<string, TaskOutcome>();
  const slices = {
    case: new Map<string, V2SliceScore>(),
    family: new Map<string, V2SliceScore>(),
    language: new Map<string, V2SliceScore>(),
    role: new Map<string, V2SliceScore>(),
    channel: new Map<string, V2SliceScore>(),
    operation: new Map<string, V2SliceScore>(),
  };
  const baselineSlices = {
    case: new Map<string, V2SliceScore>(),
    family: new Map<string, V2SliceScore>(),
    language: new Map<string, V2SliceScore>(),
    role: new Map<string, V2SliceScore>(),
    channel: new Map<string, V2SliceScore>(),
    operation: new Map<string, V2SliceScore>(),
  };

  const updateSlice = (map: Map<string, V2SliceScore>, key: string, outcome: TaskOutcome) => {
    const current = map.get(key) ?? {
      tasks: 0,
      verdict_accuracy: 0,
      grounded_task_accuracy: 0,
    };
    current.tasks += 1;
    current.verdict_accuracy += outcome.verdictCorrect ? 1 : 0;
    current.grounded_task_accuracy += outcome.groundedCorrect ? 1 : 0;
    map.set(key, current);
  };

  for (const oracle of oracles) {
    const task = taskById.get(oracle.task_id)!;
    const prediction = predictionById.get(oracle.task_id)!;
    const isVerdictCorrect = prediction.predicted_verdict === oracle.gold.verdict;
    verdictCorrect += isVerdictCorrect ? 1 : 0;
    confusion.set(
      `${oracle.gold.verdict}:${prediction.predicted_verdict}`,
      (confusion.get(`${oracle.gold.verdict}:${prediction.predicted_verdict}`) ?? 0) + 1,
    );

    const goldEvidence = evidenceKeys(oracle.gold.evidence);
    const actualEvidence = evidenceKeys(prediction.predicted_evidence ?? []);
    const overlap = [...actualEvidence].filter((key) => goldEvidence.has(key));
    goldEvidenceCount += goldEvidence.size;
    predictedEvidenceCount += actualEvidence.size;
    evidenceTruePositive += overlap.length;
    const expectedStance = oracle.gold.verdict === "SUPPORT" ? "SUPPORTS" : "REFUTES";
    const hasAnyGoldEvidence = prediction.predicted_evidence.some(
      (item) =>
        item.stance === expectedStance &&
        item.sentence_ids.some((id) => goldEvidence.has(`${item.paper_id}:${id}`)),
    );
    const allCitationsAreGold =
      actualEvidence.size > 0 && [...actualEvidence].every((key) => goldEvidence.has(key));
    const allStancesCorrect = prediction.predicted_evidence.every(
      ({ stance }) => stance === expectedStance,
    );
    const containsCompleteRationale = oracle.gold.evidence.some((rationale) =>
      rationale.sentence_ids.every((id) => actualEvidence.has(`${rationale.paper_id}:${id}`)),
    );
    const uncertaintyPresent = Boolean(prediction.answer.uncertainty?.trim());
    const isAnyGoldGroundedCorrect =
      isVerdictCorrect &&
      (oracle.gold.verdict === "UNKNOWN"
        ? actualEvidence.size === 0 && uncertaintyPresent
        : hasAnyGoldEvidence);
    const isGroundedCorrect =
      isVerdictCorrect &&
      (oracle.gold.verdict === "UNKNOWN"
        ? actualEvidence.size === 0 && uncertaintyPresent
        : containsCompleteRationale && allCitationsAreGold && allStancesCorrect);
    anyGoldGroundedCorrect += isAnyGoldGroundedCorrect ? 1 : 0;
    groundedCorrect += isGroundedCorrect ? 1 : 0;
    outcomes.set(oracle.task_id, {
      verdictCorrect: isVerdictCorrect,
      groundedCorrect: isGroundedCorrect,
    });

    if (oracle.gold.verdict === "UNKNOWN") {
      unknownTotal += 1;
      unknownCorrect += isVerdictCorrect ? 1 : 0;
      unknownCalibrated += isGroundedCorrect ? 1 : 0;
      falseCertainty += prediction.predicted_verdict === "UNKNOWN" ? 0 : 1;
    }
    if (prediction.predicted_verdict !== "UNKNOWN") {
      nonUnknownPredictions += 1;
      unsupportedVerdicts += hasAnyGoldEvidence ? 0 : 1;
      contaminatedCitations += allCitationsAreGold && allStancesCorrect ? 0 : 1;
    }
    russianResponses +=
      prediction.answer.language === "ru" && hasRussianText(prediction.answer.explanation) ? 1 : 0;
    explanations += prediction.answer.explanation.trim().length > 0 ? 1 : 0;

    const lesson = oracle.protocol.expected_lesson_family;
    if (lesson) {
      lessonsExpected += 1;
      lessonsReported += prediction.used_lesson_families.includes(lesson) ? 1 : 0;
    }
    if (oracle.protocol.expected_evidence_document_ids.length > 0) {
      evidenceRetrievalExpected += 1;
      evidenceRetrieved += oracle.protocol.expected_evidence_document_ids.some((id) =>
        prediction.consulted_document_ids.includes(id),
      )
        ? 1
        : 0;
    }
    // Consulting a recalled candidate is allowed: the trap tests whether the agent
    // improperly relies on or cites it, not whether the agent notices and rejects it.
    const usedDocuments = new Set(
      prediction.predicted_evidence.map(({ paper_id }) => paper_id),
    );
    const usedForbidden = oracle.protocol.forbidden_evidence_document_ids.some((id) =>
      usedDocuments.has(id),
    );
    if (oracle.protocol.forbidden_evidence_document_ids.length > 0) {
      forbiddenChecks += 1;
      forbiddenUses += usedForbidden ? 1 : 0;
    }
    if (oracle.protocol.memory_operation !== "none") {
      controlChecks += 1;
      controlCompliant += isGroundedCorrect && !usedForbidden ? 1 : 0;
    }

    const outcome = { verdictCorrect: isVerdictCorrect, groundedCorrect: isGroundedCorrect };
    updateSlice(slices.case, oracle.protocol.case, outcome);
    updateSlice(slices.family, oracle.protocol.failure_family, outcome);
    updateSlice(slices.language, task.claim.language, outcome);
    updateSlice(slices.role, task.request_context.user_role, outcome);
    updateSlice(slices.channel, task.request_context.channel, outcome);
    updateSlice(slices.operation, oracle.protocol.memory_operation, outcome);
  }

  const macroF1 =
    VERDICTS.map((label) => {
      const tp = confusion.get(`${label}:${label}`) ?? 0;
      const fp = VERDICTS.filter((gold) => gold !== label).reduce(
        (sum, gold) => sum + (confusion.get(`${gold}:${label}`) ?? 0),
        0,
      );
      const fn = VERDICTS.filter((predicted) => predicted !== label).reduce(
        (sum, predicted) => sum + (confusion.get(`${label}:${predicted}`) ?? 0),
        0,
      );
      return divide(2 * tp, 2 * tp + fp + fn);
    }).reduce((sum, value) => sum + value, 0) / VERDICTS.length;
  const evidencePrecision = divide(evidenceTruePositive, predictedEvidenceCount);
  const evidenceRecall = divide(evidenceTruePositive, goldEvidenceCount);
  const materializeSlices = (values: Map<string, V2SliceScore>) =>
    Object.fromEntries(
      [...values].map(([key, value]) => [
        key,
        {
          tasks: value.tasks,
          verdict_accuracy: divide(value.verdict_accuracy, value.tasks),
          grounded_task_accuracy: divide(value.grounded_task_accuracy, value.tasks),
        },
      ]),
    );

  const report: V2ScoreReport = {
    dataset_id: "scifact-memory-v2",
    tasks: oracles.length,
    primary_metric: "grounded_task_accuracy",
    grounded_task_accuracy: divide(groundedCorrect, oracles.length),
    verdict_with_any_gold_evidence_accuracy: divide(anyGoldGroundedCorrect, oracles.length),
    verdict_accuracy: divide(verdictCorrect, oracles.length),
    verdict_macro_f1: macroF1,
    evidence_precision: evidencePrecision,
    evidence_recall: evidenceRecall,
    evidence_f1: divide(2 * evidencePrecision * evidenceRecall, evidencePrecision + evidenceRecall),
    unknown_accuracy: divide(unknownCorrect, unknownTotal),
    unknown_calibration_rate: divide(unknownCalibrated, unknownTotal),
    false_certainty_rate: divide(falseCertainty, unknownTotal),
    unsupported_verdict_rate: divide(unsupportedVerdicts, nonUnknownPredictions),
    citation_contamination_rate: divide(contaminatedCitations, nonUnknownPredictions),
    russian_response_rate: divide(russianResponses, oracles.length),
    explanation_completion_rate: divide(explanations, oracles.length),
    reported_lesson_retrieval_rate: divide(lessonsReported, lessonsExpected),
    expected_evidence_retrieval_rate: divide(evidenceRetrieved, evidenceRetrievalExpected),
    forbidden_evidence_use_rate: divide(forbiddenUses, forbiddenChecks),
    memory_control_compliance_rate: divide(controlCompliant, controlChecks),
    by_case: materializeSlices(slices.case),
    by_failure_family: materializeSlices(slices.family),
    by_claim_language: materializeSlices(slices.language),
    by_user_role: materializeSlices(slices.role),
    by_channel: materializeSlices(slices.channel),
    by_memory_operation: materializeSlices(slices.operation),
  };

  if (baseline.length > 0) {
    let baselineVerdictCorrect = 0;
    let baselineGroundedCorrect = 0;
    let baselineGroundedRegressions = 0;
    let experienceBaselineMisses = 0;
    let experienceFixed = 0;
    let evidenceBaselineMisses = 0;
    let evidenceFixed = 0;
    for (const oracle of oracles) {
      const task = taskById.get(oracle.task_id)!;
      const baselinePrediction = baselineById.get(oracle.task_id)!;
      const baselineVerdict = baselinePrediction.predicted_verdict === oracle.gold.verdict;
      const gold = evidenceKeys(oracle.gold.evidence);
      const baselineEvidence = evidenceKeys(baselinePrediction.predicted_evidence);
      const stance = oracle.gold.verdict === "SUPPORT" ? "SUPPORTS" : "REFUTES";
      const baselineStancesCorrect = baselinePrediction.predicted_evidence.every(
        (item) => item.stance === stance,
      );
      const baselineCitationsAreGold =
        baselineEvidence.size > 0 && [...baselineEvidence].every((key) => gold.has(key));
      const baselineContainsCompleteRationale = oracle.gold.evidence.some((rationale) =>
        rationale.sentence_ids.every((id) =>
          baselineEvidence.has(`${rationale.paper_id}:${id}`),
        ),
      );
      const baselineGrounded =
        baselineVerdict &&
        (oracle.gold.verdict === "UNKNOWN"
          ? baselineEvidence.size === 0 && Boolean(baselinePrediction.answer.uncertainty?.trim())
          : baselineStancesCorrect &&
            baselineCitationsAreGold &&
            baselineContainsCompleteRationale);
      baselineVerdictCorrect += baselineVerdict ? 1 : 0;
      baselineGroundedCorrect += baselineGrounded ? 1 : 0;
      if (baselineGrounded && !outcomes.get(oracle.task_id)!.groundedCorrect) {
        baselineGroundedRegressions += 1;
      }
      if (oracle.protocol.case === "experience_reuse" && !baselineGrounded) {
        experienceBaselineMisses += 1;
        experienceFixed += outcomes.get(oracle.task_id)!.groundedCorrect ? 1 : 0;
      }
      if (oracle.protocol.case === "evidence_reuse" && !baselineGrounded) {
        evidenceBaselineMisses += 1;
        evidenceFixed += outcomes.get(oracle.task_id)!.groundedCorrect ? 1 : 0;
      }
      const baselineOutcome = {
        verdictCorrect: baselineVerdict,
        groundedCorrect: baselineGrounded,
      };
      updateSlice(baselineSlices.case, oracle.protocol.case, baselineOutcome);
      updateSlice(baselineSlices.family, oracle.protocol.failure_family, baselineOutcome);
      updateSlice(baselineSlices.language, task.claim.language, baselineOutcome);
      updateSlice(baselineSlices.role, task.request_context.user_role, baselineOutcome);
      updateSlice(baselineSlices.channel, task.request_context.channel, baselineOutcome);
      updateSlice(baselineSlices.operation, oracle.protocol.memory_operation, baselineOutcome);
    }
    report.grounded_delta_vs_baseline =
      report.grounded_task_accuracy - divide(baselineGroundedCorrect, oracles.length);
    report.verdict_delta_vs_baseline =
      report.verdict_accuracy - divide(baselineVerdictCorrect, oracles.length);
    report.memory_induced_regression_rate = divide(
      baselineGroundedRegressions,
      baselineGroundedCorrect,
    );
    report.experience_transfer_success_rate = divide(experienceFixed, experienceBaselineMisses);
    report.evidence_reuse_success_rate = divide(evidenceFixed, evidenceBaselineMisses);

    const mergeBaselineSlices = (
      trained: Record<string, V2SliceScore>,
      baselineValues: Map<string, V2SliceScore>,
    ) => {
      for (const [key, baselineValue] of baselineValues) {
        const trainedValue = trained[key];
        if (!trainedValue) continue;
        const baselineVerdict = divide(baselineValue.verdict_accuracy, baselineValue.tasks);
        const baselineGrounded = divide(
          baselineValue.grounded_task_accuracy,
          baselineValue.tasks,
        );
        trainedValue.baseline_verdict_accuracy = baselineVerdict;
        trainedValue.baseline_grounded_task_accuracy = baselineGrounded;
        trainedValue.verdict_delta_vs_baseline = trainedValue.verdict_accuracy - baselineVerdict;
        trainedValue.grounded_delta_vs_baseline =
          trainedValue.grounded_task_accuracy - baselineGrounded;
      }
    };
    mergeBaselineSlices(report.by_case, baselineSlices.case);
    mergeBaselineSlices(report.by_failure_family, baselineSlices.family);
    mergeBaselineSlices(report.by_claim_language, baselineSlices.language);
    mergeBaselineSlices(report.by_user_role, baselineSlices.role);
    mergeBaselineSlices(report.by_channel, baselineSlices.channel);
    mergeBaselineSlices(report.by_memory_operation, baselineSlices.operation);
  }
  return report;
}

export function isFailureFamily(value: string): value is V2FailureFamily {
  return [
    "numeric_precision",
    "population_scope",
    "causal_language",
    "directionality",
    "negation",
    "evidence_sufficiency",
  ].includes(value);
}
