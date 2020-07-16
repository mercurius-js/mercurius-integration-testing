import "fastify-gql";

import { FastifyInstance } from "fastify";
import { DocumentNode, GraphQLError, print } from "graphql";
import { IncomingHttpHeaders } from "http";

export type GQLResponse<T> = { data: T; errors?: GraphQLError[] };

export type QueryOptions<TVariables = Record<string, any>> = {
  variables?: TVariables;
  operationName?: string | null;
  headers?: IncomingHttpHeaders;
  cookies?: Record<string, string>;
};

/**
 * Query | Mutation function.
 *
 * @param query Query | Mutation to be sent. It can be a `graphql-tag` or a string.
 * @param queryOptions Query specific options, including:
 * - variables
 * - operationName
 * - headers
 * - cookies
 */
type QueryFn = <
  TData extends Record<string, unknown> = Record<string, any>,
  TVariables extends Record<string, unknown> = Record<string, any>
>(
  query: DocumentNode | string,
  queryOptions?: QueryOptions<TVariables>
) => Promise<GQLResponse<TData>>;

export function createFastifyGQLTestClient(
  /**
   * Fastify instance, in which it should have been already registered `fastify-gql`.
   */
  app: FastifyInstance,
  /**
   * Global Options for the client, including:
   * - headers
   * - url
   * - cookies
   */
  opts: {
    /**
     * Global Headers added to every query in this test client.
     */
    headers?: IncomingHttpHeaders;
    /**
     * GraphQL Endpoint registered on the Fastify instance.
     * By default is `/graphql`
     */
    url?: string;
    /**
     * Global Cookies added to every query in this test client.
     */
    cookies?: Record<string, string>;
  } = {}
): {
  /**
   * Query function.
   *
   * @param query Query to be sent. It can be a `graphql-tag` or a string.
   * @param queryOptions Query specific options, including:
   * - variables
   * - operationName
   * - headers
   * - cookies
   */

  query: QueryFn;
  /**
   * Mutation function.
   *
   * @param query Mutation to be sent. It can be a `graphql-tag` or a string.
   * @param queryOptions Query specific options, including:
   * - variables
   * - operationName
   * - headers
   * - cookies
   */
  mutate: QueryFn;
  /**
   * Set new global headers to this test client instance.
   * @param newHeaders new Global headers to be set for the test client.
   */
  setHeaders: (newHeaders: IncomingHttpHeaders) => void;
  /**
   * Set new global cookies to this test client instance.
   * @param newCookies new Global headers to be set for the test client.
   */
  setCookies: (newCookies: Record<string, string>) => void;
  /**
   * Send a batch of queries, make sure to enable `allowBatchedQueries`.
   *
   * https://github.com/mcollina/fastify-gql#batched-queries
   *
   *
   * @param queries Queries to be sent in batch.
   * @param queryOptions Cookies | headers to be set.
   */
  batchQueries: (
    queries: {
      query: DocumentNode | string;
      variables?: Record<string, any>;
      operationName?: string;
    }[],
    queryOptions?: Pick<QueryOptions, "cookies" | "headers">
  ) => Promise<GQLResponse<any>[]>;
  /**
   * Global headers added to every request in this test client.
   */
  headers: IncomingHttpHeaders;
  /**
   * Global cookies added to every request in this test client.
   */
  cookies: Record<string, string>;
} {
  let headers = opts.headers || {};
  let cookies = opts.cookies || {};

  const url = opts.url || "/graphql";

  const query: QueryFn = async <TVariables extends Record<string, unknown> = Record<string, any>>(
    query: string | DocumentNode,
    queryOptions: QueryOptions<TVariables> = {}
  ) => {
    const {
      variables = {} as TVariables,
      operationName = null,
      headers: querySpecificHeaders = {},
      cookies: querySpecificCookies = {},
    } = queryOptions;
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

  const batchQueries = async (
    queries: {
      query: DocumentNode | string;
      variables?: Record<string, any>;
      operationName?: string;
    }[],
    queryOptions?: Pick<QueryOptions, "cookies" | "headers">
  ) => {
    const { headers: querySpecificHeaders = {}, cookies: querySpecificCookies = {} } =
      queryOptions || {};

    const responses: GQLResponse<any>[] = (
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
        payload: JSON.stringify(
          queries.map(({ query, variables, operationName }) => {
            return {
              query: typeof query === "string" ? query : print(query),
              variables: variables || {},
              operationName: operationName || null,
            };
          })
        ),
      })
    ).json();

    return responses;
  };

  return {
    query,
    mutate: query,
    setHeaders,
    headers,
    cookies,
    setCookies,
    batchQueries,
  };
}
