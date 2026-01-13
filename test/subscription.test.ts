import Fastify from 'fastify'
import gql from 'graphql-tag'
import mercurius, { IResolvers } from 'mercurius'
import { after, test } from 'node:test'

import { createMercuriusTestClient } from '../src'

const app = Fastify({
  logger: {
    level: 'error',
  },
})

// Types based on https://github.com/mercurius-js/mercurius/blob/master/lib/subscriber.js

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

const resolvers: IResolvers = {
  Query: {
    notifications: () => notifications,
  },
  Mutation: {
    addNotification: async (
      _root: {},
      { message }: { message: string },
      { pubsub }
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
    badNotification: async (_root: {}, _args: {}, { pubsub }) => {
      pubsub.publish({
        topic: 'NOTIFICATION_ADDED',
        payload: {},
      })
      return true
    },
  },
  Subscription: {
    notificationAdded: {
      subscribe: (_root: {}, _args: {}, { pubsub }) => {
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

after(() => app.close())

test('subscriptions with new listen', async t => {
  const client = createMercuriusTestClient(app)

  await new Promise<void>((resolve) => {
    let subscription: Promise<{ unsubscribe: () => void }>

    subscription = client
      .subscribe({
        query: `
        subscription firstNotification {
          notificationAdded {
            id
            message
          }
        }
        `,
        operationName: 'firstNotification',
        onData: (response) => {
          t.assert.deepStrictEqual(response, {
            data: {
              notificationAdded: {
                id: '1',
                message: 'hello world',
              },
            },
          })
          subscription.then((sub) => {
            sub.unsubscribe()
            resolve()
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
})

test('subscriptions reusing listen', async t => {
  const client = createMercuriusTestClient(app)

  await new Promise<void>((resolve) => {
    let subscription: Promise<{ unsubscribe: () => void }>

    subscription = client
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
          t.assert.deepStrictEqual(data, {
            data: {
              notificationAdded: {
                id: '2',
                message: 'hello world',
              },
            },
          })
          subscription.then((sub) => {
            sub.unsubscribe()
            resolve()
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
})

test('error handling', async t => {
  const client = createMercuriusTestClient(app)

  await t.assert.rejects(
    client.subscribe({
      query: {} as any,
      onData() {},
    }),
    /Invalid AST Node/
  )

  const errorClient = createMercuriusTestClient({} as any)

  await t.assert.rejects(
    errorClient.subscribe({
      query: 'subscription {}',
      onData(_data) {},
    }),
    Error('Invalid Fastify Instance')
  )

  await new Promise<void>((resolve) => {
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
          t.assert.deepStrictEqual(response, {
            data: null,
            errors: [
              {
                message:
                  'Cannot return null for non-nullable field Subscription.notificationAdded.',
                locations: [
                  {
                    line: 3,
                    column: 11,
                  },
                ],
                path: ['notificationAdded'],
              },
            ],
          })
          resolve()
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
            t.assert.deepStrictEqual(resp, {
              data: {
                badNotification: true,
              },
            })
          })
      })
  })
})
