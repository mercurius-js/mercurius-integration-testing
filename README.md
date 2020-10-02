# mercurius-integration-testing

[![npm version](https://badge.fury.io/js/mercurius-integration-testing.svg)](https://badge.fury.io/js/mercurius-integration-testing)

```sh
yarn add mercurius-integration-testing
# or
npm install mercurius-integration-testing
```

## Features

- **DocumentNode** and **string** support
- **TypeScript** support
- **query** | **mutation**.
- **batchQueries**.
- **headers** management.
- **cookies** management.

## Usage

```ts
// app.ts | app.js
import Fastify from "fastify";
import GQL from "mercurius";
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

import { createFastifyGQLTestClient } from "mercurius-integration-testing";
import { app } from "../app";

// ...

const testClient = createFastifyGQLTestClient(app);

expect(testClient.query("query { helloWorld }")).resolves.toEqual({
  data: {
    helloWorld: "helloWorld",
  },
});
```
