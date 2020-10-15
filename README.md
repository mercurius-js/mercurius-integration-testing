# mercurius-integration-testing

[![npm version](https://badge.fury.io/js/mercurius-integration-testing.svg)](https://badge.fury.io/js/mercurius-integration-testing) [![codecov](https://codecov.io/gh/PabloSzx/mercurius-integration-testing/branch/master/graph/badge.svg)](https://codecov.io/gh/PabloSzx/mercurius-integration-testing)

```sh
yarn add mercurius-integration-testing
# or
npm install mercurius-integration-testing
```

## Features

- **query**, **mutation** & **subscription** support.
- **DocumentNode** and **string** support
- **TypeScript** support
- **batchQueries** support.
- **headers** management.
- **cookies** management.

## Table of Contents

- [mercurius-integration-testing](#mercurius-integration-testing)
  - [Features](#features)
  - [Table of Contents](#table-of-contents)
  - [Usage](#usage)
  - [API](#api)
    - [createMercuriusTestClient](#createmercuriustestclient)
      - [query, mutate](#query-mutate)
        - [DocumentNode support](#documentnode-support)
        - [Variables](#variables)
        - [Other options](#other-options)
      - [setHeaders](#setheaders)
      - [setCookies](#setcookies)
      - [batchQueries](#batchqueries)
      - [subscribe](#subscribe)
      - [TypeScript](#typescript)
  - [License](#license)

## Usage

```ts
// app.ts | app.js
import Fastify from "fastify";
import Mercurius from "mercurius";
import schema from "./schema";
import { buildContext } from "./buildContext";

export const app = Fastify();

app.register(Mercurius, {
  schema,
  resolvers: {},
  context: buildContext,
  allowBatchedQueries: true,
});
```

```ts
// integration.test.js | integration.test.ts

import { createMercuriusTestClient } from "mercurius-integration-testing";
import { app } from "../app";

// ...

const testClient = createMercuriusTestClient(app);

expect(testClient.query("query { helloWorld }")).resolves.toEqual({
  data: {
    helloWorld: "helloWorld",
  },
});
```

## API

### createMercuriusTestClient

Create a testing client instance, you should give it the fastify instance in which Mercurius was already registered, and optionally, some options

```ts
const client = createMercuriusTestClient(app, {
  /**
   * Optional, specify headers to be added to every request in the client
   */
  headers: {
    authorization: "hello-world",
  },
  /**
   * Optional, by default it points to /graphql
   */
  url: "/graphql",
  /**
   * Optional, specify cookies to be added to every request in the client
   */
  cookies: {
    authorization: "hello-world",
  },
});
```

#### query, mutate

> `.query` and `.mutate` are basically the same function, but for readability, both exists

```ts
// You can give it a simple string
const queryResponse = await client.query(`
query {
  helloWorld
}
`);

// Data returned from the API
queryResponse.data;

// Possible array of errors from the API
queryResponse.errors;

// You can also call `mutate`
// to improve readability for mutations
const mutationResponse = await client.mutate(`
mutation {
  helloWorld
}
`);
```

##### DocumentNode support

```ts
// You can also give them `DocumentNode`s
// from `graphql-tag` or equivalents
await client.query(gql`
  query {
    helloWorld
  }
`);
```

##### Variables

```ts
// You can give variables in the second parameter options
await client.query(
  `
  query($foo: String!) {
    hello(foo: $foo)
  }
`,
  {
    variables: {
      foo: "bar",
    },
  }
);
```

##### Other options

```ts
await client.query(
  `
  query example {
    helloExample
  }
`,
  {
    // You can specify operation name if the queries
    // are named
    operationName: "helloExample",
    // Query specific headers
    // These are going to be "merged" with the client set headers
    headers: {
      hello: "world",
    },

    // Query specific cookies
    // These are going to be "merged" with the client set headers
    cookies: {
      foo: "bar",
    },
  }
);
```

#### setHeaders

You can change the default client headers whenever

```ts
client.setHeaders({
  authorization: "other-header",
});
```

#### setCookies

You can change the default client cookies whenever

```ts
client.setCookies({
  authorization: "other-cookie",
});
```

#### batchQueries

If `allowBatchedQueries` is set in the Mercurius registration, you can call some queries together

```ts
const batchedResponse = await client.batchQueries(
  [
    {
      query: `
  query {
    helloWorld
  }
  `,
    },
    {
      query: `
  query($name: String!) {
    user(name: $name) {
      email
    }
  }
  `,
      variables: {
        name: "bob",
      },
      // operationName: "you-can-specify-it-here-if-needed"
    },
  ],
  // Optional
  {
    // Optional request specific cookies
    cookies: {
      foo: "bar",
    },
    // Optional request specific headers
    headers: {
      foo: "bar",
    },
  }
);

batchedResponse ===
  [{ data: { helloWorld: "foo" } }, { data: { user: { email: "hello@world.com" } } }];
```

#### subscribe

> If you are not already calling `.listen(PORT)` somewhere, it will automatically call it, assigning a random available port, this means you will have to manually call `.close()` somewhere

> `.subscribe` returns a promise that resolves when the subscription connection is made

```ts
const subscription = await client.subscribe({
  query: `
  subscription {
    notificationAdded {
      id
      message
    }
  }
  `,
  onData(data) {
    data == { notificationAdded: { id: 1, message: "hello world" } };
  },
  // variables: { foo: "bar" }
  // initPayload: { authorization: "your_token" }
});

// You can manually call the unsubscribe

subscription.unsubscribe();

// You will need to manually close the fastify instance somewhere

app.close();
```

#### TypeScript

```ts
const dataResponse = await client.query<{
  helloWorld: string;
}>(`
query {
  helloWorld
}
`);

// string
dataResponse.data.helloWorld;

const variablesResponse = await client.query<
  {
    user: {
      email: string;
    };
  },
  {
    name: string;
  }
>(
  `
  query($name: String!) {
    user(name: $name) {
      email
    }
  }
`,
  {
    variables: {
      name: "bob",
    },
  }
);

// string
variablesResponse.data.user.email;

await client.subscribe<
  {
    helloWorld: string;
  },
  {
    foo: string;
  }
>({
  query: `
  subscription($foo: String!) {
    helloWorld(foo: $foo)
  }
  `,
  variables: {
    // Error, Type 'number' is not assignable to type 'string'.
    foo: 123,
  },
  onData(data) {
    // string
    data.helloWorld;
  },
});
```

## License

MIT
