// Spring 응답 형식: { isSuccess, code, message, result, meta }
export async function apiGet(path, { signal } = {}) {
  const response = await fetch(path, { headers: { Accept: 'application/json' }, signal });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body?.isSuccess) {
    const error = new Error(body?.message || `서버 오류 (${response.status})`);
    error.status = response.status;
    error.code = body?.code;
    throw error;
  }
  return body.result;
}

export function summarizeCatalog(catalog) {
  return {
    models: catalog?.models?.length ?? 0,
    providers: catalog?.providers?.length ?? 0,
    regions: catalog?.regions?.length ?? 0,
  };
}
