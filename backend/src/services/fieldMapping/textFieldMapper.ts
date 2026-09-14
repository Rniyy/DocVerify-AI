import { ExtractedFields } from "../../types/fields";
import { findFieldKeyForLabel } from "./fieldDictionary";
import { assignParsedValue } from "./valueParsers";

/**
 * Looks for "Label: value" or "Label - value" lines in raw extracted text
 * and assigns any recognized label onto a structured field. This is plain
 * pattern matching, not AI — deliberately, per the architecture rule that
 * exact/structural extraction stays in TypeScript.
 */
export function mapTextToFields(text: string): ExtractedFields {
  const fields: ExtractedFields = {};
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    const match = line.match(/^(.+?)[:\-]\s*(.+)$/);
    if (!match) continue;

    const [, rawLabel, rawValue] = match;
    const fieldKey = findFieldKeyForLabel(rawLabel);
    if (!fieldKey) continue;

    assignParsedValue(fields, fieldKey, rawValue.trim());
  }

  return fields;
}
