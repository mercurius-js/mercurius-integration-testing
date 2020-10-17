import Fastify, { FastifyInstance } from 'fastify'
import gql from 'graphql-tag'
import mercurius from 'mercurius'
import tap from 'tap'

import { createMercuriusTestClient } from '../src'

import type { MQEmitter } from 'mqemitter'
import type { Readable } from 'readable-stream'

const app = Fastify({
  logger: {
    level: 'error',
  },
})

// Types based on https://github.com/mercurius-js/mercurius/blob/master/lib/subscriber.js
declare class PubSub {
  constructor(emitter: MQEmitter)

  emitter: MQEmitter
  subscribe(topic: string, queue: Readable): Promise<void>
  publish(event: { topic: string; payload: any }, callback?: () => void): void
}

declare class PubSubContext {
  constructor(opts: { pubsub: PubSub; fastify: FastifyInstance })

  fastify: FastifyInstance
  queue: Readable

  subscribe(topics: string | string[]): Promise<Readable>
  publish(event: { topic: string; payload: any }, callback?: () => void): void
  close(): void
}

type Context = { pubsub: PubSubContext }

const schema = `
  type Notification {
    id: ID!
    message: String!
  }

  type Query {
    notifications: [Notification!]!
  }

  type Mutation {
    addNotification(message: String!): Notification!
    badNotification: Boolean!
  }

  type Subscription {
    notificationAdded: Notification!
  }
`

let idCount = 1
const notifications = [
  {
    id: idCount,
    message: 'Notification message',
  },
]

const resolvers = {
  Query: {
    notifications: () => notifications,
  },
  Mutation: {
    addNotification: async (
      _root: {},
      { message }: { message: string },
      { pubsub }: Context
    ) => {
      const id = idCount++
      const notification = {
        id,
        message,
      }
      notifications.push(notification)
      pubsub.publish({
        topic: 'NOTIFICATION_ADDED',
        payload: {
          notificationAdded: notification,
        },
      })

      return notification
    },
    badNotification: async (_root: {}, _args: {}, { pubsub }: Context) => {
      pubsub.publish({
        topic: 'NOTIFICATION_ADDED',
        payload: {},
      })
      return true
    },
  },
  Subscription: {
    notificationAdded: {
      // You can also subscribe to multiple topics at once using an array like this:
      //  pubsub.subscribe(['TOPIC1', 'TOPIC2'])
      subscribe: (_root: {}, _args: {}, { pubsub }: Context) => {
        return pubsub.subscribe('NOTIFICATION_ADDED')
      },
    },
  },
}

app.register(mercurius, {
  schema,
  resolvers,
  subscription: {
    async onConnect(_data) {
      // console.log(_data)
      return {}
    },
    verifyClient(_info, next) {
      // console.log(_info.req.headers);
      next(true)
    },
  },
  allowBatchedQueries: true,
})

tap
  .test('subscriptions with new listen', (t) => {
    t.plan(1)

    const client = createMercuriusTestClient(app)

    const subscription = client
      .subscribe({
        query: `
        subscription {
          notificationAdded {
            id
            message
          }
        }
        `,
        onData: (data) => {
          t.equivalent(data, {
            data: {
              notificationAdded: {
                id: 1,
                message: 'hello world',
              },
            },
          })
          subscription.then((sub) => {
            sub.unsubscribe()
          })
        },
        initPayload: {
          a: 123,
        },
        cookies: {
          a: '1',
          b: '2',
        },
        headers: {
          c: '3',
          d: '4',
        },
      })
      .then((sub) => {
        client
          .mutate(
            `
   mutation {
       addNotification(message: "hello world") {
        id
        message
    }
   }
   `
          )
          .catch(console.error)

        return sub
      })
  })
  .then(() => {
    tap
      .test('subscriptions reusing listen', (t) => {
        t.plan(1)

        const client = createMercuriusTestClient(app)

        const subscription = client
          .subscribe({
            query: gql`
              subscription {
                notificationAdded {
                  id
                  message
                }
              }
            `,
            onData: (data) => {
              t.equivalent(data, {
                data: {
                  notificationAdded: {
                    id: 2,
                    message: 'hello world',
                  },
                },
              })
              subscription.then((sub) => {
                sub.unsubscribe()
              })
            },
          })
          .then((sub) => {
            client
              .mutate(
                `
     mutation {
         addNotification(message: "hello world") {
          id
          message
      }
     }
     `
              )

              .catch(console.error)

            return sub
          })
      })
      .then(() => {
        tap
          .test('error handling', (t) => {
            t.plan(4)
            const client = createMercuriusTestClient(app)
            t.rejects(
              client.subscribe({
                query: {} as any,
                onData() {},
              }),
              Error('Invalid AST Node')
            )

            const errorClient = createMercuriusTestClient({} as any)

            t.rejects(
              errorClient.subscribe({
                query: '',
                onData(_data) {},
              }),
              Error('Invalid Fastify Instance')
            )

            client
              .subscribe({
                query: `
              subscription {
                notificationAdded {
                  id
                  message
                }
              }
              `,
                onData(response) {
                  t.equivalent(response, {
                    data: null,
                    errors: [
                      {
                        message:
                          'Cannot return null for non-nullable field Subscription.notificationAdded.',
                        locations: [
                          {
                            line: 3,
                            column: 17,
                          },
                        ],
                        path: ['notificationAdded'],
                      },
                    ],
                  })
                },
              })
              .then(() => {
                client
                  .mutate<{
                    badNotification: boolean
                  }>(
                    `
              mutation {
                badNotification
              }
              `
                  )
                  .then((resp) => {
                    t.equivalent(resp, {
                      data: {
                        badNotification: true,
                      },
                    })
                  })
              })
          })
          .then(() => {
            app.close()
          })
      })
  })
