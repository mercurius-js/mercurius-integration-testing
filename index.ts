import "fastify-gql";

import { FastifyInstance } from "fastify";
import { DocumentNode, GraphQLError, print } from "graphql";
import { IncomingHttpHeaders } from "http";

export function createFastifyGQLTestClient(
  app: FastifyInstance,
  opts: {
    headers?: IncomingHttpHeaders;
    url?: string;
    cookies?: Record<string, string>;
  } = {}
) {
  type GQLResponse<T> = { data: T; errors?: GraphQLError[] };
  let headers = opts.headers || {};
  let cookies = opts.cookies || {};

  const url = opts.url || "/graphql";

  const query = async <
    TData extends Record<string, unknown> = Record<string, any>,
    TVariables extends Record<string, unknown> = Record<string, any>
  >(
    query: DocumentNode | string,
    {
      variables = {} as TVariables,
      operationName = null,
      headers: querySpecificHeaders = {},
      cookies: querySpecificCookies = {},
    }: {
      variables?: TVariables;
      operationName?: string | null;
      headers?: IncomingHttpHeaders;
      cookies?: Record<string, string>;
    } = {}
  ): Promise<GQLResponse<TData>> => {
    return (
      await app.inject({
        method: "POST",
        url,
        cookies: {
          ...cookies,
          ...querySpecificCookies,
        },
        headers: {
          "content-type": "application/json; charset=utf-8",
          ...headers,
          ...querySpecificHeaders,
        },
        payload: JSON.stringify({
          query: typeof query === "string" ? query : print(query),
          variables,
          operationName,
        }),
      })
    ).json();
  };

  const setHeaders = (newHeaders: IncomingHttpHeaders) => {
    headers = newHeaders;
  };

  const setCookies = (newCookies: Record<string, string>) => {
    cookies = newCookies;
  };

  return {
    query,
    mutate: query,
    setHeaders,
    headers,
    cookies,
    setCookies,
  };
}
