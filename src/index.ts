import type {} from 'mercurius'
import type { FastifyInstance } from 'fastify'
import type { IncomingHttpHeaders } from 'http'

import { serialize as serializeCookie } from 'cookie'
import { DocumentNode, GraphQLError, print } from 'graphql'

import { SubscriptionClient } from './subscription/client'

import type { TypedDocumentNode } from '@graphql-typed-document-node/core'

export type GQLResponse<T> = { data: T; errors?: GraphQLError[] }

export type QueryOptions<
  TVariables extends Record<string, unknown> | undefined = undefined
> = {
  operationName?: string | null
  headers?: IncomingHttpHeaders
  cookies?: Record<string, string>
  variables?: TVariables
}

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
   * @param query Query to be sent. It can be a DocumentNode or string.
   * @param queryOptions Query specific options, including:
   * - variables
   * - operationName
   * - headers
   * - cookies
   */
  query: <
    TData extends Record<string, unknown> = Record<string, any>,
    TVariables extends Record<string, unknown> | undefined = undefined
  >(
    query: TypedDocumentNode<TData, TVariables> | DocumentNode | string,
    queryOptions?: QueryOptions<TVariables>
  ) => Promise<GQLResponse<TData>>
  /**
   * Mutation function.
   *
   * @param mutation Mutation to be sent. It can be a DocumentNode or string.
   * @param mutationOptions Query specific options, including:
   * - variables
   * - operationName
   * - headers
   * - cookies
   */
  mutate: <
    TData extends Record<string, unknown> = Record<string, any>,
    TVariables extends Record<string, unknown> | undefined = undefined
  >(
    mutation: TypedDocumentNode<TData, TVariables> | DocumentNode | string,
    mutationOptions?: QueryOptions<TVariables>
  ) => Promise<GQLResponse<TData>>

  /**
   * Returns federated entity by provided typename and keys
   * @param options
   * @returns Promise with requested _Entity
   */
  getFederatedEntity: <
    TData extends Record<string, unknown> = Record<string, any>
  >(options: {
    typename: string
    keys: Record<string, string | number>
    typeQuery: string
  }) => Promise<TData>

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
    TData extends Record<string, unknown> = Record<string, any>,
    TVariables extends Record<string, unknown> | undefined = undefined
  >(opts: {
    /**
     * Subscription query, can be a DocumentNode or string
     */
    query: string | DocumentNode | TypedDocumentNode<TData, TVariables>
    /**
     * Initial payload, usually for authorization
     */
    initPayload?:
      | (() => Record<string, any> | Promise<Record<string, any>>)
      | Record<string, any>
    /**
     * Subscription data function
     */
    onData(response: GQLResponse<TData>): void
    /**
     * Subscription specific headers
     */
    headers?: IncomingHttpHeaders
    /**
     * Subscription specific cookies
     */
    cookies?: Record<string, string>
    /**
     * query operationName
     */
    operationName?: string | null
    /**
     * subscription variables
     */
    variables?: TVariables
  }) => Promise<{
    unsubscribe: () => void
  }>
} {
  const readyPromise = new Promise<void>(async (resolve, reject) => {
    try {
      await app.ready()

      if (typeof app.graphql === 'function') {
        resolve()
      } else {
        reject(Error('Mercurius is not registered in Fastify Instance!'))
      }
    } catch (err) {
      if (
        err instanceof Error &&
        err.message === 'app.ready is not a function'
      ) {
        return reject(Error('Invalid Fastify Instance'))
      }
      reject(err)
    }
  })
  let headers = opts.headers || {}
  let cookies = opts.cookies || {}

  const url = opts.url || '/graphql'

  const query = async (
    query: string | DocumentNode | TypedDocumentNode,
    queryOptions: QueryOptions<Record<string, unknown> | undefined> = {
      variables: {},
    }
  ) => {
    await readyPromise
    const {
      variables = {},
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
    operationName,
    initPayload = {},
    onData,
    headers: newHeaders = {},
    cookies: newCookies = {},
  }: {
    query: string | DocumentNode | TypedDocumentNode
    variables?: Record<string, unknown>
    operationName?: string | null
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

          await app.listen(0)

          const address = app.server.address()

          /* istanbul ignore else */
          if (typeof address === 'object' && address) {
            port = address.port
          } else {
            throw Error(
              'Error while trying to automatically start the test server'
            )
          }
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
                    },
                    operationName
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

  const getFederatedEntity = async ({
    typename,
    keys,
    typeQuery,
  }: {
    typename: string
    keys: Record<string, string | number>
    typeQuery: string
  }) => {
    let stringifiedKeys: string[] = []

    for (const key in keys) {
      const value = typeof keys[key] === 'number' ? keys[key] : `"${keys[key]}"`
      stringifiedKeys.push(`${key}: ${value}`)
    }

    try {
      const result = await query(`
      query {
          _entities(representations: [{ __typename: "${typename}", ${stringifiedKeys.join(
        ', '
      )} }]) {
            __typename
            ... on ${typename} {
              ${typeQuery}
            }
          }
        }
    `)

      return result.data._entities[0]
    } catch (err) {
      if (
        err instanceof Error &&
        err.message.includes('Unknown directive "@key"')
      ) {
        throw new Error('Service is not federated')
      }

      throw err
    }
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
    getFederatedEntity,
  }
}
