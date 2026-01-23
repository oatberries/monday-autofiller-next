
//export const monday = mondaySdk();
import { monday } from "./mondayclient";

function getOpName(query) {
  const m = query.match(/\b(query|mutation)\s+([A-Za-z0-9_]+)/);
  return m?.[2] ?? "(anonymous)";
}

export async function runQuery(query, variables = {}) {

  const op = getOpName(query);

  const res = await monday.api(query, { variables });

  if (res.errors?.length) {
    console.error(`[monday.api] ${op} FAILED`, {
      errors: res.errors,
      variables,
    });
    throw new Error(res.errors.map(e => e.message).join("; "));
  }

  console.log(`[monday.api] ${op} ok`);
  return res.data;
}
