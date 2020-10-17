import type {} from 'mercurius'
import type { FastifyInstance } from 'fastify'
import type { IncomingHttpHeaders } from 'http'

import { serialize as serializeCookie } from 'cookie'
import getPort from 'get-port'
import { DocumentNode, GraphQLError, print } from 'graphql'

import { SubscriptionClient } from './subscription/client'

export type GQLResponse<T> = { data: T; errors?: GraphQLError[] }

export type QueryOptions<TVariables = Record<string, any>> = {
  variables?: TVariables
  operationName?: string | null
  headers?: IncomingHttpHeaders
  cookies?: Record<string, string>
}

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
) => Promise<GQLResponse<TData>>

export function createMercuriusTestClient(
  /**
   * Fastify instance, in which it should have been already registered `mercurius`.
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
    headers?: IncomingHttpHeaders
    /**
     * GraphQL Endpoint registered on the Fastify instance.
     * By default is `/graphql`
     */
    url?: string
    /**
     * Global Cookies added to every query in this test client.
     */
    cookies?: Record<string, string>
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

  query: QueryFn
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
  mutate: QueryFn
  /**
   * Set new global headers to this test client instance.
   * @param newHeaders new Global headers to be set for the test client.
   */
  setHeaders: (newHeaders: IncomingHttpHeaders) => void
  /**
   * Set new global cookies to this test client instance.
   * @param newCookies new Global headers to be set for the test client.
   */
  setCookies: (newCookies: Record<string, string>) => void
  /**
   * Send a batch of queries, make sure to enable `allowBatchedQueries`.
   *
   * https://github.com/mercurius-js/mercurius#batched-queries
   *
   *
   * @param queries Queries to be sent in batch.
   * @param queryOptions Cookies | headers to be set.
   */
  batchQueries: (
    queries: {
      query: DocumentNode | string
      variables?: Record<string, any>
      operationName?: string
    }[],
    queryOptions?: Pick<QueryOptions, 'cookies' | 'headers'>
  ) => Promise<GQLResponse<any>[]>
  /**
   * Global headers added to every request in this test client.
   */
  headers: IncomingHttpHeaders
  /**
   * Global cookies added to every request in this test client.
   */
  cookies: Record<string, string>
  /**
   * GraphQL Subscription
   */
  subscribe: <
    TData extends Record<string, unknown> = any,
    TVariables extends Record<string, unknown> | undefined = undefined
  >(
    opts: {
      query: string | DocumentNode
      initPayload?:
        | (() => Record<string, any> | Promise<Record<string, any>>)
        | Record<string, any>
      onData(response: GQLResponse<TData>): void
      headers?: IncomingHttpHeaders
      cookies?: Record<string, string>
    } & (TVariables extends object
      ? { variables: TVariables }
      : { variables?: Record<string, any> })
  ) => Promise<{
    unsubscribe: () => void
  }>
} {
  const readyPromise = new Promise<void>((resolve, reject) => {
    try {
      app.ready((err) => {
        if (err) {
          reject(err)
        }
        if (app.graphql) {
          resolve()
        } else {
          reject(Error('Mercurius is not registered in Fastify Instance!'))
        }
      })
    } catch (err) {
      reject(Error('Invalid Fastify Instance'))
    }
  })
  let headers = opts.headers || {}
  let cookies = opts.cookies || {}

  const url = opts.url || '/graphql'

  const query: QueryFn = async <
    TVariables extends Record<string, unknown> = Record<string, unknown>
  >(
    query: string | DocumentNode,
    queryOptions: QueryOptions<TVariables> = {}
  ) => {
    await readyPromise
    const {
      variables = {} as TVariables,
      operationName = null,
      headers: querySpecificHeaders = {},
      cookies: querySpecificCookies = {},
    } = queryOptions
    return (
      await app.inject({
        method: 'POST',
        url,
        cookies: {
          ...cookies,
          ...querySpecificCookies,
        },
        headers: {
          'content-type': 'application/json; charset=utf-8',
          ...headers,
          ...querySpecificHeaders,
        },
        payload: JSON.stringify({
          query: typeof query === 'string' ? query : print(query),
          variables,
          operationName,
        }),
      })
    ).json()
  }

  const setHeaders = (newHeaders: IncomingHttpHeaders) => {
    headers = newHeaders
  }

  const setCookies = (newCookies: Record<string, string>) => {
    cookies = newCookies
  }

  const batchQueries = async (
    queries: {
      query: DocumentNode | string
      variables?: Record<string, unknown>
      operationName?: string
    }[],
    queryOptions?: Pick<QueryOptions, 'cookies' | 'headers'>
  ) => {
    await readyPromise

    const {
      headers: querySpecificHeaders = {},
      cookies: querySpecificCookies = {},
    } = queryOptions || {}

    const responses: GQLResponse<unknown>[] = (
      await app.inject({
        method: 'POST',
        url,
        cookies: {
          ...cookies,
          ...querySpecificCookies,
        },
        headers: {
          'content-type': 'application/json; charset=utf-8',
          ...headers,
          ...querySpecificHeaders,
        },
        payload: JSON.stringify(
          queries.map(({ query, variables, operationName }) => {
            return {
              query: typeof query === 'string' ? query : print(query),
              variables: variables || {},
              operationName: operationName || null,
            }
          })
        ),
      })
    ).json()

    return responses
  }

  const subscribe = ({
    query,
    variables = {},
    initPayload = {},
    onData,
    headers: newHeaders = {},
    cookies: newCookies = {},
  }: {
    query: string | DocumentNode
    variables?: Record<string, unknown>
    initPayload?:
      | (() => Record<string, unknown> | Promise<Record<string, unknown>>)
      | Record<string, unknown>
    onData(response: GQLResponse<unknown>): void
    headers?: IncomingHttpHeaders
    cookies?: Record<string, string>
  }) => {
    return new Promise<{
      unsubscribe: () => void
    }>(async (resolve, reject) => {
      try {
        await readyPromise

        let port: number

        const address = app.server.address()
        if (typeof address === 'object' && address) {
          port = address.port
        } else {
          app.log.warn('Remember to close the app instance manually')

          await app.listen((port = await getPort()))
        }

        const combinedCookies = Object.entries({ ...cookies, ...newCookies })

        const combinedHeaders = {
          ...headers,
          ...newHeaders,
        }

        const subscriptionClient = new SubscriptionClient(
          `ws://localhost:${port}${url}`,
          {
            headers: combinedCookies.length
              ? {
                  ...combinedHeaders,
                  cookie: combinedCookies.reduce((acum, [key, value]) => {
                    if (acum) {
                      acum += '; '
                    }
                    acum += serializeCookie(key, value)
                    return acum
                  }, ''),
                }
              : combinedHeaders,
            connectionInitPayload: initPayload,
            connectionCallback: () => {
              try {
                subscriptionClient
                  .createSubscription(
                    typeof query === 'string' ? query : print(query),
                    variables,
                    ({ payload }: { topic: string; payload: any }) => {
                      onData(payload)
                    }
                  )
                  .then(() => {
                    setImmediate(() => {
                      resolve({
                        unsubscribe() {
                          subscriptionClient.close()
                        },
                      })
                    })
                  })
                  .catch(
                    /* istanbul ignore next */
                    (err) => {
                      reject(err)
                      subscriptionClient.close()
                    }
                  )
              } catch (err) {
                reject(err)
                subscriptionClient.close()
              }
            },
            failedConnectionCallback: reject,
          }
        )
      } catch (err) {
        reject(err)
      }
    })
  }

  return {
    query,
    mutate: query,
    setHeaders,
    headers,
    cookies,
    setCookies,
    batchQueries,
    subscribe,
  }
}
