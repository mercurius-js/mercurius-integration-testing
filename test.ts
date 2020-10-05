import Fastify from "fastify";

import { createMercuriusTestClient } from "./index";

const app = Fastify();

const testclient = createMercuriusTestClient(app);

testclient.query("");

testclient.query("", {});

testclient.mutate("", {});

testclient.batchQueries([{ query: "", variables: {}, operationName: "" }, { query: "" }]);

testclient.headers;

testclient.cookies;

testclient.setHeaders({});

testclient.setCookies({});
