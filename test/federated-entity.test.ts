import { mercuriusFederationPlugin } from '@mercuriusjs/federation'
import { fastify } from 'fastify'
import mercurius from 'mercurius'
import { test } from 'node:test'

import { createMercuriusTestClient } from '../src'

test('returns single-key federated entity', async (t) => {
  const schema = `
    type Post @key(fields: "id") {
      id: ID! @external
      description: String!
    }
  
    extend type User @key(fields: "id") {
      id: ID! @external
      posts: [Post!]!
    }
  `

  const app = fastify()
  app.register(mercuriusFederationPlugin, {
    schema,
    resolvers: {
      User: {
        posts: () => [{ id: 'post-id', description: 'Post description' }],
      },
    },
  })

  const client = createMercuriusTestClient(app)

  t.assert.deepStrictEqual(
    await client.getFederatedEntity({
      typename: 'User',
      keys: { id: 'user1' },
      typeQuery: `
        id
        posts {
          id
          description
        }`,
    }),
    {
      __typename: 'User',
      id: 'user1',
      posts: [
        {
          id: 'post-id',
          description: 'Post description',
        },
      ],
    }
  )
})

test('returns multi-key federated entity', async (t) => {
  const schema = `
      type ProductCategory {
        id: ID!
        name: String!
      }
    
      extend type Product @key(fields: "sku") @key(fields: "upc") {
        upc: String! @external
        sku: Int! @external
        category: ProductCategory
      }
    `

  const app = fastify()
  app.register(mercuriusFederationPlugin, {
    schema,
    resolvers: {
      Product: {
        category: () => ({ id: 'product-category', name: 'Stub category' }),
      },
    },
  })

  const client = createMercuriusTestClient(app)

  t.assert.deepStrictEqual(
    await client.getFederatedEntity({
      typename: 'Product',
      keys: { sku: 1, upc: 'upc' },
      typeQuery: `
          upc
          sku
          category {
            id
            name
          }`,
    }),
    {
      __typename: 'Product',
      upc: 'upc',
      sku: 1,
      category: {
        id: 'product-category',
        name: 'Stub category',
      },
    }
  )
})

test('throws if service is not federated', async (t) => {
  const schema = `
    type Post @key(fields: "id") {
      id: ID! @external
      description: String!
    }
  
    extend type User @key(fields: "id") {
      id: ID! @external
      posts: [Post!]!
    }
  `

  const app = fastify()
  app.register(mercurius, {
    schema,
    resolvers: {
      User: {
        posts: () => [{ id: 'post-id', description: 'Post description' }],
      },
    },
  })

  const client = createMercuriusTestClient(app)

  await t.assert.rejects(
    client.getFederatedEntity({
      typename: 'User',
      keys: { id: 'user1' },
      typeQuery: `
        id
        posts {
          id
          description
        }`,
    }),
    Error('Service is not federated')
  )
})

test('throws if entity is not federated', async (t) => {
  const schema = `
      type Post @key(fields: "id") {
        id: ID! @external
        description: String!
      }
    
      extend type User @key(fields: "id") {
        id: ID! @external
        posts: [Post!]!
      }
    `

  const app = fastify()
  app.register(mercuriusFederationPlugin, {
    schema,
    resolvers: {
      User: {
        posts: () => [{ id: 'post-id', description: 'Post description' }],
      },
    },
  })

  const client = createMercuriusTestClient(app)

  await t.assert.rejects(
    client.getFederatedEntity({
      typename: 'NotFederated',
      keys: { id: 'not-important' },
      typeQuery: `
          __typename`,
    })
  )
})
