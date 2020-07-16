import Fastify from "fastify";

import { createFastifyGQLTestClient } from "./index";

const app = Fastify();

const testclient = createFastifyGQLTestClient(app);

testclient.query("");

testclient.query("", {});

testclient.mutate("", {});

testclient.batchQueries([{ query: "", variables: {}, operationName: "" }, { query: "" }]);

testclient.headers;

testclient.cookies;

testclient.setHeaders({});

testclient.setCookies({});
