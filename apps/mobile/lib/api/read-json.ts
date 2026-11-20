export const readJson = async <T>(response: Response): Promise<T> =>
  // oxlint-disable-next-line typescript/no-unsafe-return -- Response.json() is untyped; T is the caller-declared JSON contract of the endpoint
  await response.json();
