# fastify-gql-integration-testing

[![npm version](https://badge.fury.io/js/fastify-gql-integration-testing.svg)](https://badge.fury.io/js/fastify-gql-integration-testing)

```sh
yarn add fastify-gql-integration-testing
# or
npm install fastify-gql-integration-testing
```

## Features

- **TypeScript** support
- **query** | **mutation**.
- **batchQueries**.
- **headers** management.
- **cookies** management.

## Usage

```ts
// app.ts | app.js
import Fastify from "fastify";
import GQL from "fastify-gql";
import schema from "./schema";
import { buildContext } from "./buildContext";

export const app = Fastify();

app.register(GQL, {
  schema,
  resolvers: {},
  context: buildContext,
});
```

```ts
// integration.test.js | integration.test.ts

import { createFastifyGQLTestClient } from "fastify-gql-integration-testing";
import { app } from "../app";

// ...

const testClient = createFastifyGQLTestClient(app);

expect(testClient.query("query { helloWorld }")).resolves.toEqual({
  data: {
    helloWorld: "helloWorld",
  },
});
```
