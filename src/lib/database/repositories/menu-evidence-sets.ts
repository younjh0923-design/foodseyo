import type { AnalysisCacheQueryExecutor } from "../database-port.ts";
import {
  AnalysisCacheRepositoryError,
  MenuEvidenceSetRecordSchema,
  UploadedMenuEvidenceInputSchema,
  parseRepositoryValue,
  type MenuEvidenceSetRecord,
  type UploadedMenuEvidenceInput,
} from "./contracts.ts";

const selectColumns = `
  id,
  input_kind AS "inputKind",
  source_fingerprint AS "sourceFingerprint",
  fingerprint_version AS "fingerprintVersion",
  image_count AS "imageCount",
  normalized_url AS "normalizedUrl",
  source_provider AS "sourceProvider",
  observed_at AS "observedAt",
  created_at AS "createdAt"
`;

export async function getOrCreateUploadedMenuEvidenceSet(
  executor: AnalysisCacheQueryExecutor,
  candidate: UploadedMenuEvidenceInput,
): Promise<MenuEvidenceSetRecord> {
  const input = parseRepositoryValue(
    UploadedMenuEvidenceInputSchema,
    candidate,
    "INVALID_REPOSITORY_INPUT",
  );
  const identityValues = [
    input.sourceFingerprint,
    input.fingerprintVersion,
  ];

  await executor.query({
    name: "foodseyo-insert-uploaded-menu-evidence",
    text: `
      INSERT INTO public.menu_evidence_sets (
        input_kind,
        source_fingerprint,
        fingerprint_version,
        image_count,
        normalized_url,
        source_provider,
        observed_at
      )
      VALUES ('uploaded_menu_images', $1, $2, $3, NULL, NULL, $4)
      ON CONFLICT (source_fingerprint, fingerprint_version) DO NOTHING
    `,
    values: [...identityValues, input.imageCount, input.observedAt],
  });

  const result = await executor.query<MenuEvidenceSetRecord>({
    name: "foodseyo-select-menu-evidence",
    text: `
      SELECT ${selectColumns}
      FROM public.menu_evidence_sets
      WHERE source_fingerprint = $1
        AND fingerprint_version = $2
      LIMIT 1
    `,
    values: identityValues,
  });
  const row = result.rows[0];
  if (!row) {
    throw new AnalysisCacheRepositoryError("MENU_EVIDENCE_NOT_RESOLVED");
  }
  const record = parseRepositoryValue(MenuEvidenceSetRecordSchema, row);
  if (
    record.sourceFingerprint !== input.sourceFingerprint ||
    record.fingerprintVersion !== input.fingerprintVersion ||
    record.inputKind !== "uploaded_menu_images" ||
    record.imageCount !== input.imageCount ||
    record.normalizedUrl !== null ||
    record.sourceProvider !== null
  ) {
    throw new AnalysisCacheRepositoryError(
      "MENU_EVIDENCE_IDENTITY_CONFLICT",
    );
  }
  return record;
}
