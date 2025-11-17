import mondaySdk from "monday-sdk-js";
const monday = mondaySdk();

export async function runQuery(query, variables = {}) {
  const res = await monday.api(query, { variables });
  if (res.errors?.length) throw new Error(res.errors.map(e => e.message).join("; "));
  return res.data;
}
